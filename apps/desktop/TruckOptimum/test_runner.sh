#!/bin/bash

echo ""
echo "============================================================"
echo " TruckOptimum - Comprehensive Test Execution Pipeline"
echo " Zero Human Debugging Required Testing Framework"
echo "============================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    if ! command -v python &> /dev/null; then
        echo -e "${RED}ERROR: Python is not installed or not in PATH${NC}"
        echo "Please install Python 3.7+ and try again"
        exit 1
    else
        PYTHON_CMD=python
    fi
else
    PYTHON_CMD=python3
fi

echo -e "${BLUE}Using Python: $($PYTHON_CMD --version)${NC}"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating Python virtual environment...${NC}"
    $PYTHON_CMD -m venv venv
fi

# Activate virtual environment
echo -e "${BLUE}Activating virtual environment...${NC}"
source venv/bin/activate

# Install/update test dependencies
echo -e "${BLUE}Installing test dependencies...${NC}"
pip install -r requirements_test.txt

# Parse command line arguments
TEST_ARGS=""

case "$1" in
    --quick)
        TEST_ARGS="--quick"
        echo -e "${YELLOW}Running QUICK test suite (unit + integration only)${NC}"
        ;;
    --unit)
        TEST_ARGS="--suite unit"
        echo -e "${YELLOW}Running UNIT tests only${NC}"
        ;;
    --integration)
        TEST_ARGS="--suite integration"
        echo -e "${YELLOW}Running INTEGRATION tests only${NC}"
        ;;
    --ui)
        TEST_ARGS="--suite ui"
        echo -e "${YELLOW}Running UI tests only${NC}"
        ;;
    --e2e)
        TEST_ARGS="--suite e2e"
        echo -e "${YELLOW}Running END-TO-END tests only${NC}"
        ;;
    --performance)
        TEST_ARGS="--suite performance"
        echo -e "${YELLOW}Running PERFORMANCE tests only${NC}"
        ;;
    --visual)
        TEST_ARGS="--suite visual"
        echo -e "${YELLOW}Running VISUAL REGRESSION tests only${NC}"
        ;;
    *)
        echo -e "${YELLOW}Running COMPREHENSIVE test suite (all tests)${NC}"
        ;;
esac

echo ""
echo -e "${BLUE}Starting test execution...${NC}"
echo ""

# Run the test pipeline
$PYTHON_CMD run_tests.py $TEST_ARGS

# Capture exit code
TEST_EXIT_CODE=$?

echo ""
echo "============================================================"
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e " ${GREEN}✅ ALL TESTS PASSED - ZERO HUMAN DEBUGGING REQUIRED!${NC}"
else
    echo -e " ${RED}❌ SOME TESTS FAILED - REVIEW REQUIRED${NC}"
fi
echo "============================================================"
echo ""

# Open test report in default browser (Linux/macOS)
if [ -f "reports/comprehensive_report.html" ]; then
    echo -e "${BLUE}Opening comprehensive test report...${NC}"
    if command -v xdg-open &> /dev/null; then
        xdg-open "reports/comprehensive_report.html"
    elif command -v open &> /dev/null; then
        open "reports/comprehensive_report.html"
    else
        echo "Test report available at: reports/comprehensive_report.html"
    fi
fi

# Exit with the same code as tests
exit $TEST_EXIT_CODE