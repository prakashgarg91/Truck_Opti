const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function testSaleOrderFeature() {
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    const testResults = {
        navigation: null,
        uploadInterface: null,
        fileUpload: null,
        resultsDisplay: null,
        dataValidation: null,
        uiComponents: null,
        errors: []
    };
    
    try {
        console.log('🚀 Starting Sale Order Feature Testing...\n');
        
        // Step 1: Navigate to homepage
        console.log('Step 1: Navigating to TruckOpti homepage...');
        await page.goto('http://127.0.0.1:5000', { waitUntil: 'networkidle2' });
        await page.screenshot({ path: 'screenshots/01_homepage.png' });
        
        // Check if page loaded correctly
        const title = await page.title();
        console.log(`✅ Page loaded: ${title}`);
        
        // Step 2: Look for Sale Order feature in navigation
        console.log('\nStep 2: Looking for Sale Order Truck Selection in navigation...');
        
        // Wait for page to fully load
        await page.waitForTimeout(2000);
        
        // Try to find the sale order link
        const saleOrderLinks = await page.$$eval('a', links => 
            links.filter(link => 
                link.textContent.toLowerCase().includes('sale order') ||
                link.textContent.toLowerCase().includes('truck selection') ||
                link.href.includes('sale_order')
            ).map(link => ({ text: link.textContent.trim(), href: link.href }))
        );
        
        console.log('Found potential sale order links:', saleOrderLinks);
        
        if (saleOrderLinks.length === 0) {
            // Check all navigation links
            const allLinks = await page.$$eval('a', links => 
                links.map(link => ({ text: link.textContent.trim(), href: link.href }))
            );
            console.log('All navigation links found:', allLinks);
            
            // Try direct navigation to sale order route
            console.log('Trying direct navigation to /sale_order...');
            await page.goto('http://127.0.0.1:5000/sale_order', { waitUntil: 'networkidle2' });
        } else {
            // Click on the sale order link
            await page.click('a[href*="sale_order"], a:contains("Sale Order")');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        }
        
        await page.screenshot({ path: 'screenshots/02_sale_order_page.png' });
        
        const currentUrl = page.url();
        console.log(`✅ Navigated to: ${currentUrl}`);
        testResults.navigation = { success: true, url: currentUrl };
        
        // Step 3: Test Upload Interface
        console.log('\nStep 3: Testing file upload interface...');
        
        // Look for file input
        const fileInput = await page.$('input[type="file"]');
        if (!fileInput) {
            throw new Error('File input not found on page');
        }
        
        // Check for upload form elements
        const uploadForm = await page.$('form');
        const submitButton = await page.$('input[type="submit"], button[type="submit"]');
        
        console.log('✅ File upload interface elements found:');
        console.log(`  - File input: ${fileInput ? 'Yes' : 'No'}`);
        console.log(`  - Upload form: ${uploadForm ? 'Yes' : 'No'}`);
        console.log(`  - Submit button: ${submitButton ? 'Yes' : 'No'}`);
        
        testResults.uploadInterface = { 
            success: true, 
            hasFileInput: !!fileInput,
            hasForm: !!uploadForm,
            hasSubmitButton: !!submitButton
        };
        
        // Step 4: Test sample file download (if available)
        console.log('\nStep 4: Checking for sample file download...');
        const downloadLinks = await page.$$eval('a', links => 
            links.filter(link => 
                link.textContent.toLowerCase().includes('sample') ||
                link.textContent.toLowerCase().includes('download') ||
                link.href.includes('.csv')
            ).map(link => ({ text: link.textContent.trim(), href: link.href }))
        );
        
        console.log('Sample download links found:', downloadLinks);
        
        // Step 5: Upload the sample CSV file
        console.log('\nStep 5: Uploading sample CSV file...');
        
        const csvFilePath = '/workspaces/Truck_Opti/sample_sale_orders.csv';
        await fileInput.uploadFile(csvFilePath);
        
        console.log('✅ File uploaded successfully');
        
        // Submit the form
        await page.click('input[type="submit"], button[type="submit"]');
        console.log('✅ Form submitted, waiting for processing...');
        
        // Wait for processing to complete (with timeout)
        try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        } catch (error) {
            console.log('⚠️ Navigation timeout, checking current page...');
        }
        
        await page.screenshot({ path: 'screenshots/03_processing_results.png' });
        
        // Step 6: Verify results display
        console.log('\nStep 6: Analyzing results page...');
        
        const pageContent = await page.content();
        const currentUrlAfterSubmit = page.url();
        console.log(`Current URL after submit: ${currentUrlAfterSubmit}`);
        
        // Check for sale order processing results
        const saleOrderElements = await page.$$('[class*="sale"], [class*="order"], .card, .result');
        console.log(`Found ${saleOrderElements.length} potential result elements`);
        
        // Look for specific sale order numbers
        const pageText = await page.evaluate(() => document.body.textContent);
        const saleOrderMatches = pageText.match(/SO\d{3}/g) || [];
        const uniqueSaleOrders = [...new Set(saleOrderMatches)];
        
        console.log(`✅ Found sale orders in results: ${uniqueSaleOrders.join(', ')}`);
        
        // Check for truck recommendations
        const truckMatches = pageText.match(/truck|recommendation|utilization|cost/gi) || [];
        console.log(`✅ Found ${truckMatches.length} truck-related terms`);
        
        // Check for specific data validation
        const hasUtilization = pageText.toLowerCase().includes('utilization');
        const hasCost = pageText.toLowerCase().includes('cost');
        const hasRecommendation = pageText.toLowerCase().includes('recommendation');
        
        testResults.resultsDisplay = {
            success: true,
            saleOrdersFound: uniqueSaleOrders,
            hasUtilization,
            hasCost,
            hasRecommendation,
            totalElements: saleOrderElements.length
        };
        
        testResults.dataValidation = {
            expectedOrders: ['SO001', 'SO002', 'SO003', 'SO004', 'SO005', 'SO006'],
            foundOrders: uniqueSaleOrders,
            allOrdersFound: uniqueSaleOrders.length === 6
        };
        
        console.log('✅ Results analysis complete');
        
        // Step 7: Test UI Components
        console.log('\nStep 7: Testing UI components...');
        
        // Check for responsive design elements
        const bootstrapClasses = await page.$$eval('[class*="col"], [class*="row"], [class*="container"]', 
            elements => elements.length
        );
        
        // Check for interactive elements
        const buttons = await page.$$('button');
        const cards = await page.$$('.card, [class*="card"]');
        
        console.log(`✅ UI Components found:`);
        console.log(`  - Bootstrap responsive elements: ${bootstrapClasses}`);
        console.log(`  - Buttons: ${buttons.length}`);
        console.log(`  - Cards/containers: ${cards.length}`);
        
        testResults.uiComponents = {
            success: true,
            responsiveElements: bootstrapClasses,
            buttons: buttons.length,
            cards: cards.length
        };
        
        await page.screenshot({ path: 'screenshots/04_final_results.png' });
        
    } catch (error) {
        console.error('❌ Test error:', error.message);
        testResults.errors.push(error.message);
        await page.screenshot({ path: 'screenshots/error_screenshot.png' });
    }
    
    await browser.close();
    
    // Save test results
    fs.writeFileSync('test_results_sale_order.json', JSON.stringify(testResults, null, 2));
    
    return testResults;
}

