import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'jsdom',
        environmentOptions: {
            jsdom: {
                url: 'https://www.truckopti.in/',
            },
        },
        clearMocks: true,
        restoreMocks: true,
        unstubEnvs: true,
        include: ['src/**/*.test.ts'],
    },
})