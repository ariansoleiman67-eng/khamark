// Store identity + contact, and the guards that keep unset values off the screen.
//
// Deliberately free of `process.env`: the Expo babel preset rewrites every
// process.env reference into an import from `expo/virtual/env`, which is ESM inside
// node_modules and therefore untransformed under jest. config.ts has 22 of them, so
// anything importable by a test has to live outside it. config.ts re-exports all of
// this, and every existing `import { BRAND } from '.../constants/config'` still works.

// Central brand block — single source of truth for store identity/contact.
// Contact + domain values are placeholders until finalized.
export const BRAND = {
  name: 'Asankary',
  domain: 'ASANKARY_DOMAIN_TBD',
  contactEmail: 'TODO_CONTACT_EMAIL',
  contactPhone: 'TODO_CONTACT_PHONE',
  contactPhone2: 'TODO_CONTACT_PHONE_2',
  contactPhone3: 'TODO_CONTACT_PHONE_3',
  address: 'TODO_CONTACT_ADDRESS',
  storeCoords: { latitude: 36.1911, longitude: 44.0094 }, // Erbil default
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
