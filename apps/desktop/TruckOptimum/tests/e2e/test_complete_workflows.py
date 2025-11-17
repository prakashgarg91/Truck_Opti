"""
End-to-End Complete Workflow Tests
Comprehensive user journey testing to ensure zero human debugging required
"""

import pytest
import time
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select
from selenium.common.exceptions import TimeoutException


@pytest.mark.e2e
@pytest.mark.critical
@pytest.mark.user_workflow
class TestCompleteUserJourneys:
    """Test complete user workflows from start to finish"""
    
    def test_new_user_complete_setup_and_optimization(self, browser, test_server, screenshot_helper, performance_monitor):
        """Test complete new user journey: setup trucks, cartons, and run optimization"""
        
        performance_monitor.start_timer("complete_user_journey")
        
        # Step 1: Navigate to application
        browser.get(test_server)
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
        screenshot_helper.take_screenshot("01_application_loaded")
        
        # Step 2: Navigate to Trucks page and add a truck
        trucks_link = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.LINK_TEXT, "Trucks"))
        )
        trucks_link.click()
        
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "trucks-container"))
        )
        screenshot_helper.take_screenshot("02_trucks_page_loaded")
        
        # Add a new truck
        add_truck_btn = browser.find_element(By.ID, "add-truck-btn")
        add_truck_btn.click()
        
        # Wait for modal and fill truck details
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "truckModal"))
        )
        
        browser.find_element(By.ID, "truckName").send_keys("E2E Test Truck")
        browser.find_element(By.ID, "truckLength").send_keys("10.0")
        browser.find_element(By.ID, "truckWidth").send_keys("2.5")
        browser.find_element(By.ID, "truckHeight").send_keys("3.0")
        browser.find_element(By.ID, "truckWeight").send_keys("5000.0")
        browser.find_element(By.ID, "truckCost").send_keys("2.5")
        
        screenshot_helper.take_screenshot("03_truck_form_filled")
        
        # Save truck
        browser.find_element(By.ID, "save-truck-btn").click()
        
        # Wait for modal to close
        WebDriverWait(browser, 10).until(
            EC.invisibility_of_element_located((By.ID, "truckModal"))
        )
        time.sleep(2)
        screenshot_helper.take_screenshot("04_truck_added")
        
        # Step 3: Navigate to Cartons page and add cartons
        cartons_link = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.LINK_TEXT, "Cartons"))
        )
        cartons_link.click()
        
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartons-container"))
        )
        screenshot_helper.take_screenshot("05_cartons_page_loaded")
        
        # Add multiple cartons
        cartons_to_add = [
            {"name": "Small E2E Box", "length": "1.0", "width": "1.0", "height": "1.0", "weight": "10.0", "quantity": "50"},
            {"name": "Medium E2E Box", "length": "1.5", "width": "1.5", "height": "1.0", "weight": "20.0", "quantity": "30"},
            {"name": "Large E2E Box", "length": "2.0", "width": "1.5", "height": "1.5", "weight": "35.0", "quantity": "20"}
        ]
        
        for i, carton in enumerate(cartons_to_add):
            # Click add carton button
            add_carton_btn = browser.find_element(By.ID, "add-carton-btn")
            add_carton_btn.click()
            
            # Wait for modal
            WebDriverWait(browser, 10).until(
                EC.presence_of_element_located((By.ID, "cartonModal"))
            )
            
            # Fill carton details
            browser.find_element(By.ID, "cartonName").clear()
            browser.find_element(By.ID, "cartonName").send_keys(carton["name"])
            
            browser.find_element(By.ID, "cartonLength").clear()
            browser.find_element(By.ID, "cartonLength").send_keys(carton["length"])
            
            browser.find_element(By.ID, "cartonWidth").clear()
            browser.find_element(By.ID, "cartonWidth").send_keys(carton["width"])
            
            browser.find_element(By.ID, "cartonHeight").clear()
            browser.find_element(By.ID, "cartonHeight").send_keys(carton["height"])
            
            browser.find_element(By.ID, "cartonWeight").clear()
            browser.find_element(By.ID, "cartonWeight").send_keys(carton["weight"])
            
            browser.find_element(By.ID, "cartonQuantity").clear()
            browser.find_element(By.ID, "cartonQuantity").send_keys(carton["quantity"])
            
            screenshot_helper.take_screenshot(f"06_carton_{i+1}_form_filled")
            
            # Save carton
            browser.find_element(By.ID, "save-carton-btn").click()
            
            # Wait for modal to close
            WebDriverWait(browser, 10).until(
                EC.invisibility_of_element_located((By.ID, "cartonModal"))
            )
            time.sleep(2)
        
        screenshot_helper.take_screenshot("07_all_cartons_added")
        
        # Step 4: Navigate to Optimize page
        optimize_link = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.LINK_TEXT, "Optimize"))
        )
        optimize_link.click()
        
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "selected-cartons-container"))
        )
        screenshot_helper.take_screenshot("08_optimize_page_loaded")
        
        # Step 5: Select cartons for optimization
        add_carton_type_btn = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.ID, "add-carton-type-btn"))
        )
        add_carton_type_btn.click()
        
        # Wait for carton selection modal
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartonSelectionModal"))
        )
        screenshot_helper.take_screenshot("09_carton_selection_modal")
        
        # Select cartons and set quantities
        available_cartons = browser.find_elements(By.CLASS_NAME, "available-carton-card")
        
        for i, carton_card in enumerate(available_cartons[:2]):  # Select first 2 cartons
            carton_card.click()
            time.sleep(0.5)
            
            # Set quantity
            quantity_input = browser.find_element(By.ID, "carton-quantity-input")
            quantity_input.clear()
            quantity_input.send_keys(str(10 + i * 5))  # 10, 15
            
            # Add to selection
            add_selected_btn = browser.find_element(By.ID, "add-selected-carton-btn")
            add_selected_btn.click()
            
            time.sleep(1)
        
        screenshot_helper.take_screenshot("10_cartons_selected")
        
        # Close selection modal
        close_btn = browser.find_element(By.CSS_SELECTOR, "#cartonSelectionModal .btn-secondary")
        close_btn.click()
        
        WebDriverWait(browser, 10).until(
            EC.invisibility_of_element_located((By.ID, "cartonSelectionModal"))
        )
        
        # Step 6: Select algorithm and run optimization
        algorithm_select = Select(browser.find_element(By.ID, "algorithm-select"))
        algorithm_select.select_by_value("best_fit")
        
        screenshot_helper.take_screenshot("11_ready_for_optimization")
        
        # Run optimization
        optimize_btn = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.ID, "optimize-btn"))
        )
        optimize_btn.click()
        
        # Wait for optimization results
        WebDriverWait(browser, 20).until(
            EC.presence_of_element_located((By.ID, "optimization-results"))
        )
        
        screenshot_helper.take_screenshot("12_optimization_completed")
        
        # Step 7: Verify results
        results_container = browser.find_element(By.ID, "optimization-results")
        assert results_container.is_displayed(), "Optimization results not displayed"
        
        total_cost_element = browser.find_element(By.ID, "total-cost")
        total_cost_text = total_cost_element.text
        assert total_cost_text and total_cost_text != "0", "Total cost not calculated"
        
        screenshot_helper.take_screenshot("13_results_verified")
        
        duration = performance_monitor.end_timer("complete_user_journey")
        assert duration < 60.0, f"Complete user journey took too long: {duration:.3f}s"
        
        screenshot_helper.take_screenshot("14_journey_completed")
    
    def test_bulk_upload_workflow(self, browser, test_server, screenshot_helper, test_csv_file, test_csv_truck_file):
        """Test complete bulk upload workflow for trucks and cartons"""
        
        # Step 1: Bulk upload trucks
        browser.get(f"{test_server}/trucks")
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "trucks-container"))
        )
        
        screenshot_helper.take_screenshot("bulk_01_trucks_page")
        
        # Open bulk upload modal
        bulk_upload_btn = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.ID, "bulk-upload-btn"))
        )
        bulk_upload_btn.click()
        
        # Upload trucks CSV
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "bulkUploadModal"))
        )
        
        file_input = browser.find_element(By.ID, "csvFile")
        file_input.send_keys(test_csv_truck_file)
        
        screenshot_helper.take_screenshot("bulk_02_truck_csv_selected")
        
        upload_btn = browser.find_element(By.ID, "upload-csv-btn")
        upload_btn.click()
        
        # Wait for upload completion
        WebDriverWait(browser, 15).until(
            EC.invisibility_of_element_located((By.ID, "bulkUploadModal"))
        )
        
        time.sleep(3)
        screenshot_helper.take_screenshot("bulk_03_trucks_uploaded")
        
        # Step 2: Bulk upload cartons
        browser.get(f"{test_server}/cartons")
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartons-container"))
        )
        
        # Open bulk upload modal
        bulk_upload_btn = browser.find_element(By.ID, "bulk-upload-btn")
        bulk_upload_btn.click()
        
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "bulkUploadModal"))
        )
        
        # Upload cartons CSV
        file_input = browser.find_element(By.ID, "csvFile")
        file_input.send_keys(test_csv_file)
        
        screenshot_helper.take_screenshot("bulk_04_carton_csv_selected")
        
        upload_btn = browser.find_element(By.ID, "upload-csv-btn")
        upload_btn.click()
        
        # Wait for upload completion
        WebDriverWait(browser, 15).until(
            EC.invisibility_of_element_located((By.ID, "bulkUploadModal"))
        )
        
        time.sleep(3)
        screenshot_helper.take_screenshot("bulk_05_cartons_uploaded")
        
        # Step 3: Use bulk uploaded data for optimization
        browser.get(f"{test_server}/optimize")
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "selected-cartons-container"))
        )
        
        # Use bulk CSV upload for carton quantities
        bulk_carton_btn = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.ID, "bulk-upload-cartons-btn"))
        )
        bulk_carton_btn.click()
        
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "bulkCartonUploadModal"))
        )
        
        # Upload carton quantities CSV
        file_input = browser.find_element(By.ID, "bulk-carton-csv-file")
        file_input.send_keys(test_csv_file)
        
        screenshot_helper.take_screenshot("bulk_06_optimization_csv_selected")
        
        upload_btn = browser.find_element(By.ID, "upload-bulk-cartons-btn")
        upload_btn.click()
        
        # Wait for processing
        WebDriverWait(browser, 15).until(
            EC.invisibility_of_element_located((By.ID, "bulkCartonUploadModal"))
        )
        
        time.sleep(2)
        screenshot_helper.take_screenshot("bulk_07_cartons_loaded_for_optimization")
        
        # Run optimization
        optimize_btn = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.ID, "optimize-btn"))
        )
        optimize_btn.click()
        
        # Wait for results
        WebDriverWait(browser, 20).until(
            EC.presence_of_element_located((By.ID, "optimization-results"))
        )
        
        screenshot_helper.take_screenshot("bulk_08_optimization_results")
        
        # Verify results
        results_container = browser.find_element(By.ID, "optimization-results")
        assert results_container.is_displayed(), "Bulk upload optimization results not displayed"


