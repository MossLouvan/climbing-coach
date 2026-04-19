/** @type {import('jest').Config} */
module.exports = {
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
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          target: 'ES2022',
          module: 'commonjs',
          strict: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          noImplicitAny: false,
          noUnusedLocals: false,
          noUnusedParameters: false,
        },
        diagnostics: { ignoreCodes: [151001] },
      },
    ],
  },
  collectCoverageFrom: [
    'src/domain/**/*.ts',
    'src/analysis/**/*.ts',
    'src/storage/**/*.ts',
    '!**/index.ts',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: { branches: 50, functions: 60, lines: 60, statements: 60 },
  },
};
