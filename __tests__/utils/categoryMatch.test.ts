import {
  categoryKey,
  sameCategory,
  categoryNameVariants,
  categoryOrFilter,
  suggestCategory,
  groupCategoryNames,
} from '../../src/utils/categoryMatch';

describe('sameCategory — one category, however it is spelled', () => {
  it('ignores case, spacing and a plural ending (the live cases)', () => {
    expect(sameCategory('Earphones', 'Earphone')).toBe(true);
    expect(sameCategory('Headsets', 'headset')).toBe(true);
    expect(sameCategory(' Power  Banks ', 'Power Bank')).toBe(true);
    expect(sameCategory('Accessories', 'Accessory')).toBe(true);
    expect(sameCategory('Case phone', 'case Phone')).toBe(true);
  });

  it('does NOT merge different words or real typos silently', () => {
    expect(sameCategory('Heatset', 'Headsets')).toBe(false); // a typo: suggested, not merged
    expect(sameCategory('Phones', 'Phone Cases')).toBe(false);
    expect(sameCategory('Glass', 'Gla')).toBe(false);
    expect(sameCategory('', '')).toBe(false);
    expect(sameCategory(null, undefined)).toBe(false);
  });

  it('keeps double-s words whole', () => {
    expect(categoryKey('Glass')).toBe('glass');
  });
});

describe('categoryNameVariants / categoryOrFilter — the database side', () => {
  it('lists the singular and plural spellings to look for', () => {
    expect(categoryNameVariants('Earphones')).toEqual(['Earphones', 'Earphone']);
    expect(categoryNameVariants('Earphone')).toEqual(['Earphone', 'Earphones']);
    expect(categoryNameVariants('Accessories')).toEqual(['Accessories', 'Accessory']);
    expect(categoryNameVariants('Power Bank')).toEqual(['Power Bank', 'Power Banks']);
  });

  it('builds a case-insensitive, literal or-filter', () => {
    expect(categoryOrFilter('Earphones')).toBe('category.ilike."Earphones",category.ilike."Earphone"');
    // A % or _ in a name is matched literally, not as a wildcard.
    // PostgREST unescapes one level inside quotes, leaving \% for ILIKE.
    expect(categoryOrFilter('50% Off')).toContain('"50\\\\% Off"');
  });
});

describe('suggestCategory — autocorrect while the admin types', () => {
  const used = ['Earphone', 'Headsets', 'Phones', 'Chargers', 'Power Banks'];

  it('offers the spelling the products already use', () => {
    expect(suggestCategory('Earphones', used)).toBe('Earphone');
    expect(suggestCategory('Heatset', used)).toBe('Headsets');
    expect(suggestCategory('chargr', used)).toBe('Chargers');
  });

  it('stays quiet when the name already exists exactly, or nothing is close', () => {
    expect(suggestCategory('Phones', used)).toBeNull();
    expect(suggestCategory('Laptops', used)).toBeNull();
    expect(suggestCategory('ab', used)).toBeNull();
  });
});

describe('groupCategoryNames', () => {
  it('merges spellings into one entry named after the most-used one', () => {
    const groups = groupCategoryNames(['Earphone', 'Earphone', 'earphones', 'Headsets', null, '', ' Phones ']);
    expect(groups).toEqual([
      { name: 'Earphone', count: 3 },
      { name: 'Headsets', count: 1 },
      { name: 'Phones', count: 1 },
    ]);
  });
});
