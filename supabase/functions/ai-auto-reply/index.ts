// =============================================================================
// Supabase Edge Function: ai-auto-reply
// =============================================================================
// Answers a customer in the store chat when the shop has not replied. Fires on
// INSERT into `messages` via a Database Webhook, waits QUIET_MS for a human to
// take the conversation, and only then writes a Claude-generated reply.
//
// Deliberately a SEPARATE function from on-db-change. That one delivers push
// notifications on the same INSERT and already works; keeping them apart means a
// failure here can never cost the shop a notification.
//
// SETUP:
//   1. supabase secrets set ANTHROPIC_API_KEY="sk-ant-..."     (already set)
//   2. supabase functions deploy ai-auto-reply --no-verify-jwt
//      (--no-verify-jwt because the DB webhook authenticates with the
//       service-role key in the Authorization header, as on-db-change does.)
//   3. Dashboard -> Database -> Webhooks -> Create:
//        Name: ai_auto_reply | Table: messages | Events: Insert
//        Type: Supabase Edge Function -> ai-auto-reply
//
// Turn it off without redeploying: supabase secrets set AI_AUTO_REPLY=off
// =============================================================================

import Anthropic from 'npm:@anthropic-ai/sdk@^0.117.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// How long the shop gets to answer before the assistant steps in.
const QUIET_MS = Number(Deno.env.get('AI_QUIET_MS') ?? 30_000);
// Conversation turns sent as context. Small on purpose — the catalogue is the
// expensive part of the prompt and history past this rarely changes an answer.
const HISTORY_LIMIT = 12;
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5';
const ASSISTANT_NAME = Deno.env.get('AI_ASSISTANT_NAME') || 'Asankary Assistant';

