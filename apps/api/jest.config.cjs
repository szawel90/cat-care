module.exports = {
  testEnvironment: 'node',
  // Keep numerical solver lookups inside the test VM.
  sandboxInjectedGlobals: ['Math'],
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  clearMocks: true,
};
