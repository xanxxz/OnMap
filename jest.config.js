module.exports = {
  preset: '@react-native/jest-preset',
  roots: ['<rootDir>/__tests__', '<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((@)?react-native|@react-native(-community)?|@react-navigation|react-native-.*|@maplibre)/)',
  ],
};
