import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@domain/(.*)$': '<rootDir>/src/domain/$1',
    '^@analysis/(.*)$': '<rootDir>/src/analysis/$1',
    '^@storage/(.*)$': '<rootDir>/src/storage/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
  },
  collectCoverageFrom: [
    'src/domain/**/*.ts',
    'src/analysis/**/*.ts',
    'src/storage/**/*.ts',
    '!**/index.ts',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: { branches: 60, functions: 70, lines: 70, statements: 70 },
  },
};

export default config;
