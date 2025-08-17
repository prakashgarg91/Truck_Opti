#!/bin/bash

# Activate virtual environment if needed
source venv/bin/activate

# Install testing requirements
pip install -r testing_requirements.txt

# Start both applications in background
python run.py &
python simple_truckopti_fixed.py &

# Wait a moment for servers to start
sleep 5

# Run comprehensive screenshot test
python -m pytest test_comprehensive_screenshot_verification.py \
    --html=screenshot_test_report.html \
    --self-contained-html

# Kill background processes
pkill -f "python run.py"
pkill -f "python simple_truckopti_fixed.py"