# TruckOpti - Production Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Database Setup](#database-setup)
4. [Docker Deployment](#docker-deployment)
5. [Traditional Deployment](#traditional-deployment)
6. [Configuration](#configuration)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)
9. [Security Checklist](#security-checklist)

---

## Prerequisites

### System Requirements
- **OS**: Ubuntu 20.04 LTS or later (recommended)
- **CPU**: 2+ cores
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 20GB minimum, 50GB recommended
- **Network**: Static IP address, domain name configured

### Software Requirements
- Docker 24.0+ & Docker Compose 2.0+
- Python 3.11+
- PostgreSQL 16+ (if not using Docker)
- Redis 7+ (if not using Docker)
- Nginx (for reverse proxy)

---

## Environment Setup

### 1. Clone Repository
```bash
git clone https://github.com/your-org/truckopti.git
cd truckopti
```

### 2. Create Environment File
```bash
cp .env.production.example .env
```

### 3. Configure Environment Variables
Edit `.env` and set all required values:

```bash
# Required - Generate secure keys
SECRET_KEY=$(python -c 'import secrets; print(secrets.token_hex(32))')
JWT_SECRET_KEY=$(python -c 'import secrets; print(secrets.token_hex(32))')

# Database
DATABASE_URL=postgresql://truckopti_user:SECURE_PASSWORD@localhost:5432/truckopti_production

# Email (SendGrid example)
MAIL_USERNAME=apikey
MAIL_PASSWORD=SG.your-sendgrid-api-key

# AWS S3 (optional)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=truckopti-files

# Monitoring (Sentry - optional)
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project
```

---

## Database Setup

### Option 1: Docker (Recommended)
Database is automatically configured with docker-compose.

### Option 2: Manual PostgreSQL Setup
```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE truckopti_production;
CREATE USER truckopti_user WITH PASSWORD 'SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE truckopti_production TO truckopti_user;
\q

# Run migrations
flask db upgrade
```

---

## Docker Deployment (Recommended)

### 1. Set Environment Variables
```bash
# Edit .env file with production values
nano .env
```

### 2. Build and Start Services
```bash
# Build Docker image
docker-compose build

# Start all services
docker-compose up -d

# Check service status
docker-compose ps
```

### 3. Run Database Migrations
```bash
docker-compose exec app flask db upgrade
```

### 4. Create Initial Admin User (if applicable)
```bash
docker-compose exec app python -c "
from app import create_app, db
from app.models import User
app = create_app('production')
with app.app_context():
    admin = User(email='admin@truckopti.com', role='admin')
    admin.set_password('SECURE_PASSWORD')
    db.session.add(admin)
    db.session.commit()
    print('Admin user created!')
"
```

### 5. Verify Deployment
```bash
# Check health endpoint
curl http://localhost/api/health

# Check detailed health
curl http://localhost/api/v1/health/detailed

# View logs
docker-compose logs -f app
```

---

## Traditional Deployment (Without Docker)

### 1. Install System Dependencies
```bash
sudo apt update
sudo apt install python3.11 python3.11-venv python3-pip \
  postgresql postgresql-contrib redis-server nginx
```

### 2. Create Virtual Environment
```bash
python3.11 -m venv venv
source venv/bin/activate
```

### 3. Install Python Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn
```

### 4. Set Up Database
```bash
# Create database (see Database Setup section)
# Run migrations
export FLASK_APP=run.py
flask db upgrade
```

### 5. Configure Systemd Service
Create `/etc/systemd/system/truckopti.service`:

```ini
[Unit]
Description=TruckOpti Application
After=network.target postgresql.service redis.service

[Service]
User=truckopti
Group=www-data
WorkingDirectory=/opt/truckopti
Environment="PATH=/opt/truckopti/venv/bin"
EnvironmentFile=/opt/truckopti/.env
ExecStart=/opt/truckopti/venv/bin/gunicorn --bind 127.0.0.1:5000 --workers 4 --threads 2 run:app

[Install]
WantedBy=multi-user.target
```

### 6. Start Service
```bash
sudo systemctl daemon-reload
sudo systemctl enable truckopti
sudo systemctl start truckopti
sudo systemctl status truckopti
```

### 7. Configure Nginx
```bash
sudo cp nginx.conf /etc/nginx/sites-available/truckopti
sudo ln -s /etc/nginx/sites-available/truckopti /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Configuration

### SSL/TLS Certificate (Let's Encrypt)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d truckopti.com -d www.truckopti.com

# Auto-renewal is configured automatically
```

### Firewall Configuration
```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow SSH
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
```

---

## Monitoring & Maintenance

### Logging
```bash
# Docker logs
docker-compose logs -f app

# Traditional deployment logs
sudo journalctl -u truckopti -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Database Backup
```bash
# Docker PostgreSQL backup
docker-compose exec db pg_dump -U truckopti_user truckopti > backup_$(date +%Y%m%d).sql

# Traditional PostgreSQL backup
sudo -u postgres pg_dump truckopti_production > backup_$(date +%Y%m%d).sql

# Automated daily backups
echo "0 2 * * * /opt/truckopti/scripts/backup.sh" | sudo crontab -
```

### Database Restore
```bash
# Docker PostgreSQL restore
docker-compose exec -T db psql -U truckopti_user truckopti < backup.sql

# Traditional PostgreSQL restore
sudo -u postgres psql truckopti_production < backup.sql
```

### Updates & Maintenance
```bash
# Pull latest code
git pull origin main

# Docker deployment
docker-compose build
docker-compose up -d
docker-compose exec app flask db upgrade

# Traditional deployment
source venv/bin/activate
pip install -r requirements.txt
flask db upgrade
sudo systemctl restart truckopti
```

---

## Troubleshooting

### Application Won't Start
```bash
# Check logs
docker-compose logs app

# Check environment variables
docker-compose exec app env | grep FLASK

# Verify database connection
docker-compose exec app python -c "from app import create_app; app = create_app('production'); print('OK')"
```

### Database Connection Issues
```bash
# Check PostgreSQL status
docker-compose ps db
# or
sudo systemctl status postgresql

# Test connection
psql postgresql://truckopti_user:PASSWORD@localhost:5432/truckopti_production -c "SELECT 1;"
```

### High CPU/Memory Usage
```bash
# Check resource usage
docker stats

# Scale workers
docker-compose up -d --scale app=3

# Monitor processes
htop
```

### Performance Issues
```bash
# Check slow queries
docker-compose exec db psql -U truckopti_user -d truckopti -c "SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Check Redis
docker-compose exec redis redis-cli INFO
```

---

## Security Checklist

### Pre-Production Security
- [ ] Change all default passwords
- [ ] Generate secure SECRET_KEY and JWT_SECRET_KEY
- [ ] Configure firewall (UFW/iptables)
- [ ] Enable SSL/TLS with valid certificate
- [ ] Set up database backups
- [ ] Configure rate limiting
- [ ] Enable CORS for allowed origins only
- [ ] Set secure cookie flags
- [ ] Configure CSP headers
- [ ] Enable HSTS
- [ ] Set up error monitoring (Sentry)
- [ ] Configure log rotation
- [ ] Enable automatic security updates
- [ ] Review and restrict file permissions
- [ ] Disable debug mode
- [ ] Remove test/development code

### Ongoing Security
- [ ] Regular security updates
- [ ] Monitor application logs
- [ ] Review user access logs
- [ ] Regular database backups
- [ ] Security vulnerability scanning
- [ ] SSL certificate renewal
- [ ] Password rotation policy
- [ ] Regular penetration testing

---

## Production Checklist

### Before Launch
- [ ] All environment variables configured
- [ ] Database migrations completed
- [ ] SSL certificate installed
- [ ] Monitoring set up (Sentry/APM)
- [ ] Backups configured and tested
- [ ] Load testing completed
- [ ] Security audit passed
- [ ] Documentation complete
- [ ] Support system ready
- [ ] Rollback procedure tested

### Launch Day
- [ ] Final code review
- [ ] Database backup created
- [ ] Deploy to production
- [ ] Verify all services running
- [ ] Test critical user flows
- [ ] Monitor error logs
- [ ] Check performance metrics
- [ ] Announce to users

### Post-Launch
- [ ] Monitor application 24/7 for first week
- [ ] Respond to user feedback
- [ ] Fix any critical issues immediately
- [ ] Document lessons learned
- [ ] Plan next iteration

---

## Support & Resources

### Documentation
- API Documentation: https://truckopti.com/api/docs
- User Guide: https://docs.truckopti.com
- GitHub: https://github.com/your-org/truckopti

### Monitoring
- Application: https://truckopti.com/admin/monitoring
- Sentry: https://sentry.io/your-org/truckopti
- Status Page: https://status.truckopti.com

### Contact
- Email: support@truckopti.com
- Slack: #truckopti-support
- Emergency: +1-XXX-XXX-XXXX

---

**Deployment Guide Version**: 1.0
**Last Updated**: 2025-11-11
**Maintained By**: TruckOpti DevOps Team
