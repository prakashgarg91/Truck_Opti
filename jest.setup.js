// Jest setup file for Puppeteer
const puppeteer = require('puppeteer');

// Global timeout settings
jest.setTimeout(30000);

// Optional: Add global error handling
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Helper functions for common testing scenarios
global.launchBrowser = async () => {
    return await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });
};

global.createTestScreenshot = async (page, name) => {
    const screenshotPath = `./screenshots/${name}.png`;
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved: ${screenshotPath}`);
};