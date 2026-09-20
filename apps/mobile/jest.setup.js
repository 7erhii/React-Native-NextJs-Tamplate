/**
 * Test environment stubs for native modules.
 *
 * Tests run in a plain Node environment rather than under a React Native
 * renderer: everything covered here is pure logic (conflict resolution,
 * migrations, storage adapters, configuration validation), so a device runtime
 * would add minutes of startup for no additional coverage. Component rendering
 * would need a different setup, and none of these tests do any.
 *
 * Only modules that genuinely cannot run outside a device are mocked. Everything
 * under src/core is exercised for real, because the point of the contract suite
 * is to test actual adapter behaviour rather than a mock of it.
 */

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: (options) => options.ios ?? options.native ?? options.default,
  },
}));

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
    isAvailableAsync: jest.fn(async () => true),
  };
});

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  getRandomBytes: jest.fn((length) => new Uint8Array(length).map((_, i) => (i * 7) % 256)),
  digestStringAsync: jest.fn(async (_algorithm, value) => `sha256:${value}`),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(async () => ({ type: 'cancel' })),
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path) => `mobileworld://${path}`),
}));
