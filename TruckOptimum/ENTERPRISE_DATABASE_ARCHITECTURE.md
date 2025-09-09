# TruckOptimum Enterprise Database Architecture
## Multi-Database Strategy with SQLite Migration Plan

---

## 🎯 DATABASE STRATEGY OVERVIEW

### Current State Analysis
- **SQLite Database**: 49,152 bytes (truck_optimum.db)
- **Monolithic Schema**: All data in single database file
- **No Multi-tenancy**: Single-tenant data model
- **No Replication**: Single point of failure
- **No Scalability**: Limited concurrent access

### Target Enterprise Requirements
- **Multi-tenancy**: Support 150K customers with data isolation
- **High Availability**: 99.9% uptime with automated failover
- **Performance**: Sub-2 second optimization queries
- **Compliance**: GDPR, CCPA, SOC 2 data requirements
- **Scalability**: 10,000+ concurrent database connections

---

## 🏗️ MULTI-DATABASE ARCHITECTURE

### Database Technology Stack

#### 1. PostgreSQL - Primary OLTP Database
**Use Cases**: Transactional data, user management, core business entities
- **Version**: PostgreSQL 14+ with TimescaleDB extension
- **Configuration**: Master-replica setup with read replicas
- **Features**: 
  - ACID compliance for data integrity
  - Advanced indexing (B-tree, GIN, GIST)
  - Row-level security for multi-tenancy
  - Connection pooling with PgBouncer
- **Performance**: < 50ms for standard queries, 10,000+ connections

#### 2. Redis - Caching and Session Management  
**Use Cases**: Application caching, session storage, real-time data
- **Configuration**: Redis Cluster with sentinel monitoring
- **Features**:
  - Sub-millisecond data access
  - Automatic failover and replication
  - TTL-based cache expiration
  - Pub/Sub for real-time notifications
- **Performance**: < 1ms response time, 100K+ ops/sec

#### 3. MongoDB - Document Storage
**Use Cases**: Configuration data, templates, flexible schemas
- **Configuration**: Replica set with sharding capability
- **Features**:
  - Flexible document schemas
  - GridFS for file storage
  - Aggregation pipeline for analytics
  - Text search capabilities
- **Performance**: < 10ms for document queries

#### 4. InfluxDB - Time-Series Metrics
**Use Cases**: Performance metrics, usage analytics, monitoring data
- **Configuration**: Clustered setup with data retention policies
- **Features**:
  - High-performance time-series storage
  - Automatic data compression and retention
  - Real-time analytics and alerting
  - Grafana integration for visualization
- **Performance**: 1M+ points/sec ingestion

#### 5. Elasticsearch - Search and Logging
**Use Cases**: Full-text search, audit logs, compliance data
- **Configuration**: Multi-node cluster with hot/warm architecture
- **Features**:
  - Full-text search across all entities
  - Log aggregation and analysis
  - Real-time search and filtering
  - Compliance data retention
- **Performance**: < 100ms for complex searches

---

## 📊 DATABASE DESIGN PER SERVICE

### 1. Optimization Engine Service Database

#### PostgreSQL Schema
```sql
-- Algorithm metadata and configurations
CREATE TABLE algorithms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    performance_metrics JSONB,
    configuration JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optimization job tracking
CREATE TABLE optimization_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    algorithm_id UUID REFERENCES algorithms(id),
    status VARCHAR(20) DEFAULT 'pending',
    input_data JSONB NOT NULL,
    result_data JSONB,
    processing_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Performance monitoring
CREATE TABLE algorithm_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    algorithm_id UUID REFERENCES algorithms(id),
    optimization_job_id UUID REFERENCES optimization_jobs(id),
    execution_time_ms INTEGER NOT NULL,
    memory_usage_mb INTEGER,
    cpu_usage_percent DECIMAL(5,2),
    volume_utilization DECIMAL(5,2),
    weight_utilization DECIMAL(5,2),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_optimization_jobs_tenant_status ON optimization_jobs(tenant_id, status);
CREATE INDEX idx_optimization_jobs_created_at ON optimization_jobs(created_at);
CREATE INDEX idx_algorithm_performance_timestamp ON algorithm_performance(timestamp);
```

#### Redis Cache Schema
```yaml
# Optimization result caching (TTL: 1 hour)
optimization:result:{hash} → {
  algorithm_id: uuid,
  result_data: json,
  execution_time: integer,
  cached_at: timestamp
}

# Algorithm selection cache (TTL: 30 minutes)  
algorithm:selection:{input_hash} → {
  recommended_algorithm: uuid,
  confidence_score: decimal,
  cached_at: timestamp
}

# Performance metrics cache (TTL: 5 minutes)
performance:metrics:{algorithm_id} → {
  avg_execution_time: integer,
  success_rate: decimal,
  last_updated: timestamp
}
```

