# CLAUDE.md - Master Enterprise TruckOpti Development

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🎯 CORE: Research-First, Bug-Free, Zero-Intervention Development

### Hierarchical Auto-Generation
```
Truck_Opti/
├── CLAUDE.md (this master)
├── app/CLAUDE.md (auto-gen per module)
├── tests/CLAUDE.md (testing protocols)
```

### Multi-Model Cost Strategy
- **Haiku**: 80% bulk work ($0.25/$1.25) - routine testing, formatting
- **Sonnet 4**: 15% verification ($3/$15) - architecture decisions, debugging
- **Opus 4**: 5% critical decisions ($15/$75) - algorithm optimization, security

## 🔄 AUTONOMOUS PROTOCOL

### Research-First Rule
- Google search → Official docs (Flask, py3dbp, SQLAlchemy) → Multiple sources → Implement
- Never code without researching best practices for logistics/3D packing first

### MANDATORY: Code Rules & Formatting
- **Python**: PEP 8, type hints, docstrings for all functions
- **Flask**: Blueprint organization, RESTful patterns, error handling
- **JavaScript**: ESLint clean, consistent naming, modular structure
- **SQL**: Indexed queries, parameterized statements, performance-focused
- **Comments**: Docstrings for algorithms, inline for complex logistics logic only
- **Imports**: Standard library → Third party → Local modules

### MANDATORY: Testing After Every Edit
```yaml
testing_protocol:
  after_any_code_change:
    1: "Run Python linting: python -m py_compile app/*.py (must pass 100%)"
    2: "Run type checking: mypy app/ (if configured)"
    3: "Run unit tests: python test_final_comprehensive_all_features.py (must pass 100%)"
    4: "Run algorithm tests: python test_optimization_accuracy.py"
    5: "Verify Flask server starts: python run.py (no errors)"
    6: "Check browser console: http://127.0.0.1:5000 (must be clean)"
    7: "Test core packing flows manually"
    8: "Verify executable build: pyinstaller TruckOpti_Enterprise.spec"
    9: "Only then claim 'working'"
```

### Auto-Behaviors
**Module Creation**: Research logistics patterns → Generate focused CLAUDE.md → Inherit 3D packing patterns
**Error Detection**: Screenshot tracking + terminal monitoring + auto-fix + verify in both dev/exe modes
**Quality Gates**: 0 bugs, 95% test coverage, <2s packing response, logistics compliance

### Code Structure Rules
- **Python Files**: Max 300 lines, single responsibility, clear separation
- **Functions**: Max 30 lines for algorithms, pure functions when possible
- **Classes**: Clear interfaces, SQLAlchemy patterns, performance tracking
- **APIs**: Input validation, comprehensive error handling, response formatting
- **Database**: Proper indexing, migration tracking, performance optimization

### Safety Boundaries
- **Human approval**: Production builds, database migrations, algorithm changes
- **Auto-escalate**: When packing algorithm confidence <85%
- **Never autonomous**: Data deletion, cost calculation changes, client delivery

## Project Overview

TruckOpti is a Flask-based 3D truck loading optimization platform that uses advanced bin packing algorithms to maximize space utilization and reduce transportation costs. The application features a comprehensive web interface, RESTful APIs, 3D visualization, and analytics dashboards for logistics operations.

**Tech Stack**: Flask + SQLAlchemy + py3dbp (3D bin packing) + Bootstrap 5 + Three.js + SQLite

## 🏗️ TECH STACK SPECIFICATIONS
- **Backend**: Flask 2.3+/Python 3.13+, SQLAlchemy 2.0+
- **Frontend**: Bootstrap 5, Three.js, DataTables.js, Chart.js
- **Database**: SQLite (development), PostgreSQL (production-ready)
- **3D Engine**: py3dbp, advanced_3d_packer.py (2024-2025 research algorithms), ML optimization
- **Testing**: Pytest, Puppeteer, Jest, E2E automation with MCP integration
- **Build**: PyInstaller (executable deployment, Python 3.13 compatible)

