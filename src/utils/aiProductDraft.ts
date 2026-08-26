/**
 * Turning a model's reply into a product draft, and applying it to a form.
 *
 * Pure on purpose — no Supabase, no React — so the parsing and merging rules can
 * be tested directly. This repo has no jest preset, so anything that reaches the
 * Supabase client cannot be unit-tested at all, and these are exactly the rules
 * that must not be trusted to a read-through.
 */
/** The only fields the model is allowed to fill. Everything else is discarded. */
const TEXT_FIELDS = [
  'name',
  'nameAr',
  'nameKu',
  'description',
  'descriptionAr',
  'descriptionKu',
  'brand',
  'category',
] as const;

export type AiTextField = (typeof TEXT_FIELDS)[number];

export interface AiProductDraft {
  name?: string;
  nameAr?: string;
  nameKu?: string;
  description?: string;
  descriptionAr?: string;
  descriptionKu?: string;
  brand?: string;
  category?: string;
  specifications?: Record<string, string>;
}

/**
 * Pull a draft out of whatever the model actually said.
 *
 * Models wrap JSON in ```json fences, narrate before it, apologise after it, and
 * sometimes show an example object before the real one. Returns null rather than
 * throwing when there is nothing usable — the caller leaves the form untouched
 * and says so.
 */
export const parseProductDraft = (raw: string | null | undefined): AiProductDraft | null => {
  if (!raw || typeof raw !== 'string') return null;

  const candidates: string[] = [];

  // A fenced block, if there is one, is the most likely place for the answer.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1].trim());

  candidates.push(raw.trim());

  // Every balanced {...} run in the text, LAST first: a model that shows an
  // example and then gives its real answer puts the answer last.
  //
  // The scan MUST know about strings. A description like "Ships with a { free
  // case" is ordinary model output, and counting that brace left the depth
  // unbalanced: the real object was never captured and the narrated example
  // before it — the last run that did balance — was returned instead. Not a
  // parse failure the caller could see, but the wrong product silently filled in.
  {
    const found: string[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];

      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          found.push(raw.slice(start, i + 1));
          start = -1;
        } else if (depth < 0) {
          depth = 0;
          start = -1;
        }
      }
    }
    candidates.push(...found.reverse());
  }

  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    return sanitiseDraft(parsed as Record<string, unknown>);
  }

  return null;
};

/** Keep only known keys holding usable strings. Everything else goes. */
const sanitiseDraft = (obj: Record<string, unknown>): AiProductDraft => {
  const out: AiProductDraft = {};

  for (const field of TEXT_FIELDS) {
    const value = obj[field];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) out[field] = trimmed;
  }

  const specsRaw = obj.specifications;
  if (specsRaw && typeof specsRaw === 'object' && !Array.isArray(specsRaw)) {
    const specs: Record<string, string> = {};
    for (const [key, value] of Object.entries(specsRaw as Record<string, unknown>)) {
      const k = String(key).trim();
      if (!k) continue;
      // A number is a legitimate answer ("RAM": 8); an object or array is not.
      if (typeof value === 'string' || typeof value === 'number') {
        const v = String(value).trim();
        if (v) specs[k] = v;
      }
    }
    // An empty object would otherwise be reported to the admin as a change.
    if (Object.keys(specs).length > 0) out.specifications = specs;
  }

  return out;
};

/**
 * Apply a draft to the form without stepping on the admin's own typing.
 *
 * `overwrite` is the admin's explicit choice, taken after being told exactly how
 * many of their fields it would replace.
 */
export const mergeDraft = <T extends Record<string, any>>(
  current: T,
  draft: AiProductDraft,
  currentSpecs: Record<string, string>,
  overwrite: boolean,
): { merged: T; specs: Record<string, string>; filled: string[]; skipped: string[] } => {
  const merged: Record<string, any> = { ...current };
  const filled: string[] = [];
  const skipped: string[] = [];

  for (const field of TEXT_FIELDS) {
    const value = draft[field];
    if (!value) continue;
    const existing = String(merged[field] ?? '').trim();
    // Equality FIRST. A field the model agrees with is not a conflict, and
    // counting it as one told the admin their work would be replaced when the
    // two values were identical — a question with no meaningful answer.
    if (existing === value) continue;
    if (existing && !overwrite) {
      skipped.push(field);
      continue;
    }
    merged[field] = value;
    filled.push(field);
  }

  const specs: Record<string, string> = { ...currentSpecs };
  // Case-insensitive, because a model answering "cable" where the admin typed
  // "Cable" is the same specification, and treating them as two adds a duplicate
  // row that the shop then has to notice and delete.
  const keyByLower = new Map(Object.keys(specs).map(k => [k.trim().toLowerCase(), k]));
  for (const [key, value] of Object.entries(draft.specifications || {})) {
    const target = keyByLower.get(key.trim().toLowerCase()) ?? key;
    const existing = String(specs[target] ?? '').trim();
    if (existing === value) continue;
    if (existing && !overwrite) {
      skipped.push(target);
      continue;
    }
    specs[target] = value;
    keyByLower.set(target.trim().toLowerCase(), target);
    filled.push(target);
  }

  return { merged: merged as T, specs, filled, skipped };
};