### 2. Carton Management Service Database

#### PostgreSQL Schema
```sql
-- Carton master data
CREATE TABLE cartons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    length_cm DECIMAL(10,2) NOT NULL,
    width_cm DECIMAL(10,2) NOT NULL,
    height_cm DECIMAL(10,2) NOT NULL,
    weight_kg DECIMAL(10,2) NOT NULL,
    volume_cm3 DECIMAL(12,2) GENERATED ALWAYS AS (length_cm * width_cm * height_cm) STORED,
    sku VARCHAR(100),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID NOT NULL
);

-- Bulk upload jobs
CREATE TABLE bulk_upload_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    filename VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'processing',
    total_rows INTEGER,
    processed_rows INTEGER DEFAULT 0,
    success_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    error_details JSONB,
    file_data BYTEA,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Carton templates
CREATE TABLE carton_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    template_data JSONB NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Multi-tenant row-level security
ALTER TABLE cartons ENABLE ROW LEVEL SECURITY;
CREATE POLICY cartons_tenant_policy ON cartons FOR ALL TO app_user USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- Indexes for performance
CREATE INDEX idx_cartons_tenant_active ON cartons(tenant_id, is_active);
CREATE INDEX idx_cartons_dimensions ON cartons(length_cm, width_cm, height_cm);
CREATE INDEX idx_bulk_upload_jobs_tenant_status ON bulk_upload_jobs(tenant_id, status);
```

#### MongoDB Collections
```javascript
// Carton templates with flexible schemas
db.carton_templates.createIndex({ "tenant_id": 1, "is_active": 1 });
db.carton_templates.createIndex({ "template_type": 1, "category": 1 });

// Sample template document
{
  "_id": ObjectId("..."),
  "tenant_id": "uuid",
  "template_name": "Standard CSV Template",
  "template_type": "csv_upload",
  "schema": {
    "columns": [
      {"name": "carton_name", "type": "string", "required": true},
      {"name": "length_cm", "type": "decimal", "required": true},
      {"name": "width_cm", "type": "decimal", "required": true},
      {"name": "height_cm", "type": "decimal", "required": true},
      {"name": "weight_kg", "type": "decimal", "required": true}
    ],
    "validation_rules": {
      "length_cm": {"min": 0.1, "max": 1000},
      "width_cm": {"min": 0.1, "max": 1000},
      "height_cm": {"min": 0.1, "max": 1000},
      "weight_kg": {"min": 0.01, "max": 10000}
    }
  },
  "is_active": true,
  "created_at": ISODate("..."),
  "updated_at": ISODate("...")
}
```

### 3. Truck Management Service Database

#### PostgreSQL Schema
```sql
-- Truck fleet management
CREATE TABLE trucks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    length_cm DECIMAL(10,2) NOT NULL,
    width_cm DECIMAL(10,2) NOT NULL,
    height_cm DECIMAL(10,2) NOT NULL,
    max_weight_kg DECIMAL(10,2) NOT NULL,
    volume_cm3 DECIMAL(12,2) GENERATED ALWAYS AS (length_cm * width_cm * height_cm) STORED,
    cost_per_km DECIMAL(8,2) DEFAULT 0,
    fuel_efficiency DECIMAL(6,2),
    truck_type VARCHAR(50),
    license_plate VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Truck recommendations history
CREATE TABLE truck_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    carton_list_hash VARCHAR(64),
    recommended_trucks JSONB NOT NULL,
    recommendation_score JSONB NOT NULL,
    total_cost DECIMAL(10,2),
    total_volume_utilization DECIMAL(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fleet analytics
CREATE TABLE fleet_utilization_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    truck_id UUID REFERENCES trucks(id),
    date DATE NOT NULL,
    total_trips INTEGER DEFAULT 0,
    avg_volume_utilization DECIMAL(5,2),
    avg_weight_utilization DECIMAL(5,2),
    total_distance_km DECIMAL(10,2),
    total_cost DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_trucks_tenant_active ON trucks(tenant_id, is_active);
CREATE INDEX idx_trucks_capacity ON trucks(max_weight_kg, volume_cm3);
CREATE INDEX idx_truck_recommendations_tenant ON truck_recommendations(tenant_id, created_at);
CREATE INDEX idx_fleet_metrics_date ON fleet_utilization_metrics(tenant_id, date);
```

### 4. User Management Service Database

