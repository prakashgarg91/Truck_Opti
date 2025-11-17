"""
Frontend UI Automation Tests
Comprehensive browser testing to ensure zero human debugging required
"""

import pytest
import time
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import Select
from selenium.common.exceptions import TimeoutException, NoSuchElementException


@pytest.mark.ui
@pytest.mark.critical
class TestMainPageFunctionality:
    """Test main page UI functionality"""
    
    def test_page_loads_successfully(self, browser, test_server, screenshot_helper):
        """Test that main page loads without errors"""
        browser.get(test_server)
        
        # Wait for page to load
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
        
        # Take screenshot for evidence
        screenshot_helper.take_screenshot("main_page_loaded")
        
        # Verify basic page elements
        assert "TruckOptimum" in browser.title
        
        # Check for main navigation elements
        assert browser.find_element(By.CLASS_NAME, "navbar")
        
        # Verify no JavaScript errors (check console logs)
        logs = browser.get_log('browser')
        errors = [log for log in logs if log['level'] == 'SEVERE']
        assert len(errors) == 0, f"JavaScript errors found: {errors}"
    
    def test_navigation_functionality(self, browser, test_server, screenshot_helper):
        """Test navigation between pages"""
        browser.get(test_server)
        
        # Test navigation to Trucks page
        trucks_link = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.LINK_TEXT, "Trucks"))
        )
        trucks_link.click()
        
        # Verify we're on trucks page
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "trucks-container"))
        )
        screenshot_helper.take_screenshot("trucks_page_navigation")
        
        # Test navigation to Cartons page
        cartons_link = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.LINK_TEXT, "Cartons"))
        )
        cartons_link.click()
        
        # Verify we're on cartons page
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartons-container"))
        )
        screenshot_helper.take_screenshot("cartons_page_navigation")
        
        # Test navigation back to Optimize page
        optimize_link = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.LINK_TEXT, "Optimize"))
        )
        optimize_link.click()
        
        # Verify we're on optimize page
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "selected-cartons-container"))
        )
        screenshot_helper.take_screenshot("optimize_page_navigation")


@pytest.mark.ui
@pytest.mark.critical
class TestCartonManagement:
    """Test carton management functionality"""
    
    def test_add_carton_functionality(self, browser, test_server, screenshot_helper):
        """Test adding new carton through UI"""
        browser.get(f"{test_server}/cartons")
        
        # Wait for page to load
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartons-container"))
        )
        
        # Click Add Carton button
        add_button = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.ID, "add-carton-btn"))
        )
        add_button.click()
        
        # Wait for modal to appear
        modal = WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartonModal"))
        )
        
        screenshot_helper.take_screenshot("add_carton_modal_opened")
        
        # Fill in carton details
        name_field = browser.find_element(By.ID, "cartonName")
        name_field.clear()
        name_field.send_keys("UI Test Carton")
        
        length_field = browser.find_element(By.ID, "cartonLength")
        length_field.clear()
        length_field.send_keys("2.5")
        
        width_field = browser.find_element(By.ID, "cartonWidth")
        width_field.clear()
        width_field.send_keys("1.5")
        
        height_field = browser.find_element(By.ID, "cartonHeight")
        height_field.clear()
        height_field.send_keys("1.0")
        
        weight_field = browser.find_element(By.ID, "cartonWeight")
        weight_field.clear()
        weight_field.send_keys("25.0")
        
        quantity_field = browser.find_element(By.ID, "cartonQuantity")
        quantity_field.clear()
        quantity_field.send_keys("15")
        
        screenshot_helper.take_screenshot("add_carton_form_filled")
        
        # Submit the form
        save_button = browser.find_element(By.ID, "save-carton-btn")
        save_button.click()
        
        # Wait for modal to close and page to refresh
        WebDriverWait(browser, 10).until(
            EC.invisibility_of_element_located((By.ID, "cartonModal"))
        )
        
        time.sleep(2)  # Allow time for page refresh
        
        # Verify carton was added
        carton_cards = browser.find_elements(By.CLASS_NAME, "carton-card")
        carton_names = [card.find_element(By.TAG_NAME, "h5").text for card in carton_cards]
        
        assert "UI Test Carton" in carton_names, "New carton not found in list"
        screenshot_helper.take_screenshot("carton_added_successfully")
    
    def test_edit_carton_functionality(self, browser, test_server, screenshot_helper):
        """Test editing existing carton through UI"""
        browser.get(f"{test_server}/cartons")
        
        # Wait for page to load
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartons-container"))
        )
        
        # Find first carton edit button
        edit_buttons = WebDriverWait(browser, 10).until(
            EC.presence_of_all_elements_located((By.CLASS_NAME, "edit-carton-btn"))
        )
        
        if edit_buttons:
            edit_buttons[0].click()
            
            # Wait for modal to appear
            modal = WebDriverWait(browser, 10).until(
                EC.presence_of_element_located((By.ID, "cartonModal"))
            )
            
            screenshot_helper.take_screenshot("edit_carton_modal_opened")
            
            # Modify the name
            name_field = browser.find_element(By.ID, "cartonName")
            original_name = name_field.get_attribute("value")
            name_field.clear()
            name_field.send_keys(f"EDITED - {original_name}")
            
            screenshot_helper.take_screenshot("carton_name_edited")
            
            # Save changes
            save_button = browser.find_element(By.ID, "save-carton-btn")
            save_button.click()
            
            # Wait for modal to close
            WebDriverWait(browser, 10).until(
                EC.invisibility_of_element_located((By.ID, "cartonModal"))
            )
            
            time.sleep(2)  # Allow time for page refresh
            
            # Verify changes were saved
            carton_cards = browser.find_elements(By.CLASS_NAME, "carton-card")
            carton_names = [card.find_element(By.TAG_NAME, "h5").text for card in carton_cards]
            
            edited_name_found = any("EDITED -" in name for name in carton_names)
            assert edited_name_found, "Edited carton name not found"
            screenshot_helper.take_screenshot("carton_edited_successfully")
    
    def test_bulk_upload_cartons(self, browser, test_server, screenshot_helper, test_csv_file):
        """Test bulk upload functionality"""
        browser.get(f"{test_server}/cartons")
        
        # Wait for page to load
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartons-container"))
        )
        
        # Find and click bulk upload button
        bulk_upload_btn = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.ID, "bulk-upload-btn"))
        )
        bulk_upload_btn.click()
        
        # Wait for upload modal
        upload_modal = WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "bulkUploadModal"))
        )
        
        screenshot_helper.take_screenshot("bulk_upload_modal_opened")
        
        # Upload file
        file_input = browser.find_element(By.ID, "csvFile")
        file_input.send_keys(test_csv_file)
        
        screenshot_helper.take_screenshot("csv_file_selected")
        
        # Submit upload
        upload_button = browser.find_element(By.ID, "upload-csv-btn")
        upload_button.click()
        
        # Wait for upload to complete (modal should close)
        WebDriverWait(browser, 15).until(
            EC.invisibility_of_element_located((By.ID, "bulkUploadModal"))
        )
        
        time.sleep(3)  # Allow time for page refresh
        
        screenshot_helper.take_screenshot("bulk_upload_completed")


