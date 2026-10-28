// Khamark Store Identity + Contact Configuration
// Deliberately free of `process.env` so unit tests can import it safely.
// Re-exported by config.ts for backward compatibility.

export const BRAND = {
  name: 'Khamark',
  domain: 'khamark.com',
  // Contact details for Khamark.
  contactEmail: 'info@khamark.com',
  contactPhone: '+964 750 123 4567',
  address: 'Erbil, Kurdistan Region, Iraq',
  storeCoords: { latitude: 36.1911, longitude: 44.0094 }, // Erbil center
} as const;

/**
 * The shop's WhatsApp number as bare digits for wa.me and whatsapp:// deep links.
 * Returns '' when no phone is configured; callers should hide the button then.
 */
export const brandWhatsAppDigits = (): string =>
  (brandContact(BRAND.contactPhone) ?? '').replace(/[^0-9]/g, '');

/**
 * Legal & Support URLs for Khamark.
 */
export const LEGAL_URLS = {
  privacy: 'https://khamark.com/privacy',
  support: 'https://khamark.com/support',
} as const;

/** The value, or null when it is still a placeholder or blank. */
export const brandContact = (value: string | undefined | null): string | null => {
  const v = (value ?? '').trim();
  if (!v || v.startsWith('TODO_') || v.endsWith('_TBD') || v.includes('000 0000')) return null;
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
  'Open Help & Support in the app to reach us — our Khamark support team is ready to assist you.';
