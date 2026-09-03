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
// `domain` is asankare.com, the shop's live storefront. It was empty for a long
// time — the shop had no domain — and brandContact() treats '' as unset, so the
// product share sheet omitted the link rather than sending one that could not
// resolve. The site is live now, and its product pages are
// https://asankare.com/<lang>/p/<product id>, using the SAME uuids as parts.id.
// Verified: en, ar and ku all return 200 for a real product.
export const BRAND = {
  name: 'Asankary',
  domain: 'asankare.com',
  // Note the "e": asankarye@gmail.com, matching the published legal site and the
  // asankarye-hub GitHub account. Confirmed by the owner.
  contactEmail: 'asankarye@gmail.com',
  contactPhone: '+964 750 818 0750',
  address: 'Iraq - Erbil - Qala Bazar',
  storeCoords: { latitude: 36.1911, longitude: 44.0094 }, // Erbil default
} as const;

/**
 * The shop's WhatsApp number as bare digits, which is what whatsapp:// and wa.me
 * require — a leading "+" decodes to a space and the link silently fails.
 *
 * Use this instead of writing a number inline. Three screens each carried the
 * literal '9647701279797' — a number belonging to the project this app was forked
 * from — so "contact support" opened a chat with somebody else's business.
 * Returns '' when no phone is configured; callers should hide the button then.
 */
export const brandWhatsAppDigits = (): string =>
  (brandContact(BRAND.contactPhone) ?? '').replace(/[^0-9]/g, '');

/**
 * Published legal/support pages. Verified live (HTTP 200) — these are the URLs
 * App Store Connect requires under Support URL and Privacy Policy URL.
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
