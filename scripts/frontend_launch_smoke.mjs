import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';
import { chromium } from 'playwright';

const BASE_URL = process.env.PUBLIC_APP_URL || 'https://www.truckopti.in';
const SUPABASE_URL = process.env.SUPABASE_PUBLIC_URL || 'https://jbxncejtcbpcronndqlx.supabase.co';
const OUTPUT_PATH = path.join('logs', 'frontend_launch_smoke_report.json');

const PUBLIC_ROUTES = [
  { path: '/', expectedTitle: 'TruckOpti - Smart Logistics' },
  { path: '/pricing', expectedTitle: 'Pricing' },
  { path: '/terms', expectedTitle: 'Terms of Service' },
  { path: '/privacy', expectedTitle: 'Privacy Policy' },
  { path: '/contact', expectedTitle: 'Contact Us' },
  { path: '/login', expectedTitle: 'Welcome Back' },
  { path: '/signup', expectedTitle: 'Sign Up' },
];

const PROTECTED_ROUTES = ['/packing', '/routes', '/tracking', '/management', '/history'];

function getSupabaseHostname() {
  try {
    return new URL(SUPABASE_URL).hostname;
  } catch {
    return null;
  }
}

function attachSignals(page) {
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

  return { consoleErrors, pageErrors, failedResponses };
}

async function closeContextSafely(context) {
  try {
    await context.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Failed to find context|Target closed|Browser has been closed/i.test(message)) {
      throw error;
    }
  }
}

async function closeBrowserSafely(browser) {
  try {
    await browser.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Target closed|Browser has been closed|Connection closed/i.test(message)) {
      throw error;
    }
  }
}

async function waitForBodyText(page, texts, timeout = 10000) {
  await page.waitForFunction(
    (candidateTexts) => candidateTexts.some((text) => document.body?.innerText.includes(text)),
    texts,
    { timeout }
  );

  const bodyText = await page.locator('body').innerText();
  return texts.find((text) => bodyText.includes(text)) ?? null;
}

async function resetSession(page, context) {
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
}

async function collectPublicRouteResult(browser, route) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const signals = attachSignals(page);

  try {
    await resetSession(page, context);
    await page.goto(`${BASE_URL}${route.path}${route.path.includes('?') ? '&' : '?'}fresh=${Date.now()}`, {
      waitUntil: 'networkidle',
      timeout: 45000,
    });

    const title = await page.title();
    const appErrorCount = await page.getByText('Application Error').count();

    return {
      kind: 'public-route',
      ...route,
      finalUrl: page.url(),
      title,
      passed:
        title.includes(route.expectedTitle) &&
        appErrorCount === 0 &&
        signals.consoleErrors.length === 0 &&
        signals.pageErrors.length === 0 &&
        signals.failedResponses.length === 0,
      appErrorCount,
      consoleErrors: signals.consoleErrors,
      pageErrors: signals.pageErrors,
      failedResponses: signals.failedResponses,
    };
  } finally {
    await closeContextSafely(context);
  }
}

async function collectProtectedRouteResult(browser, routePath) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const signals = attachSignals(page);

  try {
    await resetSession(page, context);
    await page.goto(`${BASE_URL}${routePath}?fresh=${Date.now()}`, { waitUntil: 'networkidle', timeout: 45000 });

    const finalUrl = page.url();
    return {
      kind: 'protected-route',
      path: routePath,
      finalUrl,
      title: await page.title(),
      passed:
        finalUrl.includes('/login') &&
        signals.pageErrors.length === 0 &&
        signals.failedResponses.length === 0,
      consoleErrors: signals.consoleErrors,
      pageErrors: signals.pageErrors,
      failedResponses: signals.failedResponses,
    };
  } finally {
    await closeContextSafely(context);
  }
}