interface WebhookPayload {
  type: string;
  table: string;
  record?: Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req: Request) => {
  // Always 200. A webhook that sees an error status will retry, and a retry here
  // means a second reply to the same customer.
  const ok = (note: string) =>
    new Response(JSON.stringify({ ok: true, note }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    if (Deno.env.get('AI_AUTO_REPLY') === 'off') return ok('disabled');

    const payload = (await req.json().catch(() => ({}))) as WebhookPayload;
    if (payload?.type !== 'INSERT' || payload?.table !== 'messages') {
      return ok('not a message insert');
    }

    const msg = payload.record ?? {};
    const conversationId = String(msg.conversation_id ?? '');
    const messageId = String(msg.id ?? '');
    const senderType = String(msg.sender_type ?? '');

    // Only answer customers. Without this the assistant would reply to its own
    // message and loop, because its insert fires this same webhook.
    if (senderType !== 'user' || !conversationId || !messageId) {
      return ok('not a customer message');
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return ok('no ANTHROPIC_API_KEY');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      // Service role: `messages` and `conversations` are behind RLS, and this
      // function must read a conversation it is not a participant in.
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // Do the waiting after the response is returned, so the webhook is not held
    // open for QUIET_MS and cannot time out mid-wait.
    const work = async () => {
      await sleep(QUIET_MS);

      const { data: conversation } = await supabase
        .from('conversations')
        .select('id, admin_id, user_id, is_blocked')
        .eq('id', conversationId)
        .maybeSingle();

      if (!conversation || conversation.is_blocked) return;

      // Re-read the tail. Anything newer than the message that triggered this
      // run means the situation changed while we waited: the shop answered, or
      // the customer kept typing and a later run will handle the fuller question.
      const { data: recent } = await supabase
        .from('messages')
        .select('id, sender_type, sender_name, text, type, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT);

      const history = recent ?? [];
      if (history.length === 0) return;
      if (history[0].id !== messageId) return; // superseded — stay quiet

      // The whole catalogue. At this size sending it beats retrieval: it is a
      // few hundred tokens, it cannot miss a relevant product, and it keeps the
      // answer honest about stock and price.
      const { data: products } = await supabase
        .from('parts')
        .select('name, brand, category, price_usd, price_iqd, stock_qty, status, description')
        .limit(200);

      // Most customers here ask in dinar, so give the model both figures rather
      // than a dollar price it would have to convert itself — and it is told
      // below never to do arithmetic on a price.
      //
      // A product priced in dinar (price_iqd set) carries that exact figure; the
      // dollar column is derived from it. One priced in dollars gets its dinar
      // figure the way the app renders it: x rate, rounded to the nearest 250.
      // Read the live rate the app itself uses, rather than an env var that would
      // silently go stale the first time the shop edits it in Currency Settings.
      const { data: settingsRow } = await supabase
        .from('global_settings')
        .select('data')
        .eq('id', 'business_info')
        .maybeSingle();
      const exchangeRate = Number((settingsRow?.data as Record<string, unknown> | null)?.exchangeRateIQD) || 1500;
      const toIQD = (usd: number) => Math.round((usd * exchangeRate) / 250) * 250;

      const catalogue = (products ?? [])
        .map((p) => {
          const inStock = (p.status === null || p.status === 'available') && Number(p.stock_qty) > 0;
          const usd = Number(p.price_usd) || 0;
          const iqd = p.price_iqd != null ? Number(p.price_iqd) : toIQD(usd);
          const price = `$${usd.toFixed(2)} / ${iqd.toLocaleString('en-US')} IQD`;
          return `- ${p.name}${p.brand ? ` (${p.brand})` : ''} — ${price} — ${inStock ? 'in stock' : 'out of stock'}${p.category ? ` — ${p.category}` : ''}`;
        })
        .join('\n');

      const system = [
        `You are ${ASSISTANT_NAME}, answering for Asankary, a phone and accessories shop in Erbil, Iraq.`,
        'The shop owner has not replied yet, so you are answering on their behalf.',
        '',
        'Rules:',
        '- Reply in the SAME language the customer used. Arabic gets Arabic, Kurdish Sorani gets Kurdish Sorani, English gets English.',
        '- Keep it short — one or two sentences, the way a shop replies on WhatsApp.',
        '- Only state prices and stock from the list below. Never invent a product, a price, or a delivery date.',
        '- Each product lists both a dollar and a dinar price. Quote whichever the customer asked in, copied EXACTLY as written. Never convert between them yourself and never round — the dinar figure is the price the shop set, not a conversion.',
        "- If you don't know, say the shop will confirm shortly. Do not guess.",
        '- Never promise a discount, a refund, or a delivery time.',
        '- You are an assistant, not the owner. If asked to agree a deal, say the owner will confirm.',
        '',
        catalogue ? `Products currently listed:\n${catalogue}` : 'The product list is unavailable right now.',
      ].join('\n');

      // Oldest-first for the model; the query returned newest-first.
      const turns = [...history].reverse().map((m) => {
        let content = String(m.text ?? '').trim();
        if (!content) {
          if (m.type === 'image') content = '(customer sent an image)';
          else if (m.type === 'product') content = '(customer sent a product card)';
          else if (m.type === 'order') content = '(customer sent an order summary)';
          else if (m.type === 'file') content = '(customer sent a file)';
        }
        return {
          role: m.sender_type === 'user' ? ('user' as const) : ('assistant' as const),
          content,
        };
      }).filter((t) => t.content.length > 0);

      while (turns.length > 0 && turns[0].role !== 'user') turns.shift();
      if (turns.length === 0) return;

      const claude = new Anthropic({ apiKey });

      // Newer Claude models reject `temperature` outright:
      //   400 invalid_request_error: `temperature` is deprecated for this model.
      //
      // MODEL comes from the ANTHROPIC_MODEL secret, so changing that secret —
      // which needs no deploy and therefore warns nobody — can break this
      // function without a single line of code changing. It already did: the
      // shop moved to claude-sonnet-5 for better Kurdish, and every automatic
      // reply to a customer silently 400'd from that moment.
      //
      // Send it, retry once without it. Older models still honour a low
      // temperature, which this function wants for factual catalogue answers.
      const baseRequest = {
        model: MODEL,
        max_tokens: 400,
        system,
        messages: turns,
      };

      let response;
      try {
        response = await claude.messages.create({ ...baseRequest, temperature: 0.2 });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!(message.includes('temperature') && message.includes('deprecated'))) throw err;
        response = await claude.messages.create(baseRequest);
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();

      if (!text) return;

      // Final check before writing — the wait above plus the model call is a few
      // seconds more in which the shop may have answered.
      const { data: stillLatest } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!stillLatest || stillLatest.id !== messageId) return;

      await supabase.from('messages').insert([
        {
          conversation_id: conversationId,
          sender_id: conversation.admin_id ?? 'ai-bot',
          sender_type: 'admin',
          sender_name: ASSISTANT_NAME,
          type: 'text',
          text,
        },
      ]);
    };

    // Supabase's background-task API; falls back to awaiting if unavailable.
    const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (runtime?.waitUntil) {
      runtime.waitUntil(work().catch((e) => console.error('ai-auto-reply:', e)));
      return ok('scheduled');
    }
    await work().catch((e) => console.error('ai-auto-reply:', e));
    return ok('completed inline');
  } catch (err) {
    console.error('ai-auto-reply fatal:', err);
    return ok('error handled');
  }
});
