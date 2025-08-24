# TRUCKOPTIMUM_CLAUDE.md - Project-Specific Development Guide

## 🤖 PROJECT-SPECIFIC AGENTS

### Core Project Agents (Always Active)
```yaml
agent_project_specialist:
  role: "TruckOptimum domain expert with complete system knowledge"
  capabilities: ["Flask/SQLAlchemy patterns", "3D packing algorithms", "PyInstaller builds"]
  knowledge_base: ["resolved error patterns", "optimization techniques", "build configurations"]
  
agent_project_optimizer:
  role: "Performance and efficiency optimization specialist"  
  capabilities: ["algorithm tuning", "database optimization", "UI/UX enhancement"]
  focus_areas: ["startup performance", "packing efficiency", "user experience"]
  
agent_project_monitor:
  role: "Quality assurance and issue detection"
  capabilities: ["error pattern recognition", "regression detection", "build validation"]
  monitoring: ["critical functionality", "performance metrics", "user workflows"]
```

### Auto-Generated Agents (Created on Demand)
```yaml
agent_flask_specialist:
  triggers: ["route errors", "template issues", "database problems"]
  capabilities: ["Flask debugging", "Jinja2 templates", "SQLAlchemy operations"]
  
agent_algorithm_optimizer:
  triggers: ["packing efficiency issues", "performance bottlenecks", "optimization requests"]
  capabilities: ["3D packing algorithms", "performance analysis", "mathematical optimization"]
  
agent_build_specialist:
  triggers: ["PyInstaller issues", "deployment problems", "executable optimization"]
  capabilities: ["build configuration", "dependency management", "deployment validation"]
  
agent_ui_specialist:
  triggers: ["Bootstrap issues", "professional design needs", "user experience problems"]
  capabilities: ["Bootstrap 5 styling", "professional UI patterns", "responsive design"]
```

## 🎯 Project Overview
**TruckOptimum Professional v2.2.0** - Enterprise-grade 3D packing optimization system

### Tech Stack
```yaml
Backend: Flask + SQLAlchemy + SQLite
Frontend: Bootstrap 5 + Jinja2 templates + JavaScript  
Build: PyInstaller for executable generation
Database: SQLite with CRUD operations
Algorithms: Skyline, Physics-based stability, MCDA optimization
```

### Key Project Files
```yaml
Core Application:
- app.py: Main Flask application with all routes
- TruckOptimum_Professional_v2.2.0.spec: PyInstaller build configuration

Database & Models:
- database.py: SQLAlchemy models (Truck, Carton, algorithms)
- migrations/: Database schema evolution

Templates & UI:
- templates/: All HTML templates with Bootstrap 5 styling  
- static/: CSS, JS, images, professional styling assets

Algorithms & Logic:
- skyline_algorithm.py: Advanced 3D packing with research-backed optimization
- physics_based_stability.py: Real-time center of gravity calculations
- utils/: Supporting classes and optimization utilities
```

### Build & Deployment Commands
```yaml
Development: python app.py (starts on localhost:5000)
Build Production: pyinstaller TruckOptimum_Professional_v2.2.0.spec --clean  
Run Executable: ./dist/TruckOptimum_Professional_v2.2.0.exe
Database Reset: Delete .db files, restart app (auto-creates with sample data)
```

## 🔧 Issue Resolution & Error Learning Database

### Critical Error Patterns (Self-Learning)
```yaml
RESOLVED_ERRORS_DATABASE:
  
  sqlite_rowcount_errors:
    symptoms: "AttributeError: 'int' object has no attribute 'rowcount'"
    root_cause: "Hard-coded array index assumptions in CRUD operations"  
    solution: "Dynamic result handling, proper error checking"
    prevention: "Always validate database operation results before accessing properties"
    file_locations: ["app.py routes", "database.py model methods"]
    
  flask_route_duplicates:
    symptoms: "AssertionError: View function mapping is overwriting existing endpoint"
    root_cause: "Duplicate route definitions or conflicting endpoint names"
    solution: "Unique endpoint names, systematic route organization"  
    prevention: "Route naming conventions, systematic endpoint management"
    file_locations: ["app.py route definitions"]
    
  missing_type_imports:
    symptoms: "NameError: name 'List' is not defined"
    root_cause: "Missing typing imports in Python 3.13+ environments"
    solution: "Add 'from typing import List, Dict, Optional, Union' imports"
    prevention: "Explicit typing imports in all modules using type hints"
    file_locations: ["All .py files using type annotations"]
    
  api_endpoint_mismatches:
    symptoms: "Form submissions fail, 404 errors on POST requests"  
    root_cause: "Frontend form actions don't match backend route definitions"
    solution: "Systematic endpoint verification, dynamic URL generation"
    prevention: "Use url_for() for all form actions, consistent naming"
    file_locations: ["HTML forms", "JavaScript AJAX calls", "Flask routes"]
    
  csv_bulk_upload_missing:
    symptoms: "Bulk upload functionality referenced but not implemented"
    root_cause: "Frontend UI promises functionality not built in backend"  
    solution: "Implement CSV processing with FormData, progress indicators"
    prevention: "Feature parity validation between UI promises and backend"
    file_locations: ["Bulk upload routes", "CSV processing utilities"]
    
  pdf_generation_failures:
    symptoms: "PDF export attempts result in 500 errors or empty responses"
    root_cause: "Missing route registration, template path issues, library conflicts"
    solution: "Proper PDF route setup, template inclusion, library compatibility"  
    prevention: "PDF functionality testing in both dev and production builds"
    file_locations: ["PDF generation routes", "Report templates"]
    
  loading_screen_issues:
    symptoms: "UI appears frozen during operations, no user feedback"
    root_cause: "Missing loading states, synchronous processing blocking UI"
    solution: "Loading spinners, progress indicators, async processing"
    prevention: "Loading states for all operations >1 second"
    file_locations: ["Frontend JavaScript", "Long-running operation routes"]
    
  algorithm_tuple_errors:
    symptoms: "TypeError: cannot unpack non-sequence, tuple index errors"
    root_cause: "Algorithm functions returning inconsistent data structures"  
    solution: "Standardized return formats, proper error handling"
    prevention: "Consistent algorithm interfaces, input/output validation"
    file_locations: ["Algorithm modules", "Packing optimization functions"]
```