@pytest.mark.ui
@pytest.mark.critical
class TestTruckManagement:
    """Test truck management functionality"""
    
    def test_add_truck_functionality(self, browser, test_server, screenshot_helper):
        """Test adding new truck through UI"""
        browser.get(f"{test_server}/trucks")
        
        # Wait for page to load
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "trucks-container"))
        )
        
        # Click Add Truck button
        add_button = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.ID, "add-truck-btn"))
        )
        add_button.click()
        
        # Wait for modal to appear
        modal = WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "truckModal"))
        )
        
        screenshot_helper.take_screenshot("add_truck_modal_opened")
        
        # Fill in truck details
        name_field = browser.find_element(By.ID, "truckName")
        name_field.clear()
        name_field.send_keys("UI Test Truck")
        
        length_field = browser.find_element(By.ID, "truckLength")
        length_field.clear()
        length_field.send_keys("12.0")
        
        width_field = browser.find_element(By.ID, "truckWidth")
        width_field.clear()
        width_field.send_keys("2.5")
        
        height_field = browser.find_element(By.ID, "truckHeight")
        height_field.clear()
        height_field.send_keys("3.0")
        
        weight_field = browser.find_element(By.ID, "truckWeight")
        weight_field.clear()
        weight_field.send_keys("8000.0")
        
        cost_field = browser.find_element(By.ID, "truckCost")
        cost_field.clear()
        cost_field.send_keys("3.5")
        
        screenshot_helper.take_screenshot("add_truck_form_filled")
        
        # Submit the form
        save_button = browser.find_element(By.ID, "save-truck-btn")
        save_button.click()
        
        # Wait for modal to close and page to refresh
        WebDriverWait(browser, 10).until(
            EC.invisibility_of_element_located((By.ID, "truckModal"))
        )
        
        time.sleep(2)  # Allow time for page refresh
        
        # Verify truck was added
        truck_cards = browser.find_elements(By.CLASS_NAME, "truck-card")
        truck_names = [card.find_element(By.TAG_NAME, "h5").text for card in truck_cards]
        
        assert "UI Test Truck" in truck_names, "New truck not found in list"
        screenshot_helper.take_screenshot("truck_added_successfully")


