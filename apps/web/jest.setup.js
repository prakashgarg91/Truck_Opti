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
    const screenshotPath = path.join(screenshotDir, `${name}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved: ${screenshotPath}`);
};