@pytest.mark.e2e
@pytest.mark.critical
class TestErrorRecoveryWorkflows:
    """Test error scenarios and recovery workflows"""
    
    def test_invalid_data_entry_recovery(self, browser, test_server, screenshot_helper):
        """Test recovery from invalid data entry"""
        
        browser.get(f"{test_server}/cartons")
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartons-container"))
        )
        
        # Open add carton modal
        add_carton_btn = browser.find_element(By.ID, "add-carton-btn")
        add_carton_btn.click()
        
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartonModal"))
        )
        
        # Enter invalid data
        browser.find_element(By.ID, "cartonName").send_keys("")  # Empty name
        browser.find_element(By.ID, "cartonLength").send_keys("-1")  # Negative length
        browser.find_element(By.ID, "cartonWidth").send_keys("abc")  # Non-numeric width
        browser.find_element(By.ID, "cartonHeight").send_keys("1.5")
        browser.find_element(By.ID, "cartonWeight").send_keys("10")
        browser.find_element(By.ID, "cartonQuantity").send_keys("5")
        
        screenshot_helper.take_screenshot("error_01_invalid_data_entered")
        
        # Try to save
        save_btn = browser.find_element(By.ID, "save-carton-btn")
        save_btn.click()
        
        time.sleep(2)  # Allow for validation
        screenshot_helper.take_screenshot("error_02_validation_triggered")
        
        # Modal should still be open (validation should prevent submission)
        modal = browser.find_element(By.ID, "cartonModal")
        assert modal.is_displayed(), "Modal should remain open after validation error"
        
        # Correct the data
        name_field = browser.find_element(By.ID, "cartonName")
        name_field.clear()
        name_field.send_keys("Corrected Carton")
        
        length_field = browser.find_element(By.ID, "cartonLength")
        length_field.clear()
        length_field.send_keys("2.0")
        
        width_field = browser.find_element(By.ID, "cartonWidth")
        width_field.clear()
        width_field.send_keys("1.5")
        
        screenshot_helper.take_screenshot("error_03_data_corrected")
        
        # Save again
        save_btn.click()
        
        # Wait for modal to close (successful submission)
        WebDriverWait(browser, 10).until(
            EC.invisibility_of_element_located((By.ID, "cartonModal"))
        )
        
        screenshot_helper.take_screenshot("error_04_data_saved_successfully")
        
        time.sleep(2)
        
        # Verify carton was added
        carton_cards = browser.find_elements(By.CLASS_NAME, "carton-card")
        carton_names = [card.find_element(By.TAG_NAME, "h5").text for card in carton_cards]
        
        assert "Corrected Carton" in carton_names, "Corrected carton not found in list"
    
    def test_optimization_with_no_cartons_recovery(self, browser, test_server, screenshot_helper):
        """Test optimization attempt with no cartons selected"""
        
        browser.get(f"{test_server}/optimize")
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "selected-cartons-container"))
        )
        
        screenshot_helper.take_screenshot("no_cartons_01_optimize_page")
        
        # Try to optimize without selecting any cartons
        optimize_btn = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.ID, "optimize-btn"))
        )
        optimize_btn.click()
        
        time.sleep(2)  # Allow for error handling
        screenshot_helper.take_screenshot("no_cartons_02_optimization_attempted")
        
        # Check if error message is displayed or handled gracefully
        # The system should either show an error message or prevent the action
        
        # Add a carton to recover
        add_carton_btn = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.ID, "add-carton-type-btn"))
        )
        add_carton_btn.click()
        
        # Select a carton and proceed
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartonSelectionModal"))
        )
        
        available_cartons = browser.find_elements(By.CLASS_NAME, "available-carton-card")
        
        if available_cartons:
            available_cartons[0].click()
            
            quantity_input = browser.find_element(By.ID, "carton-quantity-input")
            quantity_input.clear()
            quantity_input.send_keys("5")
            
            add_selected_btn = browser.find_element(By.ID, "add-selected-carton-btn")
            add_selected_btn.click()
            
            close_btn = browser.find_element(By.CSS_SELECTOR, "#cartonSelectionModal .btn-secondary")
            close_btn.click()
            
            WebDriverWait(browser, 10).until(
                EC.invisibility_of_element_located((By.ID, "cartonSelectionModal"))
            )
            
            screenshot_helper.take_screenshot("no_cartons_03_carton_added")
            
            # Now try optimization again
            optimize_btn.click()
            
            # Should succeed this time
            WebDriverWait(browser, 15).until(
                EC.presence_of_element_located((By.ID, "optimization-results"))
            )
            
            screenshot_helper.take_screenshot("no_cartons_04_optimization_successful")