#### PostgreSQL Schema
```sql
-- Tenants (organizations)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    subdomain VARCHAR(100) UNIQUE,
    subscription_tier VARCHAR(20) DEFAULT 'starter',
    subscription_status VARCHAR(20) DEFAULT 'active',
    billing_email VARCHAR(255),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    password_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Roles and permissions
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id),
    role_id UUID REFERENCES roles(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    PRIMARY KEY (user_id, role_id)
);

-- API tokens
CREATE TABLE api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    tenant_id UUID REFERENCES tenants(id),
    name VARCHAR(100) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    scopes JSONB NOT NULL,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX idx_users_active ON users(is_active, email_verified);
CREATE INDEX idx_api_tokens_hash ON api_tokens(token_hash);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
```

#### Redis Session Management
```yaml
# User sessions (TTL: 24 hours)
session:{session_id} → {
  user_id: uuid,
  tenant_id: uuid,
  permissions: array,
  created_at: timestamp,
  last_activity: timestamp
}

# JWT token blacklist (TTL: token expiry)
jwt:blacklist:{token_hash} → {
  revoked_at: timestamp,
  reason: string
}

# Rate limiting (TTL: 1 hour)
rate_limit:user:{user_id} → {
  requests_count: integer,
  window_start: timestamp
}
```

---

## 🚀 MIGRATION STRATEGY FROM SQLITE

### Phase 1: Schema Analysis and Mapping (Week 1-2)

#### Current SQLite Schema Analysis
```bash
# Extract current schema
sqlite3 truck_optimum.db ".schema" > current_schema.sql

# Extract data samples
sqlite3 truck_optimum.db ".dump" > current_data_sample.sql

# Analyze relationships and constraints
sqlite3 truck_optimum.db "SELECT name FROM sqlite_master WHERE type='table';"
```

#### Schema Mapping Plan
```yaml
SQLite Tables → Target Databases:
  - cartons → PostgreSQL (cartons table)
  - trucks → PostgreSQL (trucks table) 
  - optimization_results → PostgreSQL + Redis cache
  - user_data → PostgreSQL (users, tenants tables)
  - settings → MongoDB (configurations collection)
  - logs → Elasticsearch (audit_logs index)
```

### Phase 2: Dual-Write Implementation (Week 3-4)

#### Migration Service Development
```python
class DatabaseMigrationService:
    def __init__(self):
        self.sqlite_conn = sqlite3.connect('truck_optimum.db')
        self.postgres_conn = psycopg2.connect(postgres_url)
        self.redis_conn = redis.Redis(redis_url)
        
    async def dual_write_carton(self, carton_data):
        """Write to both SQLite and PostgreSQL during migration"""
        # Write to SQLite (existing behavior)
        await self.write_to_sqlite(carton_data)
        
        # Write to PostgreSQL (new behavior)
        await self.write_to_postgres(carton_data)
        
        # Verify data consistency
        await self.verify_consistency(carton_data)
        
    async def migrate_batch(self, table_name, batch_size=1000):
        """Migrate data in batches to avoid memory issues"""
        offset = 0
        while True:
            batch = await self.fetch_sqlite_batch(table_name, offset, batch_size)
            if not batch:
                break
                
            await self.transform_and_load(batch, table_name)
            offset += batch_size
            
            # Progress tracking
            await self.update_migration_progress(table_name, offset)
```

### Phase 3: Data Validation and Reconciliation (Week 5)

#### Validation Framework
```python
class DataValidationFramework:
    async def validate_migration_accuracy(self):
        """Comprehensive validation of migrated data"""
        validation_results = {
            'cartons': await self.validate_cartons_migration(),
            'trucks': await self.validate_trucks_migration(),
            'users': await self.validate_users_migration(),
            'optimization_history': await self.validate_optimization_history()
        }
        
        return validation_results
        
    async def validate_cartons_migration(self):
        """Validate carton data migration accuracy"""
        sqlite_count = await self.count_sqlite_records('cartons')
        postgres_count = await self.count_postgres_records('cartons')
        
        # Sample validation
        sample_records = await self.sample_records_validation('cartons', 1000)
        
        return {
            'record_count_match': sqlite_count == postgres_count,
            'sample_accuracy': sample_records['accuracy_percentage'],
            'data_integrity': sample_records['integrity_checks']
        }
```

### Phase 4: Cutover and Monitoring (Week 6)

#### Cutover Strategy
```yaml
Blue-Green Migration:
  1. Setup Target Environment:
     - Deploy PostgreSQL cluster with all schemas
     - Configure Redis cluster for caching
     - Setup MongoDB for document storage
     
  2. Data Synchronization:
     - Run initial data migration (historical data)
     - Enable dual-write mode for new data
     - Continuous validation of data consistency
     
  3. Application Cutover:
     - Deploy updated application code
     - Switch read traffic to new databases
     - Monitor performance and error rates
     
  4. Rollback Plan:
     - Keep SQLite as backup for 30 days
     - Quick rollback procedure if issues arise
     - Data synchronization back to SQLite if needed
```

