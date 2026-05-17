import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.PUBLIC_APP_URL || 'https://www.truckopti.in';
const OUTPUT_PATH = path.join('logs', 'public_frontend_smoke_report.json');

const ROUTES = [
  { path: '/', expectedTitle: 'TruckOpti - Smart Logistics' },
  { path: '/pricing', expectedTitle: 'Pricing' },
  { path: '/terms', expectedTitle: 'Terms of Service' },
  { path: '/privacy', expectedTitle: 'Privacy Policy' },
  { path: '/contact', expectedTitle: 'Contact Us' },
  { path: '/login', expectedTitle: 'Welcome Back' },
  { path: '/signup', expectedTitle: 'Sign Up' },
  { path: '/forgot-password', expectedTitle: 'Forgot Password' },
  { path: '/reset-password', expectedTitle: 'Set New Password' },
  { path: '/payment/callback', expectedTitle: 'Payment Status', forbiddenBodyTexts: ['Invalid payment callback', 'Payment Failed'] },
  { path: '/payment/success', expectedTitle: 'Payment Status', forbiddenBodyTexts: ['Invalid payment callback', 'Payment Failed'] },
  { path: '/subscription', expectedTitle: 'Welcome Back', expectedFinalUrlIncludes: '/login' },
];

async function collectRouteResult(browser, route) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedResponses = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });

  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedResponses.push({
        url: response.url(),
        status: response.status(),
        method: response.request().method(),
      });
    }
  });

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(async () => {
      localStorage.clear();
      sessionStorage.clear();
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    });
    await context.clearCookies();

    const smokeUrl = `${BASE_URL}${route.path}${route.path.includes('?') ? '&' : '?'}fresh=${Date.now()}`;
    await page.goto(smokeUrl, { waitUntil: 'networkidle', timeout: 45000 });

    const title = await page.title();
    const appErrorCount = await page.getByText('Application Error').count();
    const heading = await page.locator('h1, h2').first().textContent().catch(() => null);
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const containsForbiddenText = (route.forbiddenBodyTexts || []).some((text) => bodyText.includes(text));

    const passed =
      title.includes(route.expectedTitle) &&
      (!route.expectedFinalUrlIncludes || page.url().includes(route.expectedFinalUrlIncludes)) &&
      appErrorCount === 0 &&
      !containsForbiddenText &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      failedResponses.length === 0;

    return {
      ...route,
      finalUrl: page.url(),
      title,
      heading,
      containsForbiddenText,
      passed,
      appErrorCount,
      consoleErrors,
      pageErrors,
      failedResponses,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const results = [];
    for (const route of ROUTES) {
      results.push(await collectRouteResult(browser, route));
    }

    const passedRoutes = results.filter((result) => result.passed).length;
    const report = {
      baseUrl: BASE_URL,
      timestamp: new Date().toISOString(),
      summary: {
        routesTested: results.length,
        passedRoutes,
        failedRoutes: results.length - passedRoutes,
      },
      results,
    };

    await fs.writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf8');

    console.log(`Public frontend smoke complete: ${OUTPUT_PATH}`);
    console.log(`Routes tested: ${results.length}`);
    console.log(`Passed routes: ${passedRoutes}`);

    const failed = results.filter((result) => !result.passed);
    if (failed.length > 0) {
      for (const route of failed) {
        console.error(
          `[FAIL] ${route.path} -> title="${route.title}", appErrors=${route.appErrorCount}, forbiddenText=${route.containsForbiddenText}, console=${route.consoleErrors.length}, pageErrors=${route.pageErrors.length}, httpFailures=${route.failedResponses.length}`
        );
      }
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