async function collectContactFallbackResult(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.route('**/rest/v1/contact_inquiries*', (route) => route.abort('internetdisconnected'));

  const page = await context.newPage();
  const signals = attachSignals(page);

  try {
    await resetSession(page, context);
    await page.goto(`${BASE_URL}/contact?fresh=${Date.now()}`, { waitUntil: 'networkidle', timeout: 45000 });

    await page.getByPlaceholder('Your full name').fill('Launch Smoke');
    await page.getByPlaceholder('you@example.com').fill('launch-smoke@example.com');
    await page.locator('input[type="tel"]').first().fill('9876543210');
    await page.getByPlaceholder('How can we help you?').fill('Smoke test: verify graceful contact fallback.');
    await page.getByRole('button', { name: 'Send Message' }).click();

    const fallbackTexts = [
      'Contact service is currently unavailable.',
      'Unable to send your message right now. It has been saved here for retry.',
    ];

    const matchedFallbackText = await waitForBodyText(page, fallbackTexts);

    return {
      kind: 'contact-fallback',
      path: '/contact',
      finalUrl: page.url(),
      title: await page.title(),
      matchedFallbackText,
      passed:
        (await page.getByText('Support is temporarily unreachable.').count()) > 0 &&
        matchedFallbackText !== null &&
        (await page.getByRole('button', { name: 'Retry send' }).count()) > 0 &&
        (await page.getByRole('link', { name: 'Email support' }).count()) > 0 &&
        signals.pageErrors.length === 0,
      consoleErrors: signals.consoleErrors,
      pageErrors: signals.pageErrors,
      failedResponses: signals.failedResponses,
    };
  } finally {
    await closeContextSafely(context);
  }
}

async function collectAuthFallbackResult(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.route('**/auth/v1/otp*', (route) => route.abort('internetdisconnected'));

  const page = await context.newPage();
  const signals = attachSignals(page);

  try {
    await resetSession(page, context);
    await page.goto(`${BASE_URL}/login?fresh=${Date.now()}`, { waitUntil: 'networkidle', timeout: 45000 });

    const emailTab = page.getByRole('button', { name: /^Email/ }).first();
    if (await emailTab.count()) {
      await emailTab.click();
    }

    await page.getByPlaceholder('your@email.com').fill('launch-smoke@example.com');
    const submitButton = page.getByRole('button', { name: /Send Email OTP|Get OTP/ });
    await submitButton.click();

    const fallbackTexts = [
      'Authentication service is currently unreachable. Please try again shortly or use Google sign-in if available.',
      'Unable to send email OTP right now. Please try again later or use Google sign-in.',
    ];

    const matchedFallbackText = await waitForBodyText(page, fallbackTexts);

    return {
      kind: 'auth-fallback',
      path: '/login',
      finalUrl: page.url(),
      title: await page.title(),
      matchedFallbackText,
      passed:
        matchedFallbackText !== null &&
        signals.pageErrors.length === 0,
      consoleErrors: signals.consoleErrors,
      pageErrors: signals.pageErrors,
      failedResponses: signals.failedResponses,
    };
  } finally {
    await closeContextSafely(context);
  }
}

async function collectDriverRegisterWizardResult(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const signals = attachSignals(page);

  try {
    await resetSession(page, context);
    await page.goto(`${BASE_URL}/driver/register?fresh=${Date.now()}`, { waitUntil: 'networkidle', timeout: 45000 });

    const gateHeading = page.getByText('Log In To Start Driver Registration');
    const gateCta = page.getByRole('button', { name: 'Continue To Driver Login' });

    await gateHeading.waitFor({ timeout: 10000 });
    const sawGateHeading = (await gateHeading.count()) > 0;
    const sawGateCta = (await gateCta.count()) > 0;
    await gateCta.click();
    await page.waitForURL(/\/login\?mode=driver/, { timeout: 10000 });

    return {
      kind: 'driver-register-gate',
      path: '/driver/register',
      finalUrl: page.url(),
      title: await page.title(),
      passed:
        sawGateHeading &&
        sawGateCta &&
        page.url().includes('/login?mode=driver') &&
        signals.consoleErrors.length === 0 &&
        signals.pageErrors.length === 0 &&
        signals.failedResponses.length === 0,
      consoleErrors: signals.consoleErrors,
      pageErrors: signals.pageErrors,
      failedResponses: signals.failedResponses,
    };
  } finally {
    await closeContextSafely(context);
  }
}

