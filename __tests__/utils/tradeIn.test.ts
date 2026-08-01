import { TRADE_IN_QUESTIONS } from '../../src/constants/tradeInQuestions';
import { validateAnswers, isDuplicateSubmission, buildListingDraft } from '../../src/utils/tradeIn';

const fullAnswers = () =>
  TRADE_IN_QUESTIONS.reduce<Record<string, string>>((acc, q) => {
    acc[q.key] = q.type === 'percent' ? '85' : q.options![0].value;
    return acc;
  }, {});

describe('validateAnswers', () => {
  it('accepts a fully answered questionnaire', () => {
    expect(validateAnswers(fullAnswers())).toEqual({ valid: true, missingKeys: [] });
  });

  it('reports every unanswered question', () => {
    const answers = fullAnswers();
    delete answers.screen;
    delete answers.body;
    const result = validateAnswers(answers);
    expect(result.valid).toBe(false);
    expect(result.missingKeys.sort()).toEqual(['body', 'screen']);
  });

  it('treats an empty string as unanswered', () => {
    const answers = { ...fullAnswers(), battery_health: '   ' };
    expect(validateAnswers(answers).missingKeys).toContain('battery_health');
  });
});

describe('isDuplicateSubmission', () => {
  const base = { deviceModel: 'iPhone 13 Pro', answers: { screen: 'original' }, createdAtMs: 1_000_000 };

  it('flags an identical request within 60 seconds', () => {
    expect(isDuplicateSubmission([base], { ...base, createdAtMs: 0 }, 1_030_000)).toBe(true);
  });

  it('allows the same request after 60 seconds', () => {
    expect(isDuplicateSubmission([base], { ...base, createdAtMs: 0 }, 1_061_000)).toBe(false);
  });

  it('allows a different model within the window', () => {
    const other = { ...base, deviceModel: 'Galaxy S22' };
    expect(isDuplicateSubmission([base], other, 1_010_000)).toBe(false);
  });

  it('allows the same model with different answers', () => {
    const other = { ...base, answers: { screen: 'replaced' } };
    expect(isDuplicateSubmission([base], other, 1_010_000)).toBe(false);
  });

  it('is false when there is nothing to compare against', () => {
    expect(isDuplicateSubmission([], base, 1_010_000)).toBe(false);
  });
});

describe('buildListingDraft', () => {
  it('builds a single-unit used listing from the request', () => {
    expect(
      buildListingDraft({
        deviceBrand: 'Apple',
        deviceModel: 'iPhone 13 Pro',
        storage: '256GB',
        photos: ['https://img/1.jpg'],
      })
    ).toEqual({
      name: 'iPhone 13 Pro 256GB — Used',
      brand: 'Apple',
      storage: '256GB',
      imageUrls: ['https://img/1.jpg'],
      condition: 'used',
      stockQty: 1,
    });
  });

  it('omits storage from the name when it is not known', () => {
    const draft = buildListingDraft({ deviceBrand: 'Apple', deviceModel: 'iPhone 12', photos: [] });
    expect(draft.name).toBe('iPhone 12 — Used');
  });
});
