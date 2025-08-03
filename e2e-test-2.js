const puppeteer = require('puppeteer');
const { expect } = require('chai');

describe('TruckOpti E2E Tests', function () {
  this.timeout(20000);
  let browser;
  let page;

  before(async () => {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setViewport({ width: 1280, height: 720 });
    
    const response = await page.goto('http://127.0.0.1:5000/', {
      waitUntil: 'networkidle0',
      timeout: 10000
    });
    
    console.log('Loaded URL:', response.url());
    console.log('Status:', response.status());
    const body = await page.content();
    console.log('Page content start:', body.substring(0, 200));
  });

  after(async () => {
    await browser.close();
  });

  it('should handle packing jobs with no cartons gracefully', async function() {
    this.timeout(30000);
    try {
      console.log('Checking page content...');
      const bodyText = await page.evaluate(() => document.body.textContent);
      console.log('Page content:', bodyText.substring(0, 200) + '...');

      console.log('Navigating to packing jobs page...');
      await page.waitForSelector('a', {timeout: 10000});
      const links = await page.$$eval('a', as => as.map(a => a.href));
      console.log('Found links:', links);

      const packingJobsLink = links.find(link => link.includes('packing-jobs'));
      if (!packingJobsLink) {
        throw new Error('Could not find packing jobs link');
      }
      await page.goto(packingJobsLink);
      await page.waitForSelector('h1', {timeout: 10000});

      console.log('Clicking create new job button...');
      await page.waitForSelector('a[href*="add-packing-job"]', {timeout: 10000});
      await page.click('a[href*="add-packing-job"]');
      await page.waitForSelector('h1', {timeout: 10000});

      // Fill out the form
      await page.type('#name', 'Test Job No Cartons');
      await page.select('#truck_type', '1'); // Assuming a truck with ID 1 exists

      // Add one carton (required by form validation)
      await page.select('select[name="carton_type_1"]', '1');
      await page.type('input[name="quantity_1"]', '0');

      // Submit the form and wait for navigation
      await Promise.all([
        page.waitForNavigation({waitUntil: 'networkidle0'}),
        page.click('button[type="submit"]')
      ]);

      // Check for the warning message on packing-jobs page
      try {
        const warningMessage = await page.waitForFunction(
          'document.querySelector(".alert-warning")?.textContent?.includes("Packing job failed - no cartons")',
          {timeout: 10000}
        );
        console.log('Found warning message:', await warningMessage.jsonValue());
      } catch (err) {
        console.error('Warning message not found. Page content:');
        console.log(await page.content());
        throw err;
      }

      // Verify that we are on the packing jobs page
      const pageTitle = await page.$eval('h1', el => el.textContent);
      expect(pageTitle).to.equal('Packing Jobs');
    } catch (error) {
      await page.screenshot({ path: 'error.png' });
      throw error;
    }
  });
});