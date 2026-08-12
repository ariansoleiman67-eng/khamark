// Store identity + contact, and the guards that keep unset values off the screen.
//
// Deliberately free of `process.env`: the Expo babel preset rewrites every
// process.env reference into an import from `expo/virtual/env`, which is ESM inside
// node_modules and therefore untransformed under jest. config.ts has 22 of them, so
// anything importable by a test has to live outside it. config.ts re-exports all of
// this, and every existing `import { BRAND } from '.../constants/config'` still works.

// Central brand block — single source of truth for store identity/contact.
//
// There is one shop phone, which doubles as the WhatsApp number, so the old
// contactPhone2 / contactPhone3 fields are gone rather than left empty: the legal
// screens used to print "Alternate Phone:" lines that had no number behind them.
//
// `domain` is intentionally empty — the shop has no domain of its own yet. The
// published legal pages live on GitHub Pages (see LEGAL_URLS). brandContact()
// treats '' as unset, so the product share sheet omits the link entirely instead
// of sending a URL that cannot resolve.
export const BRAND = {
  name: 'Asankary',
  domain: '',
  contactEmail: 'asankary@gmail.com',
  contactPhone: '+964 750 818 0750',
  address: 'Iraq - Erbil - Qala Bazar',
  storeCoords: { latitude: 36.1911, longitude: 44.0094 }, // Erbil default
} as const;

/**
 * Published legal/support pages. Verified live (HTTP 200) — these are the URLs
 * App Store Connect requires under Support URL and Privacy Policy URL.
 *
 * NOTE: the site itself lists asankarye@gmail.com (with an "e") while BRAND above
 * uses asankary@gmail.com. Make the two agree before submitting.
 */
export const LEGAL_URLS = {
  privacy: 'https://asankarye-hub.github.io/asankary-legal/',
  support: 'https://asankarye-hub.github.io/asankary-legal/support.html',
} as const;

// The BRAND contact fields above are placeholders until the real values are filled
// in. They are rendered into user-facing text — the Privacy Policy and Terms contact
// sections, the Contact Us sheet, and printed invoices — so an unfilled one used to
// put a literal "TODO_CONTACT_EMAIL" in front of customers and App Review, which
// reads as an incomplete app (Guideline 2.1). Everything that displays a BRAND
// contact value must go through these helpers, which drop placeholders instead.
//
// The same applies to values coming from the `tenants` row: an admin who has not
// filled in Store Profile leaves phone/whatsapp/email empty, so blanks must be
// handled identically whatever the source.

/** The value, or null when it is still a placeholder or blank. */
export const brandContact = (value: string | undefined | null): string | null => {
  const v = (value ?? '').trim();
  if (!v || v.startsWith('TODO_') || v.endsWith('_TBD')) return null;
  return v;
};

/**
 * `Label: value` lines for every pair whose value is real, joined by newlines.
 * Returns '' when nothing is filled in — callers pass a fallback via contactBlockOr.
 */
export const contactBlock = (
  ...pairs: ReadonlyArray<readonly [string, string | undefined | null]>
): string =>
  pairs
    .map(([label, value]) => [label, brandContact(value)] as const)
    .filter((pair): pair is readonly [string, string] => pair[1] !== null)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');

/** contactBlock, falling back to `fallback` when no contact value is set. */
export const contactBlockOr = (
  fallback: string,
  ...pairs: ReadonlyArray<readonly [string, string | undefined | null]>
): string => contactBlock(...pairs) || fallback;

/**
 * What the legal screens say when no contact details are configured. In-app chat
 * is always reachable (Help & Support), so this stays true even with BRAND unset.
 */
export const CONTACT_FALLBACK =
  'Open Help & Support in the app to reach us — in-app chat is answered directly by our team.';
