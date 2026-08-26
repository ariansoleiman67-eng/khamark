import { parseProductDraft, mergeDraft } from '../../src/utils/aiProductDraft';

describe('parseProductDraft', () => {
  it('reads a plain JSON object', () => {
    expect(parseProductDraft('{"nameAr":"هاتف","brand":"Honor"}')).toEqual({ nameAr: 'هاتف', brand: 'Honor' });
  });

  it('reads JSON inside a fenced code block, which is what models actually return', () => {
    expect(parseProductDraft('Here you go:\n```json\n{"brand":"Samsung"}\n```\nHope that helps!')).toEqual({ brand: 'Samsung' });
  });

  it('reads JSON with prose around it and no fence', () => {
    expect(parseProductDraft('Sure. {"brand":"Nokia"} Let me know.')).toEqual({ brand: 'Nokia' });
  });

  it('returns null on malformed JSON rather than throwing', () => {
    expect(parseProductDraft('{"brand": "Honor"')).toBeNull();
    expect(parseProductDraft('not json at all')).toBeNull();
    expect(parseProductDraft('')).toBeNull();
  });

  it('returns null for a JSON value that is not an object', () => {
    expect(parseProductDraft('"just a string"')).toBeNull();
    expect(parseProductDraft('[1,2,3]')).toBeNull();
    expect(parseProductDraft('null')).toBeNull();
  });

  it('drops keys it does not recognise, so a model cannot set arbitrary fields', () => {
    expect(parseProductDraft('{"brand":"Honor","priceUSD":1,"stockQty":999,"id":"x"}')).toEqual({ brand: 'Honor' });
  });

  it('drops values of the wrong type instead of writing them into the form', () => {
    expect(parseProductDraft('{"brand":{"nested":true},"nameAr":123,"nameKu":"ناوی"}')).toEqual({ nameKu: 'ناوی' });
  });

  it('keeps specifications as strings, coercing numbers', () => {
    expect(parseProductDraft('{"specifications":{"RAM":8,"Cable":"USB-C"}}')).toEqual({ specifications: { RAM: '8', Cable: 'USB-C' } });
  });

  it('drops specification entries that are objects or arrays', () => {
    expect(parseProductDraft('{"specifications":{"RAM":{"a":1},"Cable":"USB-C","X":[1]}}')).toEqual({ specifications: { Cable: 'USB-C' } });
  });

  it('drops an empty specifications object rather than reporting a change', () => {
    expect(parseProductDraft('{"specifications":{}}')).toEqual({});
  });

  it('trims whitespace and drops fields blank after trimming', () => {
    expect(parseProductDraft('{"brand":"  Honor  ","nameAr":"   "}')).toEqual({ brand: 'Honor' });
  });

  it('takes the LAST balanced object when a model narrates then answers', () => {
    expect(parseProductDraft('Example: {"brand":"WRONG"}\n\nFinal answer:\n{"brand":"Honor"}')).toEqual({ brand: 'Honor' });
  });
});

describe('mergeDraft — never silently overwrite the admin', () => {
  const draft = {
    brand: 'Honor',
    nameAr: 'هاتف',
    description: 'A phone.',
    specifications: { RAM: '8GB', Cable: 'USB-C' },
  };

  it('fills only the fields that are empty', () => {
    const { merged, skipped } = mergeDraft({ brand: 'Samsung', nameAr: '', description: '' } as any, draft, {}, false);
    expect(merged.brand).toBe('Samsung');
    expect(merged.nameAr).toBe('هاتف');
    expect(skipped).toContain('brand');
  });

  it('overwrites everything when explicitly told to', () => {
    const { merged, skipped } = mergeDraft({ brand: 'Samsung', nameAr: 'قديم', description: 'old' } as any, draft, {}, true);
    expect(merged.brand).toBe('Honor');
    expect(skipped).toEqual([]);
  });

  it('treats whitespace-only as empty', () => {
    expect(mergeDraft({ brand: '   ' } as any, draft, {}, false).merged.brand).toBe('Honor');
  });

  it('never drops a spec the admin already entered', () => {
    const { specs } = mergeDraft({} as any, draft, { RAM: '12GB' }, false);
    expect(specs.RAM).toBe('12GB');
    expect(specs.Cable).toBe('USB-C');
  });

  it('replaces an admin spec only under overwrite', () => {
    expect(mergeDraft({} as any, draft, { RAM: '12GB' }, true).specs.RAM).toBe('8GB');
  });

  it('reports nothing filled when the draft is empty', () => {
    expect(mergeDraft({} as any, {}, {}, false).filled).toEqual([]);
  });
});

describe('mergeDraft — specification key casing', () => {
  it('treats a differently-cased spec key as the same spec, not a second row', () => {
    const { specs } = mergeDraft({} as any, { specifications: { cable: 'USB-C' } }, { Cable: '' }, false);
    expect(Object.keys(specs)).toEqual(['Cable']);
    expect(specs.Cable).toBe('USB-C');
  });

  it('keeps the admin spelling when overwriting', () => {
    const { specs } = mergeDraft({} as any, { specifications: { cable: 'Lightning' } }, { Cable: 'USB-C' }, true);
    expect(Object.keys(specs)).toEqual(['Cable']);
    expect(specs.Cable).toBe('Lightning');
  });

  it('skips a cased duplicate the admin already filled', () => {
    const { specs, skipped } = mergeDraft({} as any, { specifications: { CABLE: 'Lightning' } }, { Cable: 'USB-C' }, false);
    expect(specs.Cable).toBe('USB-C');
    expect(skipped).toContain('Cable');
  });
});
