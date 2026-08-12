import { brandContact, contactBlock, contactBlockOr, BRAND, CONTACT_FALLBACK } from '../../src/constants/brand';

describe('brandContact', () => {
  it('drops the TODO_ placeholders that ship in BRAND today', () => {
    expect(brandContact('TODO_CONTACT_EMAIL')).toBeNull();
    expect(brandContact('TODO_CONTACT_PHONE')).toBeNull();
    expect(brandContact('TODO_CONTACT_ADDRESS')).toBeNull();
  });

  it('drops the _TBD domain placeholder', () => {
    expect(brandContact('ASANKARY_DOMAIN_TBD')).toBeNull();
  });

  it('drops blank and whitespace-only values, which is what an unset tenant row holds', () => {
    expect(brandContact('')).toBeNull();
    expect(brandContact('   ')).toBeNull();
    expect(brandContact(undefined)).toBeNull();
    expect(brandContact(null)).toBeNull();
  });

  it('passes real values through, trimmed', () => {
    expect(brandContact('info@asankary.com')).toBe('info@asankary.com');
    expect(brandContact('  +964 750 123 4567  ')).toBe('+964 750 123 4567');
  });

  it('does not drop a real value that merely contains "TODO" mid-string', () => {
    expect(brandContact('todo@asankary.com')).toBe('todo@asankary.com');
  });
});

describe('contactBlock', () => {
  it('omits the label entirely when the value is a placeholder', () => {
    expect(contactBlock(['Email', 'TODO_CONTACT_EMAIL'], ['Phone', '+964 750 111 2222']))
      .toBe('Phone: +964 750 111 2222');
  });

  it('returns empty string when nothing is configured', () => {
    expect(contactBlock(['Email', 'TODO_CONTACT_EMAIL'], ['Address', ''])).toBe('');
  });

  it('joins several real values one per line', () => {
    expect(contactBlock(['Email', 'a@b.com'], ['Phone', '123'])).toBe('Email: a@b.com\nPhone: 123');
  });

  it('falls back only when every value is missing', () => {
    expect(contactBlockOr('FALLBACK', ['Email', 'TODO_CONTACT_EMAIL'])).toBe('FALLBACK');
    expect(contactBlockOr('FALLBACK', ['Email', 'a@b.com'])).toBe('Email: a@b.com');
  });
});

// The point of the whole helper: App Review rejected 1.0 (4) on a completeness
// guideline, and the legal screens were rendering "TODO_CONTACT_EMAIL" to any
// reviewer who opened Terms or Privacy Policy. Real values are now configured,
// so these assert the shipped BRAND block is clean AND actually renders.
describe('the shipped BRAND block', () => {
  const contactFields = [BRAND.contactEmail, BRAND.contactPhone, BRAND.address];

  it('contains no placeholder in any field', () => {
    for (const v of Object.values(BRAND)) {
      if (typeof v === 'string') expect(v).not.toMatch(/TODO_|_TBD|\[License Number\]/);
    }
  });

  it('renders every contact field, so the legal screens are no longer empty', () => {
    const rendered = contactBlockOr(
      CONTACT_FALLBACK,
      ...contactFields.map((v, i) => [`L${i}`, v] as const),
    );
    expect(rendered).not.toBe(CONTACT_FALLBACK);
    expect(rendered.split('\n')).toHaveLength(contactFields.length);
    expect(rendered).not.toMatch(/TODO_|_TBD/);
  });

  it('leaves domain unset, so the share sheet omits the link rather than sending a dead URL', () => {
    expect(brandContact(BRAND.domain)).toBeNull();
  });
});