## Development Commands

### Starting the Application
```bash
# Start development server (auto-opens browser)
python run.py

# The app will automatically find an available port starting from 5000
# Access at: http://127.0.0.1:5000
```

### Testing Commands
```bash
# Full comprehensive test suite
python test_final_comprehensive_all_features.py

# Algorithm accuracy validation  
python test_optimization_accuracy.py

# Truck management features
python test_truck_management_comprehensive.py

# Frontend tests (requires app to be running)
npm test

# Advanced 3D packing integration tests
python test_advanced_3d_integration.py
python test_algorithms_3d_validation.py

# E2E testing with comprehensive validation
python test_truck_recommendation_comprehensive_e2e.py

# Specific feature tests
python test_carton_management_comprehensive.py
python test_sale_order_comprehensive_final.py
```

### Database Management
```bash
# Initialize test data
python initialize_test_data.py

# Direct database access
sqlite3 app/truck_opti.db

# Check database path
python show_db_path.py
```

### Build Commands
```bash
# Create standalone executable (Full-Featured Enterprise Build)
pyinstaller TruckOpti_Enterprise_Full.spec --clean --noconfirm

# Alternative build specs available:
# - TruckOpti_Enterprise_Full.spec (complete feature set with advanced 3D packing - 24.3MB)
# - TruckOpti_Minimal_Working.spec (minimal build for compatibility - 15MB)
# - TruckOpti_Enterprise.spec (standard enterprise build)
# - Python 3.13 compatible builds available
```

### Quality Assurance
```bash
# Python syntax validation
python -m py_compile app/*.py

# Test coverage with pytest  
pytest --cov=app --cov-report=html

# Frontend coverage
npm run test:coverage

# MANDATORY: Complete verification protocol
python -m py_compile app/*.py                      # Must pass 100%
python test_final_comprehensive_all_features.py   # Must pass 100%
python test_optimization_accuracy.py              # Algorithm validation
python run.py &                                   # Start server (background)
sleep 5 && curl -f http://127.0.0.1:5000/         # Health check
npm test                                          # Frontend tests
pkill -f "python run.py"                         # Clean shutdown
```

## 🛡️ ENTERPRISE REQUIREMENTS
- **Security**: Flask-Login, SQLAlchemy ORM (SQL injection prevention), CSRF protection
- **Performance**: <2s packing response, <200ms API calls, optimized algorithms
- **Compliance**: Screenshot-based issue tracking, audit trails in database
- **Monitoring**: Advanced logging (app/core/), intelligent error monitoring

## Architecture Overview

### Core Application Structure
```
app/
├── models.py              # SQLAlchemy database models
├── routes.py              # Flask routes and API endpoints  
├── packer.py              # Legacy 3D bin packing algorithms (py3dbp)
├── advanced_3d_packer.py  # ⭐ State-of-art 3D packing (2024-2025 research)
├── advanced_packer.py     # Enhanced packing with ML optimization
├── cost_engine.py         # Cost calculation engine
├── ml_optimizer.py        # Machine learning optimization
├── multi_order_optimizer.py # Multi-order consolidation
├── route_optimizer.py     # Route optimization algorithms
├── websocket_manager.py   # Real-time updates
├── core/                  # Advanced logging and monitoring infrastructure
├── static/                # Frontend assets (CSS, JS, images)
└── templates/             # Jinja2 HTML templates
```

### Database Models (models.py)
- **TruckType**: Truck specifications with dimensions, weight limits, costs
- **CartonType**: Carton properties including fragility, stackability, rotation
- **PackingJob**: Individual packing optimization jobs
- **PackingResult**: 3D packing results with utilization metrics
- **SaleOrder/SaleOrderItem**: Bulk order processing from CSV uploads
- **UserSettings**: User preferences and optimization parameters
- **Analytics**: Performance metrics and KPIs

