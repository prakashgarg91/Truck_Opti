// e2e-tests.js
// End-to-end tests for TruckOpti using Puppeteer
// Covers: Creating Truck Type, Carton Type, Packing Job, and 3D Visualization

const puppeteer = require('puppeteer');

const APP_URL = 'http://localhost:5000'; // Adjust if app runs on a different port

describe('TruckOpti End-to-End Tests', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: true });
    page = await browser.newPage();
    await page.goto(APP_URL);
  });

  afterAll(async () => {
    await browser.close();
  });

  test('Create Truck Type', async () => {
    await page.goto(`${APP_URL}/truck_types`);
    await page.waitForSelector('a#add-truck-btn, a[href="/add_truck_type"]');
    await page.click('a#add-truck-btn, a[href="/add_truck_type"]');

    await page.waitForSelector('form#truck-type-form');
    await page.type('input[name="name"]', 'Test Truck');
    await page.type('input[name="length"]', '10');
    await page.type('input[name="width"]', '2.5');
    await page.type('input[name="height"]', '3');
    await page.type('input[name="max_weight"]', '20000');
    await page.type('input[name="cost_per_km"]', '15');
    await page.type('input[name="fuel_efficiency"]', '5');
    await page.type('input[name="driver_cost_per_day"]', '1000');
    await page.type('input[name="maintenance_cost_per_km"]', '2');
    await page.select('select[name="truck_category"]', 'Standard');
    await page.click('input[name="availability"]');
    await page.type('textarea[name="description"]', 'Automated test truck');
    await page.click('button[type="submit"]');

    await page.waitForSelector('table#truck-types-list');
    const truckExists = await page.evaluate(() =>
      Array.from(document.querySelectorAll('table#truck-types-list td')).some(td => td.textContent.includes('Test Truck'))
    );
    expect(truckExists).toBe(true);
  });

  test('Create Carton Type', async () => {
    await page.goto(`${APP_URL}/carton_types`);
    await page.waitForSelector('a#add-carton-btn, a[href="/add_carton_type"]');
    await page.click('a#add-carton-btn, a[href="/add_carton_type"]');

    await page.waitForSelector('form#carton-type-form');
    await page.type('input[name="name"]', 'Test Carton');
    await page.type('input[name="length"]', '1');
    await page.type('input[name="width"]', '1');
    await page.type('input[name="height"]', '1');
    await page.type('input[name="weight"]', '10');
    await page.click('input[name="can_rotate"]');
    await page.click('input[name="fragile"]');
    await page.click('input[name="stackable"]');
    await page.type('input[name="max_stack_height"]', '5');
    await page.type('input[name="priority"]', '1');
    await page.type('input[name="value"]', '100');
    await page.type('input[name="category"]', 'General');
    await page.type('textarea[name="description"]', 'Automated test carton');
    await page.click('button[type="submit"]');

    await page.waitForSelector('table#carton-types-list');
    const cartonExists = await page.evaluate(() =>
      Array.from(document.querySelectorAll('table#carton-types-list td')).some(td => td.textContent.includes('Test Carton'))
    );
    expect(cartonExists).toBe(true);
  });

  test('Create Packing Job and Verify 3D Visualization', async () => {
    await page.goto(`${APP_URL}/add_packing_job`);
    await page.waitForSelector('form#packing-job-form');

    await page.type('input[name="name"]', 'Test Packing Job');
    await page.select('select[name="truck_type_id"]', '1'); // Assumes truck type with id=1 exists
    await page.select('select[name="shipment_id"]', '1'); // Assumes shipment with id=1 exists
    await page.type('input[name="optimization_goal"]', 'Minimize Trucks');
    await page.click('button[type="submit"]');

    await page.waitForNavigation();
    await page.waitForSelector('#packing-result-3d, canvas, #threejs-canvas', { timeout: 10000 });

    // Check if 3D visualization is rendered
    const visualizationExists = await page.evaluate(() =>
      !!document.querySelector('#packing-result-3d') ||
      !!document.querySelector('canvas') ||
      !!document.querySelector('#threejs-canvas')
    );
    expect(visualizationExists).toBe(true);
  });
});