---

## 🔧 PERFORMANCE OPTIMIZATION

### Database Performance Tuning

#### PostgreSQL Optimization
```sql
-- Connection and memory settings
shared_buffers = '1GB'
effective_cache_size = '3GB'
maintenance_work_mem = '256MB'
checkpoint_completion_target = 0.9
wal_buffers = '16MB'

-- Query optimization
work_mem = '32MB'
random_page_cost = 1.1
effective_io_concurrency = 200
max_worker_processes = 8
max_parallel_workers_per_gather = 4

-- Monitoring queries
SELECT schemaname, tablename, attname, n_distinct, correlation 
FROM pg_stats 
WHERE schemaname = 'public' 
ORDER BY n_distinct DESC;
```

#### Redis Performance Configuration
```yaml
# Memory management
maxmemory: 2gb
maxmemory-policy: allkeys-lru

# Persistence
save: "900 1"      # Save if at least 1 key changed in 900 seconds
save: "300 10"     # Save if at least 10 keys changed in 300 seconds  
save: "60 10000"   # Save if at least 10000 keys changed in 60 seconds

# Performance
tcp-keepalive: 300
timeout: 0
databases: 16
```

### Caching Strategy Implementation

#### Multi-Level Caching
```python
class MultiLevelCache:
    def __init__(self):
        self.l1_cache = {}  # In-memory cache
        self.l2_cache = redis.Redis()  # Redis cache
        self.l3_cache = None  # CDN cache
        
    async def get_optimization_result(self, request_hash):
        # L1 Cache check (fastest)
        result = self.l1_cache.get(request_hash)
        if result:
            return result
            
        # L2 Cache check (Redis)
        result = await self.l2_cache.get(f"optimization:{request_hash}")
        if result:
            # Populate L1 cache
            self.l1_cache[request_hash] = result
            return result
            
        # L3 Cache / Database fallback
        result = await self.fetch_from_database(request_hash)
        if result:
            # Populate all cache levels
            await self.populate_caches(request_hash, result)
            
        return result
```

---

## 🔒 SECURITY AND COMPLIANCE

### Data Security Implementation

#### Encryption at Rest
```sql
-- PostgreSQL encryption
CREATE TABLE encrypted_cartons (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    encrypted_data BYTEA NOT NULL,  -- AES-256 encrypted
    encryption_key_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row-level security for multi-tenancy
CREATE POLICY tenant_isolation_policy ON cartons 
FOR ALL TO app_role 
USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

#### GDPR Compliance Features
```python
class GDPRComplianceManager:
    async def handle_right_to_be_forgotten(self, user_id: str):
        """Implement GDPR Article 17 - Right to erasure"""
        # Anonymize user data
        await self.anonymize_user_data(user_id)
        
        # Remove optimization history
        await self.delete_optimization_history(user_id)
        
        # Update audit logs
        await self.log_data_deletion(user_id, "GDPR_REQUEST")
        
    async def export_user_data(self, user_id: str):
        """Implement GDPR Article 20 - Right to data portability"""
        user_data = await self.collect_user_data(user_id)
        return self.format_for_export(user_data)
```

---

## 📊 MONITORING AND MAINTENANCE

### Database Monitoring Setup
```yaml
Monitoring Metrics:
  PostgreSQL:
    - Connection pool utilization
    - Query performance (slow queries > 100ms)
    - Lock contention and wait events
    - Replication lag and failover status
    
  Redis:
    - Memory usage and eviction rate
    - Hit ratio for cached optimization results
    - Connection count and command latency
    
  MongoDB:
    - Document query performance
    - Index utilization and efficiency
    - Replica set health and sync status
```

### Automated Maintenance Tasks
```python
class DatabaseMaintenanceScheduler:
    async def run_daily_maintenance(self):
        """Daily maintenance tasks"""
        await self.update_table_statistics()
        await self.cleanup_expired_cache_entries()
        await self.analyze_slow_queries()
        await self.backup_critical_data()
        
    async def run_weekly_maintenance(self):
        """Weekly maintenance tasks"""
        await self.reindex_fragmented_tables()
        await self.archive_old_optimization_results()
        await self.update_performance_baselines()
        await self.security_audit_scan()
```

This comprehensive database architecture provides the foundation for scaling TruckOptimum to enterprise levels while maintaining data integrity, performance, and compliance requirements. The migration strategy ensures a smooth transition from the current SQLite implementation to the new multi-database architecture.