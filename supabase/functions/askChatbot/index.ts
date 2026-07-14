// =============================================================================
// Supabase Edge Function: askChatbot
// =============================================================================
// Thin OpenAI proxy for the in-app AI assistant. The CLIENT (chatbotService.ts)
// already does all the heavy lifting — it builds the system prompt, retrieves
// product context (RAG), and assembles the full OpenAI `messages` array. This
// function only forwards that to OpenAI and returns the assistant text, keeping
// the OPENAI_API_KEY server-side. Replaces the old Firebase `askChatbot`.
//
// SETUP (one-time, with your Supabase login):
//   supabase secrets set OPENAI_API_KEY="sk-..."
//   # optional: supabase secrets set OPENAI_MODEL="gpt-4.1-mini"
//   supabase functions deploy askChatbot
//
// Request body (sent by safeCallFunction): { data: { messages, max_tokens, temperature, top_p, presence_penalty } }
// Response: { success: boolean, text?: string, error?: string }
// =============================================================================

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini';

Deno.serve(async (req: Request) => {
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return json({ success: false, error: 'AI service is not configured' }, 200);
    }

    // safeCallFunction wraps the payload as { data: {...} }
    const body = await req.json().catch(() => ({}));
    const payload = body?.data ?? body ?? {};
    const { messages, max_tokens, temperature, top_p, presence_penalty } = payload;

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ success: false, error: 'messages[] is required' }, 200);
    }

    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        max_tokens: max_tokens ?? 700,
        temperature: temperature ?? 0.2,
        top_p: top_p ?? 0.9,
        presence_penalty: presence_penalty ?? 0,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json({ success: false, error: data?.error?.message || 'OpenAI request failed' }, 200);
    }

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return json({ success: false, error: 'Empty AI response' }, 200);
    }

    return json({ success: true, text }, 200);
  } catch (err) {
    return json({ success: false, error: String(err) }, 200);
  }
});