### Key Algorithms (advanced_3d_packer.py & packer.py)
- **Advanced 3D Packing**: State-of-the-art algorithms based on 2024-2025 research papers
  - Extreme Points positioning algorithm (European Journal of Operational Research 2025)
  - Stability validation with support area calculations (ArXiv 2025)
  - Multi-criteria decision analysis (MCDA) for balanced optimization
  - 6-orientation carton rotation without shape changes
  - Load distribution scoring for truck safety
- **Legacy 3D Packing**: Original py3dbp-based algorithms for fallback
- Multi-objective optimization (space, cost, weight, stability)
- Smart truck recommendations with advanced stability metrics
- Fleet optimization for multiple truck types
- Remaining space optimization with 3D constraint validation

### Frontend Architecture
- **Bootstrap 5** for responsive UI components
- **Three.js** for 3D truck loading visualization
- **DataTables.js** for interactive data tables with export (CSV, Excel, PDF)
- **Chart.js** for analytics dashboards
- Real-time updates via WebSocket connections

## Critical Implementation Details

### Executable Build Process
The app supports both development and production modes:

```python
# In run.py - Critical for executable builds
if hasattr(sys, 'frozen') and hasattr(sys, '_MEIPASS'):
    # Production mode for executable (NO DEBUG MODE)
    app.run(
        debug=False,           # CRITICAL: No debug mode in production
        port=port,
        use_reloader=False,    # No reloader in production  
        threaded=True,         # Enable threading
        host='127.0.0.1'       # Only localhost access
    )
else:
    # Development mode
    app.run(debug=True, port=port)
```

### Screenshot-Based Issue Tracking
The project uses a unique screenshot-based issue tracking system in `screenshots_problems_in_exe/`:
- Issues are documented as PNG screenshots with descriptive filenames
- `RESOLVED_[ID].[description].png` indicates verified fixes
- Always test actual functionality before marking issues as resolved
- Critical to verify fixes work in both development and executable modes

### Database Schema Evolution
Models include comprehensive tracking fields:
- Timestamps (date_created, date_updated)
- Performance indexes for optimized queries
- JSON fields for complex data (result_data in PackingResult)
- Enhanced serialization with `as_dict()` methods

## Development Patterns

### API Endpoint Structure
```python
# RESTful API pattern in routes.py
@api.route('/api/truck-types', methods=['GET', 'POST'])
@api.route('/api/truck-types/<int:id>', methods=['PUT', 'DELETE'])
```

### 3D Packing Integration
```python
# Advanced 3D packing (recommended)
from app.advanced_3d_packer import create_advanced_packing_recommendation
result = create_advanced_packing_recommendation(trucks, cartons, 'balanced')

# Legacy packing (fallback)
from app.packer import pack_cartons_optimized
result = pack_cartons_optimized(truck, cartons, optimization_goal='space')
```

### Error Handling Pattern
The app includes comprehensive error handling with:
- Intelligent error monitoring (app/core/intelligent_error_monitor.py)
- Advanced logging (app/core/advanced_logging.py)
- Error capture in frontend (app/static/js/error_capture.js)

## Testing Strategy

### Test File Organization
- `test_final_comprehensive_all_features.py` - Complete system validation
- `test_optimization_accuracy.py` - Algorithm performance verification
- `test_*_comprehensive.py` - Feature-specific comprehensive tests
- `tests/e2e/` - End-to-end Puppeteer tests

### Testing Best Practices
1. Always start the Flask server before running frontend tests
2. Use pytest markers for test categorization (unit, integration, e2e)
3. Maintain 80%+ test coverage (configured in pytest.ini)
4. Test both development and executable modes for critical features

## Integration Points

### External Dependencies
- **py3dbp**: 3D bin packing algorithm library
- **Flask ecosystem**: SQLAlchemy, Flask-Login, Flask-CORS
- **Frontend libraries**: Bootstrap 5, Three.js, Chart.js, DataTables.js
- **Testing**: Puppeteer for browser automation, Jest for JavaScript testing

### API Integration
The app provides RESTful APIs for:
- Truck and carton type management
- Packing optimization services
- Analytics and reporting
- Batch processing of sale orders

