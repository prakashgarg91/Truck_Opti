const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Test Results Storage
let testResults = {
    timestamp: new Date().toISOString(),
    overall_status: 'TESTING',
    tests_passed: 0,
    tests_failed: 0,
    errors: [],
    detailed_results: {},
    recommendations: []
};

// Utility functions
function logTest(testName, status, details = '') {
    console.log(`[${status}] ${testName}: ${details}`);
    if (status === 'PASS') {
        testResults.tests_passed++;
    } else {
        testResults.tests_failed++;
        testResults.errors.push(`${testName}: ${details}`);
    }
    testResults.detailed_results[testName] = { status, details };
}

function addRecommendation(priority, description) {
    testResults.recommendations.push({ priority, description });
}

async function waitForElement(page, selector, timeout = 5000) {
    try {
        await page.waitForSelector(selector, { timeout });
        return true;
    } catch (error) {
        return false;
    }
}

async function takeScreenshot(page, name) {
    const screenshotPath = `/workspaces/Truck_Opti/test_screenshots/${name}_${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved: ${screenshotPath}`);
    return screenshotPath;
}

async function runTruckOptiTests() {
    console.log('🚚 Starting Comprehensive TruckOpti Testing...\n');
    
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    
    try {
        // Create screenshots directory
        const screenshotDir = '/workspaces/Truck_Opti/test_screenshots';
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }

        // 1. BASIC APPLICATION LOADING
        console.log('\n=== 1. BASIC APPLICATION LOADING ===');
        try {
            await page.goto('http://127.0.0.1:5002/', { waitUntil: 'networkidle0', timeout: 30000 });
            await takeScreenshot(page, 'homepage_loaded');
            
            const title = await page.title();
            logTest('Homepage Loading', 'PASS', `Title: ${title}`);
            
            // Check for basic elements
            const hasNavbar = await waitForElement(page, 'nav, .navbar', 3000);
            logTest('Navigation Bar Present', hasNavbar ? 'PASS' : 'FAIL', hasNavbar ? 'Navigation found' : 'No navigation bar detected');
            
            const hasMainContent = await waitForElement(page, 'main, .main-content, #main', 3000);
            logTest('Main Content Present', hasMainContent ? 'PASS' : 'FAIL');
            
        } catch (error) {
            logTest('Homepage Loading', 'FAIL', `Error: ${error.message}`);
        }

        // 2. NAVIGATION TESTING
        console.log('\n=== 2. NAVIGATION TESTING ===');
        try {
            // Test sidebar navigation if present
            const sidebarExists = await page.$('.sidebar, #sidebar, nav[class*="sidebar"]');
            if (sidebarExists) {
                logTest('Sidebar Navigation Present', 'PASS');
                
                // Test navigation links
                const navLinks = await page.$$('.sidebar a, nav a');
                logTest('Navigation Links Count', navLinks.length > 0 ? 'PASS' : 'FAIL', `Found ${navLinks.length} navigation links`);
                
                // Test clicking main navigation items
                const commonNavItems = ['Dashboard', 'Trucks', 'Cartons', 'Optimize', 'Analytics'];
                for (const item of commonNavItems) {
                    try {
                        const link = await page.$x(`//a[contains(text(), '${item}')]`);
                        if (link.length > 0) {
                            await link[0].click();
                            await page.waitForTimeout(1000);
                            await takeScreenshot(page, `nav_${item.toLowerCase()}`);
                            logTest(`Navigation to ${item}`, 'PASS');
                        }
                    } catch (error) {
                        logTest(`Navigation to ${item}`, 'FAIL', error.message);
                    }
                }
            } else {
                logTest('Sidebar Navigation Present', 'FAIL', 'No sidebar navigation found');
            }
        } catch (error) {
            logTest('Navigation Testing', 'FAIL', error.message);
        }

        // 3. TRUCK MANAGEMENT TESTING
        console.log('\n=== 3. TRUCK MANAGEMENT TESTING ===');
        try {
            // Navigate to truck management
            await page.goto('http://127.0.0.1:5002/', { waitUntil: 'networkidle0' });
            
            // Look for truck-related elements
            const truckSection = await page.$('[class*="truck"], [id*="truck"], h1:contains("Truck"), h2:contains("Truck")');
            if (truckSection) {
                logTest('Truck Section Found', 'PASS');
                await takeScreenshot(page, 'truck_management');
                
                // Test adding a new truck
                const addTruckBtn = await page.$('button:contains("Add Truck"), input[value*="Add Truck"], .btn:contains("Truck")');
                if (addTruckBtn) {
                    await addTruckBtn.click();
                    await page.waitForTimeout(1000);
                    logTest('Add Truck Button Works', 'PASS');
                    
                    // Fill truck form if modal/form appears
                    const truckNameInput = await page.$('input[name*="name"], input[id*="name"], input[placeholder*="name"]');
                    if (truckNameInput) {
                        await truckNameInput.type('Test Truck');
                        await page.waitForTimeout(500);
                        logTest('Truck Form Input', 'PASS');
                    }
                } else {
                    logTest('Add Truck Button Found', 'FAIL', 'No add truck button found');
                }
            } else {
                logTest('Truck Section Found', 'FAIL', 'No truck management section found');
            }
        } catch (error) {
            logTest('Truck Management Testing', 'FAIL', error.message);
        }

        // 4. CARTON MANAGEMENT TESTING
        console.log('\n=== 4. CARTON MANAGEMENT TESTING ===');
        try {
            // Look for carton-related elements
            const cartonSection = await page.$('[class*="carton"], [id*="carton"], h1:contains("Carton"), h2:contains("Carton")');
            if (cartonSection) {
                logTest('Carton Section Found', 'PASS');
                await takeScreenshot(page, 'carton_management');
                
                // Test different carton combinations for recommendation testing
                const testCartons = [
                    { name: 'Small Box', length: 10, width: 10, height: 10, weight: 5 },
                    { name: 'Medium Box', length: 20, width: 15, height: 12, weight: 10 },
                    { name: 'Large Box', length: 30, width: 25, height: 20, weight: 25 }
                ];
                
                for (const carton of testCartons) {
                    try {
                        const addCartonBtn = await page.$('button:contains("Add Carton"), input[value*="Add Carton"]');
                        if (addCartonBtn) {
                            await addCartonBtn.click();
                            await page.waitForTimeout(1000);
                            
                            // Fill carton details
                            const nameInput = await page.$('input[name*="name"], input[id*="name"]');
                            if (nameInput) {
                                await nameInput.clear();
                                await nameInput.type(carton.name);
                            }
                            
                            logTest(`Add Carton - ${carton.name}`, 'PASS');
                            await takeScreenshot(page, `carton_form_${carton.name.toLowerCase().replace(' ', '_')}`);
                        }
                    } catch (error) {
                        logTest(`Add Carton - ${carton.name}`, 'FAIL', error.message);
                    }
                }
            } else {
                logTest('Carton Section Found', 'FAIL', 'No carton management section found');
            }
        } catch (error) {
            logTest('Carton Management Testing', 'FAIL', error.message);
        }

        // 5. TRUCK RECOMMENDATION SYSTEM TESTING
        console.log('\n=== 5. TRUCK RECOMMENDATION SYSTEM TESTING ===');
        try {
            // Navigate to optimization page
            await page.goto('http://127.0.0.1:5002/', { waitUntil: 'networkidle0' });
            
            // Look for optimize/recommendation button
            const optimizeBtn = await page.$('button:contains("Optimize"), input[value*="Optimize"], .btn:contains("Pack")');
            if (optimizeBtn) {
                logTest('Optimize Button Found', 'PASS');
                
                // Test multiple optimization scenarios
                for (let i = 0; i < 3; i++) {
                    try {
                        await optimizeBtn.click();
                        await page.waitForTimeout(2000); // Wait for processing
                        
                        // Check for recommendation results
                        const recommendationResults = await page.$('.recommendation, .result, [class*="truck-result"]');
                        if (recommendationResults) {
                            const resultText = await page.evaluate(el => el.textContent, recommendationResults);
                            logTest(`Optimization Run ${i+1}`, 'PASS', `Result: ${resultText.substring(0, 100)}...`);
                            
                            // Check if it always recommends the same truck
                            if (resultText.includes('Tata Ace (Chhota Hathi)_0')) {
                                addRecommendation('HIGH', `Optimization Run ${i+1}: Always recommending Tata Ace - lacks diversity`);
                            }
                        } else {
                            logTest(`Optimization Run ${i+1}`, 'FAIL', 'No recommendation results displayed');
                        }
                        
                        await takeScreenshot(page, `optimization_run_${i+1}`);
                    } catch (error) {
                        logTest(`Optimization Run ${i+1}`, 'FAIL', error.message);
                    }
                }
            } else {
                logTest('Optimize Button Found', 'FAIL', 'No optimize button found');
                addRecommendation('CRITICAL', 'Optimize button not found - core functionality missing');
            }
        } catch (error) {
            logTest('Truck Recommendation Testing', 'FAIL', error.message);
        }

        // 6. 3D VISUALIZATION TESTING
        console.log('\n=== 6. 3D VISUALIZATION TESTING ===');
        try {
            // Look for 3D visualization container
            const visualization3D = await page.$('canvas, [class*="three"], [id*="three"], [class*="3d"], [id*="visualization"]');
            if (visualization3D) {
                logTest('3D Visualization Container Found', 'PASS');
                await takeScreenshot(page, '3d_visualization');
                
                // Test 3D controls if present
                const controls = await page.$$('[class*="control"], button[title*="rotate"], button[title*="zoom"]');
                logTest('3D Controls Present', controls.length > 0 ? 'PASS' : 'FAIL', `Found ${controls.length} control elements`);
                
                // Test if 3D scene loads properly
                const canvasElement = await page.$('canvas');
                if (canvasElement) {
                    const canvasVisible = await page.evaluate(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                    }, canvasElement);
                    logTest('3D Canvas Rendering', canvasVisible ? 'PASS' : 'FAIL');
                }
            } else {
                logTest('3D Visualization Container Found', 'FAIL', 'No 3D visualization found');
                addRecommendation('HIGH', '3D visualization not working - key feature for truck loading');
            }
        } catch (error) {
            logTest('3D Visualization Testing', 'FAIL', error.message);
        }

        // 7. MULTI-TRUCK SCENARIO TESTING
        console.log('\n=== 7. MULTI-TRUCK SCENARIO TESTING ===');
        try {
            // This would require creating a scenario that needs multiple trucks
            // For now, we'll check if multi-truck indicators exist
            const multiTruckIndicators = await page.$$('[class*="truck-count"], [class*="1 of"], [id*="truck-nav"]');
            if (multiTruckIndicators.length > 0) {
                logTest('Multi-Truck Indicators Present', 'PASS', `Found ${multiTruckIndicators.length} indicators`);
                
                for (let indicator of multiTruckIndicators) {
                    const text = await page.evaluate(el => el.textContent, indicator);
                    if (text.includes('1 of') || text.includes('2 of') || text.includes('3 of')) {
                        logTest('Multi-Truck Navigation Format', 'PASS', `Found: ${text}`);
                    }
                }
            } else {
                logTest('Multi-Truck Indicators Present', 'FAIL', 'No multi-truck navigation found');
                addRecommendation('HIGH', 'Multi-truck scenarios not properly handled in UI');
            }
        } catch (error) {
            logTest('Multi-Truck Scenario Testing', 'FAIL', error.message);
        }

        // 8. EXPORT FUNCTIONALITY TESTING
        console.log('\n=== 8. EXPORT FUNCTIONALITY TESTING ===');
        try {
            const exportButtons = await page.$$('button:contains("Export"), button:contains("Download"), .btn:contains("CSV"), .btn:contains("Excel"), .btn:contains("PDF")');
            if (exportButtons.length > 0) {
                logTest('Export Buttons Found', 'PASS', `Found ${exportButtons.length} export buttons`);
                
                // Test clicking export buttons
                for (let i = 0; i < Math.min(exportButtons.length, 3); i++) {
                    try {
                        await exportButtons[i].click();
                        await page.waitForTimeout(1000);
                        logTest(`Export Function ${i+1}`, 'PASS', 'Export button clickable');
                    } catch (error) {
                        logTest(`Export Function ${i+1}`, 'FAIL', `Export error: ${error.message}`);
                    }
                }
            } else {
                logTest('Export Buttons Found', 'FAIL', 'No export functionality found');
                addRecommendation('MEDIUM', 'Export functionality missing or not accessible');
            }
        } catch (error) {
            logTest('Export Functionality Testing', 'FAIL', error.message);
        }

        // 9. DASHBOARD AND CHARTS TESTING
        console.log('\n=== 9. DASHBOARD AND CHARTS TESTING ===');
        try {
            // Navigate to dashboard
            const dashboardLink = await page.$x("//a[contains(text(), 'Dashboard')]");
            if (dashboardLink.length > 0) {
                await dashboardLink[0].click();
                await page.waitForTimeout(2000);
                await takeScreenshot(page, 'dashboard');
                
                // Check for charts
                const charts = await page.$$('canvas, svg, [class*="chart"], [id*="chart"]');
                logTest('Dashboard Charts Present', charts.length > 0 ? 'PASS' : 'FAIL', `Found ${charts.length} chart elements`);
                
                // Check for overlapping elements
                const overlappingElements = await page.evaluate(() => {
                    const elements = document.querySelectorAll('*');
                    let overlapping = 0;
                    for (let el of elements) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > window.innerWidth || rect.height > window.innerHeight) {
                            overlapping++;
                        }
                    }
                    return overlapping;
                });
                
                logTest('UI Element Overlap Check', overlappingElements === 0 ? 'PASS' : 'FAIL', 
                       `${overlappingElements} potentially overlapping elements`);
                       
                if (overlappingElements > 0) {
                    addRecommendation('MEDIUM', 'Dashboard has overlapping UI elements that need fixing');
                }
            } else {
                logTest('Dashboard Navigation', 'FAIL', 'No dashboard link found');
            }
        } catch (error) {
            logTest('Dashboard Testing', 'FAIL', error.message);
        }

        // 10. RESPONSIVE DESIGN TESTING
        console.log('\n=== 10. RESPONSIVE DESIGN TESTING ===');
        try {
            const viewports = [
                { width: 375, height: 667, name: 'Mobile' },
                { width: 768, height: 1024, name: 'Tablet' },
                { width: 1920, height: 1080, name: 'Desktop' }
            ];
            
            for (const viewport of viewports) {
                await page.setViewport(viewport);
                await page.waitForTimeout(1000);
                await takeScreenshot(page, `responsive_${viewport.name.toLowerCase()}`);
                
                // Check if mobile menu exists for smaller screens
                if (viewport.width <= 768) {
                    const mobileMenu = await page.$('.mobile-menu, .hamburger, [class*="menu-toggle"]');
                    logTest(`${viewport.name} Menu`, mobileMenu ? 'PASS' : 'FAIL', 
                           mobileMenu ? 'Mobile menu found' : 'No mobile menu adaptation');
                }
                
                // Check for horizontal scrolling issues
                const hasHorizontalScroll = await page.evaluate(() => {
                    return document.body.scrollWidth > window.innerWidth;
                });
                
                logTest(`${viewport.name} Horizontal Scroll`, !hasHorizontalScroll ? 'PASS' : 'FAIL',
                       hasHorizontalScroll ? 'Horizontal scrolling detected' : 'No horizontal scroll');
            }
            
            // Reset to desktop viewport
            await page.setViewport({ width: 1920, height: 1080 });
        } catch (error) {
            logTest('Responsive Design Testing', 'FAIL', error.message);
        }

        // 11. FORM VALIDATION TESTING
        console.log('\n=== 11. FORM VALIDATION TESTING ===');
        try {
            // Test form validation by submitting empty forms
            const forms = await page.$$('form');
            logTest('Forms Found', forms.length > 0 ? 'PASS' : 'FAIL', `Found ${forms.length} forms`);
            
            for (let i = 0; i < Math.min(forms.length, 3); i++) {
                try {
                    const submitBtn = await forms[i].$('button[type="submit"], input[type="submit"]');
                    if (submitBtn) {
                        await submitBtn.click();
                        await page.waitForTimeout(1000);
                        
                        // Check for validation messages
                        const validationMessages = await page.$$('.error, .invalid, [class*="validation"]');
                        logTest(`Form ${i+1} Validation`, validationMessages.length > 0 ? 'PASS' : 'UNKNOWN',
                               `Found ${validationMessages.length} validation elements`);
                    }
                } catch (error) {
                    logTest(`Form ${i+1} Testing`, 'FAIL', error.message);
                }
            }
        } catch (error) {
            logTest('Form Validation Testing', 'FAIL', error.message);
        }

        // 12. ERROR HANDLING TESTING
        console.log('\n=== 12. ERROR HANDLING TESTING ===');
        try {
            // Check for JavaScript errors in console
            const jsErrors = [];
            page.on('pageerror', error => {
                jsErrors.push(error.message);
            });
            
            page.on('console', msg => {
                if (msg.type() === 'error') {
                    jsErrors.push(msg.text());
                }
            });
            
            // Reload page to capture any errors
            await page.reload({ waitUntil: 'networkidle0' });
            await page.waitForTimeout(2000);
            
            logTest('JavaScript Errors', jsErrors.length === 0 ? 'PASS' : 'FAIL', 
                   jsErrors.length > 0 ? `Found ${jsErrors.length} JS errors: ${jsErrors.join(', ')}` : 'No JS errors');
                   
            if (jsErrors.length > 0) {
                addRecommendation('HIGH', `Fix JavaScript errors: ${jsErrors.slice(0, 3).join(', ')}`);
            }
        } catch (error) {
            logTest('Error Handling Testing', 'FAIL', error.message);
        }

    } catch (error) {
        console.error('Critical testing error:', error);
        logTest('Overall Testing', 'FAIL', `Critical error: ${error.message}`);
    } finally {
        await browser.close();
        
        // Calculate overall status
        testResults.overall_status = testResults.tests_failed === 0 ? 'PASS' : 'FAIL';
        
        // Generate final report
        console.log('\n🚚 === TruckOpti COMPREHENSIVE TEST REPORT ===');
        console.log(`Timestamp: ${testResults.timestamp}`);
        console.log(`Overall Status: ${testResults.overall_status}`);
        console.log(`Tests Passed: ${testResults.tests_passed}`);
        console.log(`Tests Failed: ${testResults.tests_failed}`);
        console.log(`Success Rate: ${(testResults.tests_passed / (testResults.tests_passed + testResults.tests_failed) * 100).toFixed(1)}%`);
        
        if (testResults.errors.length > 0) {
            console.log('\n❌ FAILED TESTS:');
            testResults.errors.forEach(error => console.log(`  - ${error}`));
        }
        
        if (testResults.recommendations.length > 0) {
            console.log('\n🔧 RECOMMENDATIONS:');
            const priorityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
            priorityOrder.forEach(priority => {
                const recs = testResults.recommendations.filter(r => r.priority === priority);
                if (recs.length > 0) {
                    console.log(`\n  ${priority} PRIORITY:`);
                    recs.forEach(rec => console.log(`    - ${rec.description}`));
                }
            });
        }
        
        // Save detailed report
        const reportPath = '/workspaces/Truck_Opti/test_results_detailed.json';
        fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);
        
        return testResults;
    }
}

// Run the tests
runTruckOptiTests().catch(console.error);