async function collectAgencyRegisterWizardResult(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const signals = attachSignals(page);

  try {
    await resetSession(page, context);
    await page.goto(`${BASE_URL}/agency/register?fresh=${Date.now()}`, { waitUntil: 'networkidle', timeout: 45000 });

    const gateHeading = page.getByText('Log In To Register Your Agency');
    const gateCta = page.getByRole('button', { name: 'Continue To Agency Login' });

    await gateHeading.waitFor({ timeout: 10000 });
    const sawGateHeading = (await gateHeading.count()) > 0;
    const sawGateCta = (await gateCta.count()) > 0;
    await gateCta.click();
    await page.waitForURL(/\/login\?mode=agency/, { timeout: 10000 });

    return {
      kind: 'agency-register-gate',
      path: '/agency/register',
      finalUrl: page.url(),
      title: await page.title(),
      passed:
        sawGateHeading &&
        sawGateCta &&
        page.url().includes('/login?mode=agency') &&
        signals.consoleErrors.length === 0 &&
        signals.pageErrors.length === 0 &&
        signals.failedResponses.length === 0,
      consoleErrors: signals.consoleErrors,
      pageErrors: signals.pageErrors,
      failedResponses: signals.failedResponses,
    };
  } finally {
    await closeContextSafely(context);
  }
}

async function collectAuthServiceHealth() {
  const hostname = getSupabaseHostname();
  const result = {
    kind: 'auth-service',
    supabaseUrl: SUPABASE_URL,
    hostname,
    passed: false,
  };

  if (!hostname) {
    return { ...result, error: 'Invalid SUPABASE_PUBLIC_URL' };
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true });
    result.addresses = addresses.map((entry) => entry.address);
  } catch (error) {
    return {
      ...result,
      error: `DNS lookup failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, { method: 'GET', redirect: 'follow' });
    const body = await response.text();
    const reachableWithoutApiKey =
      (response.status === 401 || response.status === 403) &&
      /no api key|apikey/i.test(body);

    return {
      ...result,
      status: response.status,
      bodySnippet: body.slice(0, 200),
      passed: response.ok || reachableWithoutApiKey,
    };
  } catch (error) {
    return {
      ...result,
      error: `Health request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function main() {
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    const results = [];

    for (const route of PUBLIC_ROUTES) {
      results.push(await collectPublicRouteResult(browser, route));
    }

    for (const routePath of PROTECTED_ROUTES) {
      results.push(await collectProtectedRouteResult(browser, routePath));
    }

    results.push(await collectContactFallbackResult(browser));
    results.push(await collectAuthFallbackResult(browser));
    results.push(await collectDriverRegisterWizardResult(browser));
    results.push(await collectAgencyRegisterWizardResult(browser));
    results.push(await collectAuthServiceHealth());

    const passedChecks = results.filter((result) => result.passed).length;
    const report = {
      baseUrl: BASE_URL,
      supabaseUrl: SUPABASE_URL,
      timestamp: new Date().toISOString(),
      summary: {
        checks: results.length,
        passedChecks,
        failedChecks: results.length - passedChecks,
      },
      results,
    };

    await fs.writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf8');

    console.log(`Frontend launch smoke complete: ${OUTPUT_PATH}`);
    console.log(`Checks run: ${results.length}`);
    console.log(`Passed checks: ${passedChecks}`);

    const failed = results.filter((result) => !result.passed);
    if (failed.length > 0) {
      for (const check of failed) {
        console.error(`[FAIL] ${check.kind} ${check.path || check.hostname || ''}`.trim());
      }
      process.exitCode = 1;
    }
  } finally {
    await closeBrowserSafely(browser);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
