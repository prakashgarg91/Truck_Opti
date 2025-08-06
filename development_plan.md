# Development Plan: TruckOpti Enhancement

This document outlines the development plan for enhancing the TruckOpti application with advanced multi-truck and cost optimization features.

## 1. High-Level Goals

*   Optimize the packing of multiple carton types into multiple trucks to maximize space utilization and minimize cost.
*   Provide users with recommendations on the number and types of trucks required for a given set of cartons.
*   Allow users to determine how many cartons can fit into a given set of trucks.
*   Enhance the user interface to support these new, more complex scenarios.

## 2. Feature Breakdown and Implementation Strategy

### 2.1. Enhanced Multi-Truck Optimization Algorithm

**File to Modify:** `app/packer.py`

**Design:**

1.  **Input:** The function will accept a list of available truck types (with quantities for each) and a dictionary of carton types with their quantities.
2.  **Truck Selection Strategy:**
    *   Implement a greedy approach first. Sort the available trucks by a specific metric (e.g., cost-effectiveness, volume).
    *   Iterate through the sorted trucks, packing as many cartons as possible into each one.
    *   Prioritize packing high-priority or high-value items first.
3.  **Item Prioritization:** The sorting of items (cartons) will be enhanced to consider not just volume, but also weight, value, and user-defined priority. The `optimization_goal` parameter will drive this sorting.
4.  **Multi-Bin Packing:** The `py3dbp` library supports multiple bins. The core logic will be modified to handle a fleet of trucks (bins) in a single packing operation.
5.  **Output:** The function will return a detailed breakdown of which cartons are packed into which truck, along with utilization metrics for each truck and a list of any unpacked cartons.

### 2.2. Advanced Cost Optimization

**Files to Modify:** `app/models.py`, `app/packer.py`, `app/routes.py`

**Design:**

1.  **Extend `TruckType` Model:** Add more detailed cost-related fields to `app/models.py` if they are not already present (e.g., `cost_per_km`, `driver_cost_per_day`, `maintenance_cost_per_km`).
2.  **Cost Calculation Logic:** In `app/packer.py`, create a function to calculate the total cost of a shipment. This will consider:
    *   Fixed costs (e.g., driver salary).
    *   Variable costs (e.g., fuel, maintenance, tolls).
    *   The cost will be a key metric for the optimization algorithm when the goal is `'cost'`.
3.  **API and UI Integration:** Expose the cost calculations through the API and display them in the packing results on the frontend.

### 2.3. Truck Requirement Calculator

**Files to Modify:** `app/routes.py`, `app/packer.py`, `app/templates/`

**Design:**

1.  **New Route:** Create a new route, e.g., `/calculate-truck-requirements`, in `app/routes.py`.
2.  **Input Form:** Design a new template with a form where users can input the quantities of each carton type.
3.  **Calculation Logic:**
    *   This will leverage the multi-truck packing algorithm.
    *   The algorithm will be called with an "unlimited" supply of each available truck type.
    *   It will pack cartons until all are fitted, determining the minimum number and combination of trucks required.
4.  **Display Results:** The results page will show the recommended fleet of trucks, the packing details for each, and the overall cost.

### 2.4. Fit Cartons in a Given Fleet

**Files to Modify:** `app/routes.py`, `app/packer.py`, `app/templates/`

**Design:**

1.  **New Route:** Create a new route, e.g., `/fit-in-fleet`, in `app/routes.py`.
2.  **Input Form:** The UI will allow users to select specific truck types and specify the quantity available for each. They will also input the carton quantities.
3.  **Calculation Logic:** The packing algorithm will be called with the user-defined fleet of trucks.
4.  **Display Results:** The results will show how many cartons were successfully packed into the provided fleet and which, if any, were left unpacked.

## 3. UI/UX Enhancements

*   Create new templates for the new features.
*   Improve the existing packing job forms to be more dynamic and user-friendly, especially for adding many types of cartons.
*   Enhance the packing results page to visualize the multi-truck solution clearly. A 3D visualization for each truck would be ideal.

## 4. API Enhancements

*   Create new API endpoints that correspond to the new features:
    *   `POST /api/calculate-truck-requirements`
    *   `POST /api/fit-in-fleet`
*   Update the existing `/api/packing_jobs` endpoint to accept and return multi-truck data.

## 5. Testing Strategy

*   **Unit Tests:** Create unit tests for the new functions in `app/packer.py`.
*   **Integration Tests:** Test the new routes and their interaction with the packing logic.
*   **End-to-End Tests:** Use a tool like Puppeteer (as suggested by the existing `e2e-tests.js`) to simulate user workflows for the new features.

This plan will be executed iteratively, following the TODO list.