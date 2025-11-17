# 🧪 TruckOptimum Testing - Quick Reference Guide

## ⚡ Quick Start Commands

### Windows
```batch
test_runner.bat                 # Run all tests
test_runner.bat --quick         # Run unit + integration only
test_runner.bat --ui            # Run UI tests only
test_runner.bat --e2e           # Run end-to-end tests only
```

### Linux/macOS
```bash
./test_runner.sh                # Run all tests  
./test_runner.sh --quick        # Run unit + integration only
./test_runner.sh --ui           # Run UI tests only
./test_runner.sh --e2e          # Run end-to-end tests only
```

### Direct Python
```bash
python run_tests.py             # Run all tests
python run_tests.py --quick     # Run unit + integration only
python run_tests.py --suite ui  # Run specific test suite
```

## 📊 Test Suite Overview

| Test Type | Duration | Purpose | Files |
|-----------|----------|---------|-------|
| **Unit** | ~30s | Individual components | `tests/unit/test_*.py` |
| **Integration** | ~45s | Component interactions | `tests/integration/test_*.py` |
| **UI** | ~2-3min | Browser automation | `tests/ui/test_*.py` |
| **E2E** | ~3-5min | Complete workflows | `tests/e2e/test_*.py` |
| **Performance** | ~1-2min | Load & stress testing | `tests/performance/test_*.py` |
| **Visual** | ~1-2min | UI consistency | `tests/visual/test_*.py` |

## 🎯 Key Performance Benchmarks

- **API Response**: < 1 second
- **Page Load**: < 5 seconds  
- **Modal Open/Close**: < 1 second
- **Optimization**: < 10 seconds (complex scenarios)
- **Concurrent Load**: 20+ simultaneous requests
- **Memory Usage**: < 200MB increase

## 📈 Success Metrics

### When Tests Pass, You Get:
✅ **100% API Coverage** - All endpoints tested  
✅ **100% UI Coverage** - All buttons/forms tested  
✅ **100% Workflow Coverage** - All user journeys tested  
✅ **Security Validated** - SQL injection & XSS protected  
✅ **Performance Validated** - All benchmarks met  
✅ **Visual Consistency** - No UI regressions  

## 🛠️ Common Commands

### Run Specific Test File
```bash
pytest tests/unit/test_api_cartons.py -v
```

### Run Specific Test Method
```bash
pytest tests/unit/test_api_cartons.py::TestCartonAPI::test_create_carton_success -v
```

### Run Tests with Coverage
```bash
pytest tests/ --cov=. --cov-report=html
```

### Run Performance Tests Only
```bash
pytest tests/performance/ -v
```

## 📁 Important Directories

- `tests/` - All test files
- `reports/` - Test results and HTML reports
- `reports/screenshots/` - UI test screenshots
- `reports/coverage/` - Code coverage reports

## 🚨 Troubleshooting

### Test Failures
1. Check `reports/comprehensive_report.html` for detailed analysis
2. Look at individual test suite reports in `reports/`
3. Review screenshots in `reports/screenshots/` for UI issues

### Performance Issues
1. Check performance metrics in comprehensive report
2. Review `reports/performance_tests.json`
3. Look for memory/timing violations

### Environment Issues
```bash
pip install -r requirements_test.txt  # Install dependencies
```

## 🎪 Test Categories

### By Test Markers
```bash
pytest -m unit          # Unit tests only
pytest -m api           # API tests only  
pytest -m ui            # UI tests only
pytest -m critical      # Critical functionality only
pytest -m performance   # Performance tests only
```

### By Test Level
```bash
pytest tests/unit/              # Fastest (~30s)
pytest tests/integration/       # Medium (~45s)
pytest tests/ui/ tests/e2e/     # Slower (3-5min)
```

## 🏆 Quality Gates

### Before Code Commit
```bash
python run_tests.py --quick     # Quick validation
```

### Before Production Deploy
```bash
python run_tests.py             # Full validation
```

### After UI Changes
```bash
python run_tests.py --suite ui visual  # UI + visual validation
```

## 📊 Report Locations

- **Main Report**: `reports/comprehensive_report.html`
- **Coverage**: `reports/coverage/html/index.html`  
- **Screenshots**: `reports/screenshots/`
- **JSON Data**: `reports/comprehensive_results.json`

---

**🎯 Remember: When ALL tests pass = ZERO human debugging required!**