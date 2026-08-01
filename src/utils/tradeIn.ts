import { TRADE_IN_QUESTIONS } from '../constants/tradeInQuestions';

export interface DuplicateCandidate {
  deviceModel: string;
  answers: Record<string, string>;
  createdAtMs: number;
}

export interface TradeInDraftSource {
  deviceBrand: string;
  deviceModel: string;
  storage?: string;
  photos: string[];
}

/** Every question must carry a non-blank answer before a request can be submitted. */
export const validateAnswers = (
  answers: Record<string, string>
): { valid: boolean; missingKeys: string[] } => {
  const missingKeys = TRADE_IN_QUESTIONS
    .filter((q) => !(answers[q.key] || '').trim())
    .map((q) => q.key);
  return { valid: missingKeys.length === 0, missingKeys };
};

const DUPLICATE_WINDOW_MS = 60_000;

/**
 * Guards against a double tap or a retried submit creating two identical requests.
 * Matches on model plus the full answer set — a customer legitimately trading two
 * different phones, or the same model in different condition, is not a duplicate.
 */
export const isDuplicateSubmission = (
  existing: DuplicateCandidate[],
  candidate: DuplicateCandidate,
  nowMs: number
): boolean =>
  existing.some(
    (e) =>
      nowMs - e.createdAtMs < DUPLICATE_WINDOW_MS &&
      e.deviceModel === candidate.deviceModel &&
      JSON.stringify(e.answers) === JSON.stringify(candidate.answers)
  );

/**
 * Pre-fills the product form from a request the shop has bought, so the admin does
 * not retype data the app already holds. Always one unit: a used phone is a single
 * specific handset, not a stock line.
 */
export const buildListingDraft = (source: TradeInDraftSource) => {
  const storage = source.storage?.trim();
  const name = storage
    ? `${source.deviceModel} ${storage} — Used`
    : `${source.deviceModel} — Used`;
  return {
    name,
    brand: source.deviceBrand,
    storage,
    imageUrls: source.photos,
    condition: 'used' as const,
    stockQty: 1 as const,
  };
};
