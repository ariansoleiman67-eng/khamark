// productService.ts pulls in ./supabase and ../constants/config at module
// scope. ./supabase drags in react-native-url-polyfill/auto, and config.ts's
// process.env.EXPO_PUBLIC_* reads get rewritten by babel-preset-expo into an
// import of expo/virtual/env — both are raw ESM in node_modules that this
// repo's unconfigured Jest (no jest.config, no RN preset — see CLAUDE.md)
// cannot parse. mapProduct itself never touches supabase/uniqueChannel or the
// config constants (only ProductService's methods do), so stubbing both
// modules here is enough to import mapProduct in isolation. SUPABASE_CONFIG.URL
// must be a real string: mockData.ts (imported by productService.ts) reads
// SUPABASE_CONFIG.URL.includes(...) at module scope to compute USE_MOCK_DATA.
// mockData.ts also reads process.env.EXPO_PUBLIC_USE_MOCK_DATA directly at
// module scope, hitting the same expo/virtual/env wall independently of
// config.ts, so it needs stubbing too.
jest.mock('../../src/services/supabase', () => ({ supabase: {}, uniqueChannel: jest.fn() }));
jest.mock('../../src/constants/config', () => ({
  SUPABASE_CONFIG: { URL: 'https://example.supabase.co' },
  CACHE_EXPIRATION: {},
  PAGINATION: {},
}));
jest.mock('../../src/services/mockData', () => ({
  USE_MOCK_DATA: false,
  mockGetProducts: jest.fn(),
  mockGetProduct: jest.fn(),
  mockGetFeatured: jest.fn(),
  mockGetByCategory: jest.fn(),
  mockGetByIds: jest.fn(),
  mockSearch: jest.fn(),
  mockGetCategories: jest.fn(),
}));

import { mapProduct } from '../../src/services/productService';

describe('mapProduct condition', () => {
  it('maps the condition column through', () => {
    expect(mapProduct({ id: '1', name: 'x', condition: 'used' }).condition).toBe('used');
  });

  it('defaults to new when the column is absent', () => {
    expect(mapProduct({ id: '1', name: 'x' }).condition).toBe('new');
  });
});