### File Upload Processing
Supports CSV/Excel uploads for:
- Bulk carton type creation
- Sale order batch processing
- Analytics data import

## Performance Considerations

### Optimization Features
- **Caching**: LRU caching for frequently accessed calculations
- **Database Indexing**: Strategic indexes on frequently queried fields
- **Lazy Loading**: SQLAlchemy relationships use lazy loading where appropriate
- **JSON Storage**: Complex packing results stored as JSON for efficiency

### Scalability Features
- Multi-threading support in production mode
- Batch processing capabilities for large datasets
- WebSocket support for real-time updates
- Asynchronous task processing for heavy computations

## Production Deployment

### Environment Detection
```python
# Automatic environment detection
is_executable = hasattr(sys, 'frozen') and hasattr(sys, '_MEIPASS')
```

### Build Specifications
Multiple PyInstaller specs available for different deployment scenarios:
- `TruckOpti_Enterprise_Full.spec` - Complete feature set with advanced 3D packing (24.3MB)
- `TruckOpti_Minimal_Working.spec` - Lightweight version for compatibility (15MB)
- `TruckOpti_Enterprise.spec` - Standard enterprise build
- Python 3.13 compatible builds available
- Platform-specific builds for Windows/Linux

## Security Considerations

- **Input Validation**: All user inputs are validated before processing
- **SQL Injection Prevention**: Uses SQLAlchemy parameterized queries
- **CSRF Protection**: Flask-WTF CSRF tokens on forms
- **File Upload Security**: Restricted file types and size limits for uploads
- **Local-only Access**: Production mode binds only to localhost (127.0.0.1)

## 🚀 ADVANCED 3D PACKING FEATURES

### Research-Backed Algorithms (2024-2025)
The `advanced_3d_packer.py` module implements state-of-the-art 3D bin packing algorithms:

```python
from app.advanced_3d_packer import PackingStrategy

# Available strategies based on recent research
strategies = {
    'EXTREME_POINTS': "European Journal 2025 - fast optimization approach",
    'STABILITY_FIRST': "ArXiv 2025 - stability validation with support areas",
    'WEIGHT_DISTRIBUTION': "Advanced load balancing for truck safety",
    'MULTI_CRITERIA': "Balanced optimization (space + stability + distribution)",
    'BOTTOM_LEFT_FILL': "Classical bottom-left-fill approach"
}
```

### Key Features
- **Stability Validation**: Real-time calculation of support areas and stability scores
- **6-Orientation Optimization**: Tests all possible carton rotations without shape changes
- **Load Distribution**: Weight balance scoring to prevent truck tipping
- **Multi-Criteria Analysis**: Combines space efficiency, stability, and safety
- **Decimal Type Handling**: Proper handling of py3dbp Decimal types for accuracy

### Integration Points
```python
# Smart Truck Recommendations with advanced metrics
from app.routes import recommend_truck  # Uses advanced_3d_packer automatically

# Template display includes:
# - Stability score (0-100%)
# - Load distribution metrics  
# - Algorithm identification
# - Enhanced utilization calculations
```

### Testing Advanced Features
```bash
# Validate 3D algorithm accuracy
python test_algorithms_3d_validation.py

# Test advanced packing integration
python test_advanced_3d_integration.py

# E2E testing with browser automation
python test_truck_recommendation_comprehensive_e2e.py
```

## Common Development Tasks

### Adding New Truck Types
1. Update models.py TruckType model if new fields needed
2. Modify truck management templates in templates/
3. Update packer.py algorithms if new constraints required
4. Add corresponding API endpoints in routes.py

### Implementing New Optimization Algorithms
1. Extend packer.py or create new module in app/
2. Update cost_engine.py for cost calculations
3. Modify frontend visualization in static/js/
4. Add comprehensive tests for algorithm validation

### Database Schema Changes
1. Update models in models.py
2. Consider migration path for existing data
3. Update initialization scripts
4. Test with both empty and populated databases

## Troubleshooting Common Issues

