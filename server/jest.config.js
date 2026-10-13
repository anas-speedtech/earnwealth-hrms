module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  moduleFileExtensions: ['js', 'json'],
  testTimeout: 10000,
  collectCoverageFrom: ['src/**/*.js', '!src/index.js'],
  coverageDirectory: 'coverage',
  verbose: true,
};
