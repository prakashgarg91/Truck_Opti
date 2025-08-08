const puppeteer = require('puppeteer');

async function testHomepageAndDashboard() {
    console.log('🏠 STARTING HOMEPAGE AND DASHBOARD COMPREHENSIVE TESTING');
    console.log('=' .repeat(80));
    
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    let results = {
        homepage: {},
        navigation: {},
        dashboard: {},
        responsive: {},
        performance: {},
        issues: []
    };
    
    try {
        // Set viewport for desktop testing
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Test 1: Homepage Loading
        console.log('\n📊 Test 1: Homepage Loading and Basic Functionality');
        const startTime = Date.now();
        
        const response = await page.goto('http://127.0.0.1:5000', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        
        const loadTime = Date.now() - startTime;
        results.performance.loadTime = loadTime;
        
        console.log(`   ✅ Homepage loaded successfully in ${loadTime}ms`);
        console.log(`   ✅ Status code: ${response.status()}`);
        
        if (response.status() !== 200) {
            results.issues.push(`Homepage returned status ${response.status()}`);
        }
        
        // Test page title
        const title = await page.title();
        results.homepage.title = title;
        console.log(`   📝 Page title: "${title}"`);
        
        // Test 2: Navigation Links
        console.log('\n🔗 Test 2: Navigation Links Verification');
        
        const navLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('.navbar a, .nav-link'));
            return links.map(link => ({
                text: link.textContent.trim(),
                href: link.href,
                visible: link.offsetParent !== null
            }));
        });
        
        results.navigation.links = navLinks;
        console.log(`   📊 Found ${navLinks.length} navigation links:`);
        
        for (const link of navLinks) {
            console.log(`   - "${link.text}": ${link.href} ${link.visible ? '✅' : '❌ Hidden'}`);
        }
        
        // Test 3: Dashboard KPI Widgets
        console.log('\n📈 Test 3: Dashboard KPI Widgets and Content');
        
        const dashboardElements = await page.evaluate(() => {
            return {
                kpiCards: document.querySelectorAll('.kpi-card, .card').length,
                charts: document.querySelectorAll('.chart, canvas').length,
                buttons: document.querySelectorAll('.btn').length,
                tables: document.querySelectorAll('.table').length,
                widgets: document.querySelectorAll('.widget, .dashboard-widget').length
            };
        });
        
        results.dashboard = dashboardElements;
        console.log(`   📊 KPI Cards found: ${dashboardElements.kpiCards}`);
        console.log(`   📈 Charts found: ${dashboardElements.charts}`);
        console.log(`   🔘 Buttons found: ${dashboardElements.buttons}`);
        console.log(`   📋 Tables found: ${dashboardElements.tables}`);
        console.log(`   🎛️ Widgets found: ${dashboardElements.widgets}`);
        
        // Test 4: Check for main dashboard sections
        const mainSections = await page.evaluate(() => {
            return {
                hasMainContent: !!document.querySelector('.main-content, .container, .dashboard'),
                hasNavbar: !!document.querySelector('.navbar, nav'),
                hasFooter: !!document.querySelector('.footer, footer'),
                hasSidebar: !!document.querySelector('.sidebar, .side-nav'),
                hasWelcomeSection: !!document.querySelector('.welcome, .hero, .jumbotron')
            };
        });
        
        results.homepage.sections = mainSections;
        console.log('\n🏗️ Page Structure:');
        Object.entries(mainSections).forEach(([key, value]) => {
            console.log(`   ${value ? '✅' : '❌'} ${key}: ${value}`);
        });
        
        // Test 5: Test Quick Actions/Navigation
        console.log('\n⚡ Test 5: Testing Quick Action Links');
        
        const quickActionLinks = [
            { name: 'Truck Types', selector: 'a[href*="truck"], a[href*="/truck-types"]' },
            { name: 'Carton Types', selector: 'a[href*="carton"], a[href*="/carton-types"]' },
            { name: 'Pack Cartons', selector: 'a[href*="pack"], a[href*="fit"], a[href*="optimize"]' },
            { name: 'Analytics', selector: 'a[href*="analytic"], a[href*="/analytics"]' }
        ];
        
        results.navigation.quickActions = {};
        
        for (const action of quickActionLinks) {
            try {
                const element = await page.$(action.selector);
                const exists = !!element;
                results.navigation.quickActions[action.name] = exists;
                console.log(`   ${exists ? '✅' : '❌'} ${action.name} link: ${exists ? 'Found' : 'Not found'}`);
                
                if (exists) {
                    const href = await page.evaluate(el => el.href, element);
                    console.log(`      URL: ${href}`);
                }
            } catch (error) {
                console.log(`   ❌ ${action.name}: Error checking - ${error.message}`);
                results.issues.push(`${action.name} link check failed: ${error.message}`);
            }
        }
        
        // Test 6: Check for JavaScript errors
        console.log('\n🐛 Test 6: JavaScript Console Errors');
        
        const consoleMessages = [];
        page.on('console', message => {
            consoleMessages.push({
                type: message.type(),
                text: message.text()
            });
        });
        
        page.on('pageerror', error => {
            results.issues.push(`JavaScript error: ${error.message}`);
            console.log(`   ❌ JavaScript Error: ${error.message}`);
        });
        
        // Wait a bit to catch any delayed JS errors
        await page.waitForTimeout(2000);
        
        const errors = consoleMessages.filter(msg => msg.type === 'error');
        const warnings = consoleMessages.filter(msg => msg.type === 'warning');
        
        console.log(`   📊 Console messages: ${consoleMessages.length} total, ${errors.length} errors, ${warnings.length} warnings`);
        
        if (errors.length > 0) {
            console.log('   ❌ JavaScript Errors found:');
            errors.forEach(error => console.log(`      - ${error.text}`));
        } else {
            console.log('   ✅ No JavaScript errors detected');
        }
        
        // Test 7: Responsive Design - Mobile View
        console.log('\n📱 Test 7: Mobile Responsiveness Testing');
        
        await page.setViewport({ width: 375, height: 667 }); // iPhone 6/7/8 size
        await page.waitForTimeout(1000);
        
        const mobileLayout = await page.evaluate(() => {
            return {
                navbarCollapsed: !!document.querySelector('.navbar-collapse.show, .navbar-toggler'),
                mainContentVisible: !!document.querySelector('.main-content, .container').offsetParent,
                hasHamburgerMenu: !!document.querySelector('.navbar-toggler, .hamburger'),
                textReadable: window.getComputedStyle(document.body).fontSize
            };
        });
        
        results.responsive.mobile = mobileLayout;
        console.log('   📊 Mobile Layout Analysis:');
        Object.entries(mobileLayout).forEach(([key, value]) => {
            console.log(`      ${key}: ${value}`);
        });
        
        // Test 8: Tablet View
        console.log('\n📺 Test 8: Tablet Responsiveness Testing');
        
        await page.setViewport({ width: 768, height: 1024 }); // iPad size
        await page.waitForTimeout(1000);
        
        const tabletLayout = await page.evaluate(() => {
            return {
                layoutBalanced: window.innerWidth >= 768,
                contentFitsScreen: document.documentElement.scrollWidth <= window.innerWidth,
                navigationVisible: !!document.querySelector('.navbar, nav').offsetParent
            };
        });
        
        results.responsive.tablet = tabletLayout;
        console.log('   📊 Tablet Layout Analysis:');
        Object.entries(tabletLayout).forEach(([key, value]) => {
            console.log(`      ${key}: ${value}`);
        });
        
        // Test 9: Check for Critical CSS and Bootstrap
        console.log('\n🎨 Test 9: CSS Framework and Styling Analysis');
        
        await page.setViewport({ width: 1920, height: 1080 }); // Back to desktop
        
        const stylingAnalysis = await page.evaluate(() => {
            const computedStyle = window.getComputedStyle(document.body);
            return {
                hasBootstrap: !!document.querySelector('link[href*="bootstrap"], .container, .row, .col'),
                fontFamily: computedStyle.fontFamily,
                backgroundColor: computedStyle.backgroundColor,
                hasCustomCSS: !!document.querySelector('link[href*="style.css"], style'),
                responsiveUnits: document.styleSheets.length > 0
            };
        });
        
        results.homepage.styling = stylingAnalysis;
        console.log('   🎨 Styling Analysis:');
        Object.entries(stylingAnalysis).forEach(([key, value]) => {
            console.log(`      ${key}: ${value}`);
        });
        
        // Test 10: Performance Metrics
        console.log('\n⚡ Test 10: Performance Metrics Analysis');
        
        const performanceMetrics = await page.evaluate(() => {
            return {
                domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
                pageLoad: performance.timing.loadEventEnd - performance.timing.navigationStart,
                domElements: document.querySelectorAll('*').length,
                images: document.images.length,
                scripts: document.scripts.length,
                stylesheets: document.styleSheets.length
            };
        });
        
        results.performance = { ...results.performance, ...performanceMetrics };
        console.log('   📊 Performance Metrics:');
        Object.entries(performanceMetrics).forEach(([key, value]) => {
            console.log(`      ${key}: ${value}${key.includes('Load') ? 'ms' : ''}`);
        });
        
    } catch (error) {
        console.error('❌ Error during homepage testing:', error);
        results.issues.push(`Homepage test error: ${error.message}`);
    } finally {
        await browser.close();
    }
    
    // Generate Summary Report
    console.log('\n' + '='.repeat(80));
    console.log('📋 HOMEPAGE AND DASHBOARD TEST SUMMARY');
    console.log('='.repeat(80));
    
    const score = calculateHomepageScore(results);
    console.log(`🎯 Overall Score: ${score.total}/100`);
    console.log(`📊 Performance: ${score.performance}/25`);
    console.log(`🔗 Navigation: ${score.navigation}/25`);
    console.log(`📱 Responsiveness: ${score.responsive}/25`);
    console.log(`🏠 Functionality: ${score.functionality}/25`);
    
    console.log('\n✅ STRENGTHS:');
    if (results.performance.loadTime < 2000) console.log('   - Fast loading time');
    if (results.navigation.links.length > 5) console.log('   - Comprehensive navigation');
    if (results.dashboard.kpiCards > 0) console.log('   - Dashboard widgets present');
    if (results.issues.length === 0) console.log('   - No JavaScript errors detected');
    
    console.log('\n⚠️ ISSUES TO ADDRESS:');
    if (results.issues.length > 0) {
        results.issues.forEach(issue => console.log(`   - ${issue}`));
    } else {
        console.log('   - No critical issues found');
    }
    
    console.log('\n📊 RECOMMENDATIONS:');
    if (results.performance.loadTime > 3000) console.log('   - Optimize page loading speed');
    if (!results.homepage.sections.hasWelcomeSection) console.log('   - Consider adding a welcome/hero section');
    if (results.navigation.links.length < 5) console.log('   - Add more navigation options');
    
    return results;
}