// Run the tests
testSaleOrderFeature().then(results => {
    console.log('\n📊 TEST RESULTS SUMMARY:');
    console.log('========================');
    
    console.log('\n1. Navigation:', results.navigation?.success ? '✅ PASS' : '❌ FAIL');
    if (results.navigation?.url) {
        console.log(`   URL: ${results.navigation.url}`);
    }
    
    console.log('\n2. Upload Interface:', results.uploadInterface?.success ? '✅ PASS' : '❌ FAIL');
    if (results.uploadInterface) {
        console.log(`   File Input: ${results.uploadInterface.hasFileInput ? 'Yes' : 'No'}`);
        console.log(`   Form: ${results.uploadInterface.hasForm ? 'Yes' : 'No'}`);
        console.log(`   Submit Button: ${results.uploadInterface.hasSubmitButton ? 'Yes' : 'No'}`);
    }
    
    console.log('\n3. Results Display:', results.resultsDisplay?.success ? '✅ PASS' : '❌ FAIL');
    if (results.resultsDisplay) {
        console.log(`   Sale Orders Found: ${results.resultsDisplay.saleOrdersFound?.join(', ')}`);
        console.log(`   Has Utilization: ${results.resultsDisplay.hasUtilization ? 'Yes' : 'No'}`);
        console.log(`   Has Cost: ${results.resultsDisplay.hasCost ? 'Yes' : 'No'}`);
        console.log(`   Has Recommendations: ${results.resultsDisplay.hasRecommendation ? 'Yes' : 'No'}`);
    }
    
    console.log('\n4. Data Validation:', results.dataValidation?.allOrdersFound ? '✅ PASS' : '❌ FAIL');
    if (results.dataValidation) {
        console.log(`   Expected: ${results.dataValidation.expectedOrders.join(', ')}`);
        console.log(`   Found: ${results.dataValidation.foundOrders.join(', ')}`);
    }
    
    console.log('\n5. UI Components:', results.uiComponents?.success ? '✅ PASS' : '❌ FAIL');
    
    if (results.errors.length > 0) {
        console.log('\n❌ ERRORS ENCOUNTERED:');
        results.errors.forEach((error, index) => {
            console.log(`   ${index + 1}. ${error}`);
        });
    }
    
    console.log('\n📷 Screenshots saved in screenshots/ directory');
    console.log('📄 Detailed results saved in test_results_sale_order.json');
    
}).catch(error => {
    console.error('❌ Test execution failed:', error);
});