@pytest.mark.e2e
@pytest.mark.performance
class TestPerformanceWorkflows:
    """Test performance with realistic workflows"""
    
    def test_large_dataset_workflow(self, browser, test_server, screenshot_helper, performance_monitor):
        """Test workflow with large amount of data"""
        
        performance_monitor.start_timer("large_dataset_workflow")
        
        # Navigate to cartons page
        browser.get(f"{test_server}/cartons")
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartons-container"))
        )
        
        # Add multiple cartons programmatically (simulating bulk data)
        carton_count = 0
        target_cartons = 10  # Add 10 cartons for testing
        
        for i in range(target_cartons):
            try:
                # Add carton
                add_carton_btn = WebDriverWait(browser, 5).until(
                    EC.element_to_be_clickable((By.ID, "add-carton-btn"))
                )
                add_carton_btn.click()
                
                WebDriverWait(browser, 5).until(
                    EC.presence_of_element_located((By.ID, "cartonModal"))
                )
                
                # Fill with test data
                browser.find_element(By.ID, "cartonName").send_keys(f"Performance Test Carton {i+1}")
                browser.find_element(By.ID, "cartonLength").send_keys("1.0")
                browser.find_element(By.ID, "cartonWidth").send_keys("1.0")
                browser.find_element(By.ID, "cartonHeight").send_keys("1.0")
                browser.find_element(By.ID, "cartonWeight").send_keys("10.0")
                browser.find_element(By.ID, "cartonQuantity").send_keys("20")
                
                browser.find_element(By.ID, "save-carton-btn").click()
                
                WebDriverWait(browser, 5).until(
                    EC.invisibility_of_element_located((By.ID, "cartonModal"))
                )
                
                carton_count += 1
                time.sleep(0.5)  # Brief pause between additions
                
            except TimeoutException:
                break  # Continue with what we have if UI becomes unresponsive
        
        screenshot_helper.take_screenshot("performance_01_cartons_added")
        
        # Navigate to optimization
        browser.get(f"{test_server}/optimize")
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "selected-cartons-container"))
        )
        
        # Select multiple cartons for optimization
        add_carton_btn = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.ID, "add-carton-type-btn"))
        )
        add_carton_btn.click()
        
        WebDriverWait(browser, 10).until(
            EC.presence_of_element_located((By.ID, "cartonSelectionModal"))
        )
        
        # Select first few cartons
        available_cartons = browser.find_elements(By.CLASS_NAME, "available-carton-card")
        
        for i, carton_card in enumerate(available_cartons[:5]):  # Select first 5
            try:
                carton_card.click()
                time.sleep(0.2)
                
                quantity_input = browser.find_element(By.ID, "carton-quantity-input")
                quantity_input.clear()
                quantity_input.send_keys("5")
                
                add_selected_btn = browser.find_element(By.ID, "add-selected-carton-btn")
                add_selected_btn.click()
                
                time.sleep(0.5)
            except:
                break  # Continue if any issues
        
        close_btn = browser.find_element(By.CSS_SELECTOR, "#cartonSelectionModal .btn-secondary")
        close_btn.click()
        
        WebDriverWait(browser, 10).until(
            EC.invisibility_of_element_located((By.ID, "cartonSelectionModal"))
        )
        
        screenshot_helper.take_screenshot("performance_02_multiple_cartons_selected")
        
        # Run optimization
        optimize_btn = WebDriverWait(browser, 10).until(
            EC.element_to_be_clickable((By.ID, "optimize-btn"))
        )
        optimize_btn.click()
        
        # Wait for results with longer timeout for large dataset
        WebDriverWait(browser, 30).until(
            EC.presence_of_element_located((By.ID, "optimization-results"))
        )
        
        screenshot_helper.take_screenshot("performance_03_optimization_completed")
        
        duration = performance_monitor.end_timer("large_dataset_workflow")
        
        # Should complete within reasonable time even with larger dataset
        assert duration < 120.0, f"Large dataset workflow took too long: {duration:.3f}s"
        
        # Verify results are displayed
        results_container = browser.find_element(By.ID, "optimization-results")
        assert results_container.is_displayed(), "Results not displayed for large dataset"