function calculateHomepageScore(results) {
    let performance = 0;
    let navigation = 0;
    let responsive = 0;
    let functionality = 0;
    
    // Performance scoring (25 points)
    if (results.performance.loadTime < 1000) performance += 15;
    else if (results.performance.loadTime < 2000) performance += 12;
    else if (results.performance.loadTime < 3000) performance += 8;
    else performance += 4;
    
    if (results.issues.length === 0) performance += 10;
    else if (results.issues.length <= 2) performance += 5;
    
    // Navigation scoring (25 points)
    if (results.navigation.links && results.navigation.links.length >= 8) navigation += 15;
    else if (results.navigation.links && results.navigation.links.length >= 5) navigation += 10;
    else navigation += 5;
    
    if (results.navigation.quickActions) {
        const actionCount = Object.values(results.navigation.quickActions).filter(Boolean).length;
        navigation += Math.min(actionCount * 2, 10);
    }
    
    // Responsiveness scoring (25 points)
    if (results.responsive.mobile && results.responsive.tablet) {
        responsive += 15;
    } else if (results.responsive.mobile || results.responsive.tablet) {
        responsive += 8;
    }
    
    if (results.homepage.styling && results.homepage.styling.hasBootstrap) responsive += 10;
    
    // Functionality scoring (25 points)
    if (results.dashboard.kpiCards > 0) functionality += 8;
    if (results.dashboard.buttons > 0) functionality += 5;
    if (results.homepage.sections && results.homepage.sections.hasMainContent) functionality += 7;
    if (results.homepage.sections && results.homepage.sections.hasNavbar) functionality += 5;
    
    return {
        performance,
        navigation,
        responsive,
        functionality,
        total: performance + navigation + responsive + functionality
    };
}

// Run the test
testHomepageAndDashboard().then(results => {
    console.log('\n🎉 Homepage and Dashboard testing completed!');
    process.exit(0);
}).catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
});