# TruckOpti - Production Dockerfile
# Multi-stage build for optimized production image

# Stage 1: Builder
FROM python:3.11-slim as builder

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    postgresql-client \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements from the reorganized web app
COPY apps/web/requirements.txt ./requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Production
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 truckopti && \
    chown -R truckopti:truckopti /app

# Copy Python dependencies from builder
COPY --from=builder /root/.local /home/truckopti/.local

# Copy application code
COPY --chown=truckopti:truckopti . .

# Switch to application directory
WORKDIR /app/apps/web

# Set environment variables
ENV PATH=/home/truckopti/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    FLASK_APP=run.py \
    FLASK_ENV=production \
    PYTHONPATH=/app/apps/web:/app/apps/web/app

# Switch to non-root user
USER truckopti

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:5000/api/health')"

# Run application with Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "--threads", "2", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-", "run:app"]
