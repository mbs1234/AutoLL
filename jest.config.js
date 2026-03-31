module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.tsx?$': ['ts-jest'],
  },
  moduleNameMapper: {
    '.*/sensor-data$': '<rootDir>/src/api/__mocks__/sensor-data.ts',
    '^@/(.*)': '<rootDir>/src/$1',
  },
  testEnvironment: 'jsdom',
  fakeTimers: {
    advanceTimers: true,
  },
};
