import { safeCallFunction } from './safeCallFunction';
import { AiProductDraft, parseProductDraft } from '../utils/aiProductDraft';

export type { AiProductDraft, AiTextField } from '../utils/aiProductDraft';
export { parseProductDraft, mergeDraft } from '../utils/aiProductDraft';

/**
 * Fill a product form from its name, using the shop's existing Claude function.
 *
 * There is no new Edge Function here on purpose: `askChatbot` is a generic
 * passthrough — caller supplies a system prompt and messages, it returns text —
 * so this needs no deploy and no new secret.
 *
 * The model produces a DRAFT. Nothing is saved, nothing leaves the form, and
 * every field it writes stays editable. It is a typing aid, not an author.
 */

const SYSTEM_PROMPT = `You fill in a product listing for a phone and accessory shop in Erbil, Iraq.

You are given a product name and whatever else the shop has already typed. Reply with ONE JSON object and nothing else — no prose, no code fence, no explanation.

Keys, all optional — omit any you are not confident about:
  "name"           corrected/completed English name
  "nameAr"         the name in Arabic
  "nameKu"         the name in Kurdish (Sorani)
  "description"    2-3 plain sentences in English. What it is, who it suits, what stands out. No marketing superlatives, no invented prices, no invented warranty.
  "descriptionAr"  the same description in Arabic
  "descriptionKu"  the same description in Kurdish (Sorani)
  "brand"          the manufacturer, e.g. Samsung, Honor, Anker
  "category"       one of the shop's categories if you are given the list, otherwise a short sensible one
  "specifications" a flat object of short string values, e.g. {"RAM":"8GB","Storage":"256GB","Screen":"6.7\\" AMOLED","Battery":"5000mAh","Chipset":"...","Camera":"...","OS":"Android 14","Cable":"USB-C"}

Rules:
- NEVER invent a price, a stock quantity, a warranty period or an availability claim. Those are the shop's, not yours.
- If you do not know a specification for this exact model, leave it out. A wrong spec is worse than a missing one, because the shop will be held to it.
- Keep Arabic and Kurdish natural, not transliterated English.
- Specification values are short: "8GB", not "The device has 8GB of RAM".`;

export interface ProductFillContext {
  name: string;
  brand?: string;
  category?: string;
  categories?: string[];
  notes?: string;
}

/**
 * Ask for a draft. Throws with a message meant to be shown to the admin — every
 * failure here is recoverable by them typing the fields themselves.
 */
export const fetchProductDraft = async (ctx: ProductFillContext): Promise<AiProductDraft> => {
  const name = (ctx.name || '').trim();
  if (!name) throw new Error('NO_NAME');

  const lines = [`Product name: ${name}`];
  if (ctx.brand?.trim()) lines.push(`Brand the shop already chose: ${ctx.brand.trim()}`);
  if (ctx.category?.trim()) lines.push(`Category the shop already chose: ${ctx.category.trim()}`);
  if (ctx.categories?.length) lines.push(`The shop's categories: ${ctx.categories.join(', ')}`);
  if (ctx.notes?.trim()) lines.push(`Extra detail from the shop: ${ctx.notes.trim()}`);

  const response = (await safeCallFunction('askChatbot', {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: lines.join('\n') },
    ],
    max_tokens: 1200,
    temperature: 0.3,
  })) as { data?: { success?: boolean; text?: string; error?: string } };

  const data = response?.data;
  if (!data?.success || !data?.text) {
    throw new Error(data?.error || 'AI_FAILED');
  }

  const draft = parseProductDraft(data.text);
  if (!draft || Object.keys(draft).length === 0) throw new Error('AI_UNPARSEABLE');
  return draft;
};
