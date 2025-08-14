/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    setupFilesAfterEnv: ['./jest.setup.js'],
    testMatch: ['**/tests/e2e/**/*.test.js'],
    globals: {
        'ts-jest': {
            diagnostics: {
                warnOnly: true
            }
        }
    },
    // Puppeteer-specific configurations
    testTimeout: 30000,
    verbose: true
};