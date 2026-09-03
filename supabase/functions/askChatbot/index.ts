// =============================================================================
// Supabase Edge Function: askChatbot
// =============================================================================
// Thin Claude proxy for the in-app AI assistant. The CLIENT (chatbotService.ts)
// already does the heavy lifting — it builds the system prompt, retrieves product
// context (RAG), and assembles the full message array. This function only forwards
// that to Anthropic and returns the assistant text, keeping the API key
// server-side. It must never move into the app: anything shipped in the binary can
// be extracted from any install.
//
// Previously proxied OpenAI (gpt-4.1-mini). Switched to Claude so the shop needs
// one AI account rather than two — visual search was separately on Google Gemini.
//
// SETUP (one-time, with your Supabase login):
//   supabase secrets set ANTHROPIC_API_KEY="sk-ant-..."
//   # optional: supabase secrets set ANTHROPIC_MODEL="claude-haiku-4-5"
//   supabase functions deploy askChatbot
//
// Request body (sent by safeCallFunction): { data: { messages, max_tokens, temperature } }
//   `messages` is OpenAI-shaped — messages[0] is a { role: 'system' } entry. That
//   shape is the client's, and is converted below rather than changed, so the app
//   does not need a rebuild to adopt this function.
// Response: { success: boolean, text?: string, error?: string }
//
// NOTE on the model: claude-haiku-4-5 answers concrete catalogue questions well at
// roughly a fifth of Opus's price. It does NOT accept the `effort` parameter (400)
// and has no adaptive thinking — neither appears below. Both become available if
// ANTHROPIC_MODEL is set to claude-sonnet-5 or claude-opus-5.
// =============================================================================

import Anthropic from 'npm:@anthropic-ai/sdk@^0.117.1';

const DEFAULT_MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5';

interface IncomingMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

Deno.serve(async (req: Request) => {
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return json({ success: false, error: 'AI service is not configured' }, 200);
    }

    // safeCallFunction wraps the payload as { data: {...} }
    const body = await req.json().catch(() => ({}));
    const payload = body?.data ?? body ?? {};
    const { messages, max_tokens, temperature, stream } = payload as {
      messages?: IncomingMessage[];
      max_tokens?: number;
      temperature?: number;
      stream?: boolean;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ success: false, error: 'messages[] is required' }, 200);
    }

    // Anthropic takes the system prompt as its own top-level field rather than a
    // message. Keeping it out of the conversation also means a customer cannot
    // overwrite the persona by quoting instructions back at the bot.
    const systemPrompt = messages
      .filter((m) => m?.role === 'system')
      .map((m) => m?.content ?? '')
      .join('\n\n')
      .trim();

    const conversation = messages
      .filter((m) => m?.role === 'user' || m?.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content ?? '') }))
      .filter((m) => m.content.length > 0);

    // The first message must be from the user. Trimmed history can begin on an
    // assistant turn, so drop leading assistant turns rather than erroring —
    // they are context the model produced, not the question being asked.
    while (conversation.length > 0 && conversation[0].role !== 'user') {
      conversation.shift();
    }

    if (conversation.length === 0) {
      return json({ success: false, error: 'No user message to answer' }, 200);
    }

    const client = new Anthropic({ apiKey });

    // STREAMING BRANCH.
    //
    // Taken only when the caller explicitly asks for it. Every line below this
    // block runs exactly as it did before, which is what keeps aiProductFill and
    // the admin AI out of the blast radius of this change.
    if (stream === true) {
      const sse = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const send = (event: string, data: unknown) =>
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

          try {
            const anthropicStream = client.messages.stream({
              model: DEFAULT_MODEL,
              max_tokens: max_tokens ?? 700,
              temperature: temperature ?? 0.2,
              ...(systemPrompt ? { system: systemPrompt } : {}),
              messages: conversation,
            });

            for await (const event of anthropicStream) {
              if (
                event.type === 'content_block_delta' &&
                event.delta.type === 'text_delta' &&
                event.delta.text
              ) {
                send('delta', { text: event.delta.text });
              }
            }

            send('done', {});
          } catch (streamErr) {
            // By this point the client may already be showing partial text, so an
            // error EVENT is more useful than a status code it will never read.
            const message = streamErr instanceof Error ? streamErr.message : String(streamErr);
            send('error', { error: message });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(sse, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // presence_penalty and top_p are deliberately not forwarded. Anthropic has no
    // presence_penalty, and its guidance is to set at most one of temperature or
    // top_p — the client sends both, so temperature alone is used.
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: max_tokens ?? 700,
      temperature: temperature ?? 0.2,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: conversation,
    });

    // content is a discriminated union and a turn may hold several text blocks,
    // so filter and join rather than reading content[0].
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!text) {
      return json({ success: false, error: 'Empty AI response' }, 200);
    }

    return json({ success: true, text }, 200);
  } catch (err) {
    // Always HTTP 200 with success:false — the client reads data.success, and a
    // non-2xx would surface to the shopper as a network error instead of a
    // handled one.
    const message = err instanceof Error ? err.message : String(err);
    return json({ success: false, error: message }, 200);
  }
});
