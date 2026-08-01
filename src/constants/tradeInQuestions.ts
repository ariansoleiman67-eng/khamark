/**
 * Bump when the question set changes. Every stored request records the version it
 * was answered against, so an old request still renders correctly afterwards.
 */
export const TRADE_IN_QUESTIONS_VERSION = 1;

export interface TradeInQuestionOption {
  value: string;
  labelKey: string;
}

export interface TradeInQuestion {
  key: string;
  labelKey: string;
  type: 'choice' | 'percent';
  options?: TradeInQuestionOption[];
}

export const TRADE_IN_QUESTIONS: TradeInQuestion[] = [
  {
    key: 'powers_on',
    labelKey: 'tradeIn.q.powersOn',
    type: 'choice',
    options: [
      { value: 'yes', labelKey: 'common.yes' },
      { value: 'no', labelKey: 'common.no' },
    ],
  },
  {
    key: 'screen',
    labelKey: 'tradeIn.q.screen',
    type: 'choice',
    options: [
      { value: 'original', labelKey: 'tradeIn.a.original' },
      { value: 'replaced', labelKey: 'tradeIn.a.replaced' },
      { value: 'cracked', labelKey: 'tradeIn.a.cracked' },
    ],
  },
  { key: 'battery_health', labelKey: 'tradeIn.q.batteryHealth', type: 'percent' },
  {
    key: 'charging_port',
    labelKey: 'tradeIn.q.chargingPort',
    type: 'choice',
    options: [
      { value: 'works', labelKey: 'tradeIn.a.works' },
      { value: 'faulty', labelKey: 'tradeIn.a.faulty' },
      { value: 'replaced', labelKey: 'tradeIn.a.replaced' },
    ],
  },
  {
    key: 'cameras',
    labelKey: 'tradeIn.q.cameras',
    type: 'choice',
    options: [
      { value: 'all_work', labelKey: 'tradeIn.a.allWork' },
      { value: 'some_faulty', labelKey: 'tradeIn.a.someFaulty' },
    ],
  },
  {
    key: 'biometrics',
    labelKey: 'tradeIn.q.biometrics',
    type: 'choice',
    options: [
      { value: 'works', labelKey: 'tradeIn.a.works' },
      { value: 'broken', labelKey: 'tradeIn.a.doesNotWork' },
    ],
  },
  {
    key: 'water_damage',
    labelKey: 'tradeIn.q.waterDamage',
    type: 'choice',
    options: [
      { value: 'no', labelKey: 'common.no' },
      { value: 'yes', labelKey: 'common.yes' },
      { value: 'unknown', labelKey: 'tradeIn.a.dontKnow' },
    ],
  },
  {
    // Commercially the most important question: a locked device cannot be resold
    // and is worth nothing to the shop. Asking here saves the customer a trip.
    key: 'account_removed',
    labelKey: 'tradeIn.q.accountRemoved',
    type: 'choice',
    options: [
      { value: 'yes', labelKey: 'common.yes' },
      { value: 'no', labelKey: 'common.no' },
    ],
  },
  {
    key: 'body',
    labelKey: 'tradeIn.q.body',
    type: 'choice',
    options: [
      { value: 'like_new', labelKey: 'tradeIn.a.likeNew' },
      { value: 'light_scratches', labelKey: 'tradeIn.a.lightScratches' },
      { value: 'dents', labelKey: 'tradeIn.a.dents' },
    ],
  },
  {
    key: 'box_charger',
    labelKey: 'tradeIn.q.boxCharger',
    type: 'choice',
    options: [
      { value: 'yes', labelKey: 'common.yes' },
      { value: 'no', labelKey: 'common.no' },
    ],
  },
];
