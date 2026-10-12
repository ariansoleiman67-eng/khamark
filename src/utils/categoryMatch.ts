/**
 * Category names are free text on both sides: the tile the shop creates in
 * Category Manager, and the `category` written on each product. They drift —
 * "Earphones" vs "Earphone", "Headsets" vs "headsets", a stray space — and an
 * exact compare treats each spelling as a different category. Live on
 * 2026-10-12: products filed under "Earphone" and "Headsets" had no managed
 * tile, so they showed as bare auto-tiles (no logo, no Arabic/Kurdish name) and
 * the shop's own "Heatset" tile sat empty beside them.
 *
 * These helpers make the app treat spelling variants as ONE category, and help
 * the admin pick the name the products already use. Deliberately conservative:
 * case, spacing and a plural "s" / "ies" only. Real typos ("Heatset" for
 * "Headsets") are not merged silently — they are SUGGESTED to the admin by
 * suggestCategory, who decides.
 */

const collapse = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Singular form of the LAST word: "power banks" -> "power bank", "accessories" -> "accessory". */
const singularLastWord = (s: string): string => {
  const words = s.split(' ');
  const last = words[words.length - 1] ?? '';
  let one = last;
  if (last.length > 4 && last.endsWith('ies')) one = last.slice(0, -3) + 'y';
  else if (last.length > 3 && last.endsWith('s') && !last.endsWith('ss')) one = last.slice(0, -1);
  words[words.length - 1] = one;
  return words.join(' ');
};

/** The comparable form of a category name. Two names are the same category when their keys match. */
export function categoryKey(name: string | null | undefined): string {
  if (!name) return '';
  return singularLastWord(collapse(name));
}

/** Same category, ignoring case, spacing and a plural ending. */
export function sameCategory(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = categoryKey(a);
  return ka !== '' && ka === categoryKey(b);
}

/**
 * The spellings a stored `parts.category` could have for this category, for a
 * database filter: the name as given, its singular, and its plural. Matched
 * case-insensitively by the caller (ilike), so case is not listed separately.
 */
export function categoryNameVariants(name: string): string[] {
  const base = name.trim().replace(/\s+/g, ' ');
  if (!base) return [];
  const words = base.split(' ');
  const last = words[words.length - 1];
  const withLast = (w: string) => [...words.slice(0, -1), w].join(' ');
  const lower = last.toLowerCase();

  const forms = new Set<string>([base]);
  if (lower.length > 4 && lower.endsWith('ies')) forms.add(withLast(last.slice(0, -3) + 'y'));
  else if (lower.length > 3 && lower.endsWith('s') && !lower.endsWith('ss')) forms.add(withLast(last.slice(0, -1)));
  if (lower.endsWith('y') && lower.length > 2 && !/[aeiou]y$/.test(lower)) forms.add(withLast(last.slice(0, -1) + 'ies'));
  else if (!lower.endsWith('s')) forms.add(withLast(last + 's'));
  return [...forms];
}

/**
 * A PostgREST `or` filter matching any spelling of the category,
 * case-insensitively. ilike's own wildcards (% and _) are escaped so a name is
 * matched literally, and each value is double-quoted so commas, dots and
 * brackets in a name cannot break the filter syntax.
 */
export function categoryOrFilter(name: string): string {
  // Two layers of escaping. First for ILIKE, so % and _ (and \ itself) are
  // literal; then for PostgREST's quoted value, which unescapes one level of
  // backslash and needs " escaped. Verified against the live API: a literal
  // "Ear%" matches nothing, while the unescaped pattern matched 9 products.
  const forLike = (v: string) => v.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  const quote = (v: string) => '"' + forLike(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  return categoryNameVariants(name)
    .map(v => `category.ilike.${quote(v)}`)
    .join(',');
}

/** Edit distance, capped: stops counting once it is past `max`. */
function distanceWithin(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Autocorrect for the admin: the existing name `typed` most likely means, or
 * null. An existing name that is the same category (case / plural) wins; then
 * the closest by spelling, within 2 edits for names of 5+ letters (1 for
 * shorter). Returns null when `typed` already IS one of the names exactly.
 */
export function suggestCategory(typed: string, existing: string[]): string | null {
  const t = collapse(typed);
  if (t.length < 3) return null;
  const names = existing.filter(Boolean);
  if (names.some(n => n.trim() === typed.trim())) return null;

  const same = names.find(n => sameCategory(n, typed));
  if (same) return same.trim();

  const tk = categoryKey(typed);
  const max = tk.length >= 5 ? 2 : 1;
  let best: { name: string; d: number } | null = null;
  for (const n of names) {
    const d = distanceWithin(tk, categoryKey(n), max);
    if (d <= max && (!best || d < best.d)) best = { name: n.trim(), d };
  }
  return best?.name ?? null;
}

/**
 * One entry per category however it is spelled, with how many products use it,
 * named after the spelling most products carry. Empty names are skipped.
 */
export function groupCategoryNames(names: Array<string | null | undefined>): Array<{ name: string; count: number }> {
  const groups = new Map<string, { spellings: Map<string, number>; count: number }>();
  for (const raw of names) {
    const key = categoryKey(raw);
    if (!key) continue;
    const g = groups.get(key) ?? { spellings: new Map<string, number>(), count: 0 };
    const spelling = String(raw).trim().replace(/\s+/g, ' ');
    g.spellings.set(spelling, (g.spellings.get(spelling) ?? 0) + 1);
    g.count += 1;
    groups.set(key, g);
  }
  return Array.from(groups.values()).map(g => ({
    name: [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
    count: g.count,
  }));
}