@pytest.mark.ui
@pytest.mark.critical
class TestOptimizationWorkflow:
    """Test the main optimization workflow"""
    
    def test_carton_selection_and_optimization(self, browser, test_server, screenshot_helper):
        """Test complete carton selection and optimization workflow"""
        browser.get(f"{test_server}/optimize")
        
        # Wait for page to load
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "selected-cartons-container"))
        )
        
        screenshot_helper.take_screenshot("optimize_page_loaded")
        
        # Click "Add New Carton Type" button to open carton selection
        add_carton_btn = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.ID, "add-carton-type-btn"))
        )
        add_carton_btn.click()
        
        # Wait for carton selection modal
        carton_modal = WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartonSelectionModal"))
        )
        
        screenshot_helper.take_screenshot("carton_selection_modal_opened")
        
        # Select first carton from available list
        carton_cards = WebDriverWait(browser, 10).until(
            EC.presence_of_all_elements_located((By.CLASS_NAME, "available-carton-card"))
        )
        
        if carton_cards:
            # Click on first carton to select it
            carton_cards[0].click()
            
            # Set quantity
            quantity_input = browser.find_element(By.ID, "carton-quantity-input")
            quantity_input.clear()
            quantity_input.send_keys("10")
            
            screenshot_helper.take_screenshot("carton_selected_quantity_set")
            
            # Add to selection
            add_selected_btn = browser.find_element(By.ID, "add-selected-carton-btn")
            add_selected_btn.click()
            
            # Close modal
            close_btn = browser.find_element(By.CLASS_NAME, "btn-secondary")
            close_btn.click()
            
            # Wait for modal to close
            WebDriverWait(browser, 10).until(
                EC.invisibility_of_element_located((By.ID, "cartonSelectionModal"))
            )
            
            screenshot_helper.take_screenshot("carton_selection_completed")
            
            # Verify carton appears in selected cartons list
            selected_cartons = browser.find_elements(By.CLASS_NAME, "selected-carton-item")
            assert len(selected_cartons) > 0, "No cartons found in selection"
            
            # Select algorithm
            algorithm_select = Select(browser.find_element(By.ID, "algorithm-select"))
            algorithm_select.select_by_value("best_fit")
            
            screenshot_helper.take_screenshot("algorithm_selected")
            
            # Run optimization
            optimize_btn = WebDriverWait(browser, 10).until(
                EC.element_to_be_clickable((By.ID, "optimize-btn"))
            )
            optimize_btn.click()
            
            # Wait for results to load (this may take a moment)
            WebDriverWait(browser, 15).until(
                EC.presence_of_element_located((By.ID, "optimization-results"))
            )
            
            screenshot_helper.take_screenshot("optimization_results_displayed")
            
            # Verify results are displayed
            results_container = browser.find_element(By.ID, "optimization-results")
            assert results_container.is_displayed(), "Optimization results not displayed"
            
            # Check for total cost display
            total_cost_element = browser.find_element(By.ID, "total-cost")
            assert total_cost_element.text, "Total cost not displayed"
            
            screenshot_helper.take_screenshot("optimization_workflow_completed")
    
    def test_bulk_csv_upload_for_optimization(self, browser, test_server, screenshot_helper, test_csv_file):
        """Test bulk CSV upload for carton quantities in optimization"""
        browser.get(f"{test_server}/optimize")
        
        # Wait for page to load
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "selected-cartons-container"))
        )
        
        # Click bulk upload button for optimization
        bulk_upload_btn = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.ID, "bulk-upload-cartons-btn"))
        )
        bulk_upload_btn.click()
        
        # Wait for bulk upload modal
        bulk_modal = WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "bulkCartonUploadModal"))
        )
        
        screenshot_helper.take_screenshot("bulk_carton_upload_modal_opened")
        
        # Upload CSV file
        file_input = browser.find_element(By.ID, "bulk-carton-csv-file")
        file_input.send_keys(test_csv_file)
        
        screenshot_helper.take_screenshot("bulk_csv_file_selected")
        
        # Upload and process
        upload_btn = browser.find_element(By.ID, "upload-bulk-cartons-btn")
        upload_btn.click()
        
        # Wait for upload to complete
        WebDriverWait(browser, 15).until(
            EC.invisibility_of_element_located((By.ID, "bulkCartonUploadModal"))
        )
        
        time.sleep(2)  # Allow processing
        
        # Verify cartons were loaded
        selected_cartons = browser.find_elements(By.CLASS_NAME, "selected-carton-item")
        assert len(selected_cartons) > 0, "No cartons loaded from CSV"
        
        screenshot_helper.take_screenshot("bulk_csv_cartons_loaded")