### Testing & Debugging Protocols

#### Development Testing Cycle
```yaml
1. Code_Change_Made:
   - Run application in development mode
   - Test affected functionality with manual clicking
   - Take screenshots of before/after states
   - Verify all related buttons/forms still work
   
2. Screenshot_Based_Validation:
   - Before: Capture initial UI state
   - During: Document any loading/processing states  
   - After: Verify expected results with screenshot
   - Issues: Create descriptive filename if problems found
   
3. Build_Testing:
   - Generate production executable with PyInstaller
   - Test ALL functionality in built version
   - Compare behavior between dev and production  
   - Document any build-specific issues
   
4. Resolution_Documentation:
   - Create RESOLVED_xxx.png for fixed issues
   - Update error database with new patterns
   - Add prevention strategies for future development
```

#### Debugging Self-Learning System
```yaml
NEW_ERROR_ENCOUNTERED:
  1. Capture_Complete_Context:
     - Full error traceback and stack trace
     - Environment details (dev vs production)
     - User action sequence that triggered error
     - Related code sections and recent changes
     
  2. Pattern_Analysis:  
     - Compare to existing error database
     - Identify if this is variation of known pattern
     - Analyze root cause categories (code, config, data, environment)
     - Document unique characteristics
     
  3. Solution_Development:
     - Research proven solutions for this error pattern
     - Test fix in isolation before applying broadly
     - Verify fix doesn't introduce regression issues
     - Document solution approach and reasoning
     
  4. Database_Update:
     - Add new error pattern to RESOLVED_ERRORS_DATABASE
     - Include prevention strategies for future occurrence  
     - Update file location references
     - Create searchable tags for similar issues
     
  5. Validation_Loop:
     - Test fix in development environment
     - Verify with production build
     - Screenshot document resolution
     - Update prevention protocols
```

### Current Known Issues & Status
```yaml
MONITORING_LIST:
  truck_recommendation_api: "Intermittent tuple unpacking errors - investigating"
  bulk_csv_processing: "✅ RESOLVED - FormData implementation working"
  pdf_export_functionality: "✅ RESOLVED - Route registration and templates fixed"  
  loading_screen_feedback: "✅ RESOLVED - Spinners and progress indicators added"
  sqlite_database_operations: "✅ RESOLVED - Dynamic result handling implemented"
  professional_ui_consistency: "✅ RESOLVED - Bootstrap 5 professional styling applied"
```

### Quick Debugging Commands
```yaml
Application_Logs: Check console output during development runs
Database_Inspect: Use SQLite browser or query directly in Python shell
Template_Debug: Flask template error messages show line numbers
Static_Files: Verify CSS/JS loading with browser developer tools  
Build_Debug: Check PyInstaller console output for missing modules/files
Route_Testing: Use curl or Postman for API endpoint validation
```

### Performance Optimization Notes
```yaml  
PROVEN_OPTIMIZATIONS:
  startup_performance: "Lazy loading reduced 20s → 0.01s startup"
  algorithm_efficiency: "Skyline algorithm 20-30% faster than basic placement"
  ui_responsiveness: "Async processing prevents blocking during operations"
  build_size: "PyInstaller optimization: 10.8MB executable"
  database_performance: "Proper indexing and query optimization"
```

This project guide provides systematic error resolution, self-learning debugging protocols, and project-specific development patterns for TruckOptimum Professional.