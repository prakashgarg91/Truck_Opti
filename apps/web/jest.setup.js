// Jest setup file for Puppeteer
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const screenshotDir = process.env.TRUCKOPTI_SCREENSHOT_DIR
    ? path.resolve(process.env.TRUCKOPTI_SCREENSHOT_DIR)
    : path.resolve(__dirname, 'screenshots');

if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
}

// Global timeout settings
jest.setTimeout(30000);

global.TEST_BASE_URL = process.env.TRUCKOPTI_E2E_BASE_URL || 'http://localhost:5000';
global.TEST_HEADLESS = process.env.TRUCKOPTI_E2E_HEADLESS !== 'false';

// Optional: Add global error handling
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Helper functions for common testing scenarios
global.launchBrowser = async () => {
    return await puppeteer.launch({
        headless: global.TEST_HEADLESS,
        defaultViewport: { width: 1440, height: 900 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
};

global.createTestScreenshot = async (page, name) => {
    const screenshotPath = path.join(screenshotDir, `${name}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved: ${screenshotPath}`);
};