### Build Problems
- Ensure all dependencies are in requirements.txt
- Check PyInstaller spec file for correct paths
- Verify Python version compatibility (3.8+ recommended)

### Database Issues
- Check database file permissions
- Verify SQLite version compatibility
- Use database integrity checks: `sqlite3 app/truck_opti.db "PRAGMA integrity_check;"`

### Performance Issues
- Monitor space utilization algorithms for large datasets
- Check database query performance with EXPLAIN QUERY PLAN
- Profile packing algorithms with large carton sets

### Known Issues (Documented in screenshots_problems_in_exe/)
- **Bulk Upload CSV**: JavaScript stack overflow issue identified in minimal .exe build
- **Management Pages**: Some error handlers return JSON instead of HTML templates in .exe mode
- **JavaScript Conflicts**: Event listener duplications resolved by global function exposure

### Recent Improvements (v3.6.0)
- ✅ Advanced 3D packing algorithms integrated based on 2024-2025 research
- ✅ Python 3.13 compatibility achieved for executable builds
- ✅ E2E testing framework with MCP integration implemented
- ✅ Stability validation and load distribution metrics added
- ✅ Full-featured enterprise build (24.3MB) with all algorithms enabled

## 🚀 AUTO-COMMANDS (TruckOpti-Specific)
- `/init-logistics` - Initialize truck/carton types with realistic data
- `/test-packing` - Comprehensive 3D packing algorithm validation
- `/audit-performance` - Algorithm efficiency and response time check  
- `/verify-build` - Complete executable build verification
- `/screenshot-analysis` - Analyze issues in screenshots_problems_in_exe/
- `/deploy-enterprise` - Multi-platform TruckOpti deployment

## 🚫 NEVER CLAIM "WORKING" WITHOUT:
1. **Clean Python compilation** (0 syntax errors)
2. **All tests pass** (comprehensive test suite 100% success)
3. **Algorithm validation** (packing accuracy tests pass)
4. **Clean Flask startup** (no server errors, port binding success)
5. **Frontend verification** (browser loads without console errors)
6. **Executable build** (PyInstaller completes successfully)
7. **Manual packing test** (create truck type, add cartons, verify optimization)
8. **Performance check** (packing response <2s, no memory leaks)

**If ANY step fails, fix before proceeding. No exceptions.**

## 📊 SUCCESS METRICS (TruckOpti-Specific)
- **Zero packing algorithm failures** (100% successful optimizations)
- **100% working logistics solutions** (no partial implementations)
- **>95% space utilization accuracy** on optimization algorithms
- **<2s response time** for complex 3D packing operations
- **Clean executable builds** (no deployment issues)

## 🎯 LOGISTICS-SPECIFIC PROTOCOLS

### 3D Packing Algorithm Changes
```yaml
algorithm_modification_protocol:
  before_changes:
    1: "Backup current packer.py and test results"
    2: "Research logistics industry standards"
    3: "Validate mathematical correctness"
  after_changes:
    1: "Run test_optimization_accuracy.py (must pass)"
    2: "Test with realistic truck/carton combinations"
    3: "Verify space utilization calculations"
    4: "Compare performance against baseline"
    5: "Validate 3D visualization accuracy"
```

### Screenshot Issue Resolution
```yaml
screenshot_issue_protocol:
  analysis:
    1: "Read ALL images in screenshots_problems_in_exe/"
    2: "Extract exact issue description from filename"
    3: "Reproduce issue in development mode"
    4: "Identify root cause (DB/Frontend/Backend/Algorithm)"
  resolution:
    1: "Implement fix with targeted solution"
    2: "Test in both development AND executable modes"
    3: "Verify fix with actual functionality test"
    4: "Only then rename to RESOLVED_[ID].[description].png"
```

**Token-optimized for maximum TruckOpti functionality, minimal overhead, with mandatory logistics quality gates**

This CLAUDE.md focuses on autonomous enterprise development for the TruckOpti 3D truck loading optimization platform, emphasizing research-first development, comprehensive testing protocols, and domain-specific logistics requirements.