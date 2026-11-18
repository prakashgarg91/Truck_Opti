import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'jsdom',
        environmentOptions: {
            jsdom: {
                url: 'https://www.truckopti.in/',
            },
        },
        // 122 files run in parallel; page tests with lazy imports exceed the 5 s default under load.
        testTimeout: 20000,
        clearMocks: true,
        restoreMocks: true,
        unstubEnvs: true,
        include: ['src/**/*.test.ts'],
    },
})