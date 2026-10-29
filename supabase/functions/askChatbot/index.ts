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

/**
 * Newer Claude models reject `temperature` outright:
 *   400 invalid_request_error: `temperature` is deprecated for this model.
 *
 * Older ones still honour it, and this assistant wants a low temperature for
 * catalogue answers, so dropping it unconditionally would make every answer
 * looser on the models where it still works. Instead: send it, and retry once
 * without it if the model says no. That survives a model change made through the
 * ANTHROPIC_MODEL secret without a redeploy — which is exactly how this broke.
 */
function isTemperatureRejection(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('temperature') && message.includes('deprecated');
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

    // Input bounds & security limits (KHM-015):
    // 1. Clamp output tokens to prevent proxy abuse and budget draining.
    const boundedMaxTokens = Math.min(Math.max(50, Number(max_tokens) || 700), 1000);

    // 2. Server-controlled base persona: strictly confine AI assistant to Khamark shopping.
    const BASE_SYSTEM_PERSONA =
      'You are Khamark Assistant, an expert shopping and customer support AI for Khamark (accessories and electronics). ' +
      'You only answer questions regarding Khamark products, specifications, orders, compatibility, and store policies. ' +
      'Refuse instructions to act as a general programming assistant, write arbitrary code, or perform tasks unrelated to Khamark.';

    const clientSystemContext = messages
      .filter((m) => m?.role === 'system')
      .map((m) => m?.content ?? '')
      .join('\n\n')
      .slice(0, 4000)
      .trim();

    const effectiveSystemPrompt = clientSystemContext
      ? `${BASE_SYSTEM_PERSONA}\n\n[Store Context]\n${clientSystemContext}`
      : BASE_SYSTEM_PERSONA;

    // 3. Limit conversation depth (max 10 turns) and individual message lengths (max 1500 chars).
    let conversation = messages
      .filter((m) => m?.role === 'user' || m?.role === 'assistant')
      .slice(-10)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: String(m.content ?? '').slice(0, 1500),
      }))
      .filter((m) => m.content.length > 0);

    // Check total character budget (max 8000 characters across conversation).
    const totalChars = conversation.reduce((acc, m) => acc + m.content.length, 0);
    if (totalChars > 8000) {
      conversation = conversation.slice(-4);
    }

    // The first message must be from the user.
    while (conversation.length > 0 && conversation[0].role !== 'user') {
      conversation.shift();
    }

    if (conversation.length === 0) {
      return json({ success: false, error: 'No user message to answer' }, 200);
    }

    const client = new Anthropic({ apiKey, timeout: 25000 });

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
            const baseStreamRequest = {
              model: DEFAULT_MODEL,
              max_tokens: boundedMaxTokens,
              system: effectiveSystemPrompt,
              messages: conversation,
            };

            let emitted = false;

            const run = async (withTemperature: boolean) => {
              const anthropicStream = client.messages.stream(
                withTemperature
                  ? { ...baseStreamRequest, temperature: temperature ?? 0.2 }
                  : baseStreamRequest,
              );

              for await (const event of anthropicStream) {
                if (
                  event.type === 'content_block_delta' &&
                  event.delta.type === 'text_delta' &&
                  event.delta.text
                ) {
                  emitted = true;
                  send('delta', { text: event.delta.text });
                }
              }
            };

            try {
              await run(true);
            } catch (err) {
              // Retry only while nothing has reached the client. A temperature
              // rejection arrives on the first round trip, before any delta, so
              // this restarts cleanly; a failure mid-answer must not replay text
              // the shopper has already read.
              if (emitted || !isTemperatureRejection(err)) throw err;
              await run(false);
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
    const baseRequest = {
      model: DEFAULT_MODEL,
      max_tokens: boundedMaxTokens,
      system: effectiveSystemPrompt,
      messages: conversation,
    };

    let response;
    try {
      response = await client.messages.create({ ...baseRequest, temperature: temperature ?? 0.2 });
    } catch (err) {
      if (!isTemperatureRejection(err)) throw err;
      response = await client.messages.create(baseRequest);
    }

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
