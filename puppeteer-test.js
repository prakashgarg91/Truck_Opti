// puppeteer-test.js
const puppeteer = require('puppeteer');

const BASE_URL = 'http://127.0.0.1:5000';

const pages = [
  { url: '/', buttons: ['.btn-primary', '.btn-danger', '.btn-warning', '.btn-info', '.btn-secondary', '.btn-close'] },
  { url: '/truck_types', buttons: ['.btn-primary', '.btn-warning', '.btn-danger'] },
  { url: '/packing_jobs', buttons: ['.btn-primary', '.btn-danger'] },
  { url: '/carton_types', buttons: ['.btn-primary', '.btn-info', '.btn-danger'] },
  { url: '/add_truck_type', buttons: ['.btn-primary'] },
  { url: '/add_packing_job', buttons: ['.btn-secondary', '.btn-primary'] },
  { url: '/add_carton_type', buttons: ['.btn-primary'] }
];

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  for (const p of pages) {
    await page.goto(BASE_URL + p.url, { waitUntil: 'networkidle2' });
    for (const btn of p.buttons) {
      const btnExists = await page.$(btn);
      if (btnExists) {
        try {
          await btnExists.click();
          await new Promise(res => setTimeout(res, 500));
          const error = await page.$('.alert-danger, .error');
          if (error) {
            const msg = await page.evaluate(el => el.textContent, error);
            console.log(`Error found on ${p.url} after clicking ${btn}: ${msg}`);
          } else {
            console.log(`Clicked ${btn} on ${p.url} - no error`);
          }
        } catch (e) {
          console.log(`Exception clicking ${btn} on ${p.url}: ${e.message}`);
        }
      } else {
        console.log(`Button ${btn} not found on ${p.url}`);
      }
    }
    // Additional tests for /add_packing_job
    if (p.url === '/add_packing_job') {
      // Select truck type
      const truckType = await page.$('#truck_type');
      if (truckType) {
        await page.select('#truck_type', await page.$eval('#truck_type option', el => el.value));
        console.log('Selected truck type');
      }
      // Select carton type and set quantity
      const cartonType = await page.$('.carton-type-select');
      if (cartonType) {
        await page.select('.carton-type-select', await page.$eval('.carton-type-select option', el => el.value));
        console.log('Selected carton type');
      }
      const cartonQty = await page.$('.carton-quantity');
      if (cartonQty) {
        await cartonQty.click({ clickCount: 3 });
        await cartonQty.type('10');
        console.log('Set carton quantity');
      }
      // Check truck requirement update
      await new Promise(res => setTimeout(res, 500));
      const truckReq = await page.$('#truck-requirement-details');
      if (truckReq) {
        const reqText = await page.evaluate(el => el.textContent, truckReq);
        console.log('Truck requirement details:', reqText);
      }
      // Submit packing job if possible
      const submitBtn = await page.$('.btn-primary[type="submit"], button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        console.log('Packing job submitted');
      }
    }
    // Additional test for /packing_result
    if (p.url === '/packing_result') {
      const visualization = await page.$('#visualization');
      if (visualization) {
        console.log('Space visualization found on packing_result');
      } else {
        console.log('Space visualization NOT found on packing_result');
      }
    }
  }

  await browser.close();
})();