@pytest.mark.ui
@pytest.mark.performance
class TestUIPerformance:
    """Test UI performance and responsiveness"""
    
    def test_page_load_performance(self, browser, test_server, performance_monitor):
        """Test page load performance"""
        # Test main pages
        pages_to_test = [
            ("optimize", "/optimize"),
            ("trucks", "/trucks"),
            ("cartons", "/cartons")
        ]
        
        for page_name, page_url in pages_to_test:
            performance_monitor.start_timer(f"page_load_{page_name}")
            
            browser.get(f"{test_server}{page_url}")
            
            # Wait for page to be fully loaded
            WebDriverWait(browser, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
            
            # Wait for any dynamic content to load
            time.sleep(1)
            
            duration = performance_monitor.end_timer(f"page_load_{page_name}")
            
            # Page should load within reasonable time
            assert duration < 5.0, f"{page_name} page loaded too slowly: {duration:.3f}s"
    
    def test_modal_responsiveness(self, browser, test_server, performance_monitor):
        """Test modal opening/closing responsiveness"""
        browser.get(f"{test_server}/cartons")
        
        # Wait for page to load
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartons-container"))
        )
        
        # Test modal opening speed
        performance_monitor.start_timer("modal_open")
        
        add_button = browser.find_element(By.ID, "add-carton-btn")
        add_button.click()
        
        # Wait for modal to appear
        WebDriverWait(browser, 5).until(
            EC.presence_of_element_located((By.ID, "cartonModal"))
        )
        
        modal_open_time = performance_monitor.end_timer("modal_open")
        
        # Test modal closing speed
        performance_monitor.start_timer("modal_close")
        
        close_button = browser.find_element(By.CLASS_NAME, "btn-secondary")
        close_button.click()
        
        # Wait for modal to disappear
        WebDriverWait(browser, 5).until(
            EC.invisibility_of_element_located((By.ID, "cartonModal"))
        )
        
        modal_close_time = performance_monitor.end_timer("modal_close")
        
        # Modals should be responsive
        assert modal_open_time < 1.0, f"Modal opened too slowly: {modal_open_time:.3f}s"
        assert modal_close_time < 1.0, f"Modal closed too slowly: {modal_close_time:.3f}s"


@pytest.mark.ui
@pytest.mark.regression
class TestUIRegression:
    """Regression tests to prevent UI breaking changes"""
    
    def test_critical_buttons_present(self, browser, test_server):
        """Test that all critical buttons are present and clickable"""
        # Test optimize page buttons
        browser.get(f"{test_server}/optimize")
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "selected-cartons-container"))
        )
        
        critical_buttons = [
            "add-carton-type-btn",
            "bulk-upload-cartons-btn", 
            "optimize-btn"
        ]
        
        for button_id in critical_buttons:
            button = WebDriverWait(browser, 10).until(
                EC.presence_of_element_located((By.ID, button_id))
            )
            assert button.is_displayed(), f"Button {button_id} not visible"
            assert button.is_enabled(), f"Button {button_id} not enabled"
    
    def test_navigation_links_working(self, browser, test_server):
        """Test that all navigation links work correctly"""
        browser.get(test_server)
        
        # Test each navigation link
        nav_links = [
            ("Optimize", "/optimize"),
            ("Trucks", "/trucks"),
            ("Cartons", "/cartons")
        ]
        
        for link_text, expected_path in nav_links:
            # Find and click navigation link
            nav_link = WebDriverWait(browser, 10).until(
                EC.element_to_be_clickable((By.LINK_TEXT, link_text))
            )
            nav_link.click()
            
            # Wait a moment for navigation
            time.sleep(1)
            
            # Verify we're on the correct page
            current_url = browser.current_url
            assert expected_path in current_url, f"Navigation to {link_text} failed. Current URL: {current_url}"
    
    def test_form_validation_messages(self, browser, test_server, screenshot_helper):
        """Test that form validation messages appear correctly"""
        browser.get(f"{test_server}/cartons")
        
        # Wait for page to load
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartons-container"))
        )
        
        # Open add carton modal
        add_button = browser.find_element(By.ID, "add-carton-btn")
        add_button.click()
        
        # Wait for modal
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartonModal"))
        )
        
        # Try to submit empty form
        save_button = browser.find_element(By.ID, "save-carton-btn")
        save_button.click()
        
        screenshot_helper.take_screenshot("form_validation_test")
        
        # Check if validation prevented submission (modal should still be open)
        time.sleep(1)
        modal = browser.find_element(By.ID, "cartonModal")
        assert modal.is_displayed(), "Form validation should prevent empty submission"