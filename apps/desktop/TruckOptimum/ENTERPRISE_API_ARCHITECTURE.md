# TruckOptimum Enterprise API Architecture
## RESTful API Design with GraphQL, Versioning & Enterprise Features

---

## 🎯 API STRATEGY OVERVIEW

### Current State Analysis
- **No Formal API**: Flask routes directly serve HTML with basic AJAX endpoints
- **No Versioning**: Breaking changes affect all clients simultaneously  
- **No Rate Limiting**: Potential for abuse and resource exhaustion
- **No Documentation**: No API contracts or specifications
- **No Authentication**: Basic Flask security, no API token management

### Target Enterprise Requirements
- **Multi-Tier API Access**: Different limits based on subscription tiers
- **Comprehensive Documentation**: Auto-generated OpenAPI 3.0 specifications
- **Rate Limiting**: Prevent abuse while supporting legitimate high-volume usage
- **API Versioning**: Backward compatibility with controlled deprecation
- **Enterprise SLA**: 99.9% availability with performance guarantees

---

## 🏗️ API ARCHITECTURE DESIGN

### API Gateway Pattern
```
Client Request → API Gateway → Service APIs
├── Authentication & Authorization
├── Rate Limiting & Throttling  
├── Request Routing & Load Balancing
├── Response Caching & Compression
├── API Versioning & Content Negotiation
└── Monitoring & Analytics
```

### Technology Stack
- **API Gateway**: Kong or AWS API Gateway
- **Load Balancer**: NGINX or AWS ALB with health checks
- **Rate Limiting**: Redis-based sliding window algorithm
- **Documentation**: OpenAPI 3.0 with Swagger UI
- **Authentication**: JWT tokens with OAuth 2.0 flows
- **Caching**: Multi-level caching (CDN, Gateway, Service)

---

## 🚀 REST API DESIGN

### API Structure and Versioning
```
Base URL: https://api.truckoptimum.com
Versioning Strategy: URL-based versioning with header support

/api/v1/     # Current stable version
/api/v2/     # Next major version (when available)
/graphql     # GraphQL endpoint for complex queries
/webhooks    # Webhook management
/health      # System health checks
/metrics     # API metrics and monitoring
```

### Core API Endpoints

#### 1. Authentication & Authorization
```yaml
# Authentication
POST   /api/v1/auth/login
POST   /api/v1/auth/logout  
POST   /api/v1/auth/refresh
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password

# User Management
GET    /api/v1/users/profile
PUT    /api/v1/users/profile
GET    /api/v1/users/preferences
PUT    /api/v1/users/preferences

# API Tokens
GET    /api/v1/tokens
POST   /api/v1/tokens
DELETE /api/v1/tokens/{token_id}
PUT    /api/v1/tokens/{token_id}
```

#### 2. Tenant & Organization Management
```yaml
# Tenant Operations
GET    /api/v1/tenants/current
PUT    /api/v1/tenants/current
GET    /api/v1/tenants/settings
PUT    /api/v1/tenants/settings
GET    /api/v1/tenants/subscription
PUT    /api/v1/tenants/subscription

# User Management (Admin only)
GET    /api/v1/tenants/users
POST   /api/v1/tenants/users
PUT    /api/v1/tenants/users/{user_id}
DELETE /api/v1/tenants/users/{user_id}

# Role Management
GET    /api/v1/tenants/roles
POST   /api/v1/tenants/roles
PUT    /api/v1/tenants/roles/{role_id}
DELETE /api/v1/tenants/roles/{role_id}
```

#### 3. Carton Management
```yaml
# Carton CRUD Operations
GET    /api/v1/cartons              # List cartons with pagination & filtering
POST   /api/v1/cartons              # Create new carton
GET    /api/v1/cartons/{carton_id}  # Get specific carton
PUT    /api/v1/cartons/{carton_id}  # Update carton
DELETE /api/v1/cartons/{carton_id}  # Delete carton

# Bulk Operations
POST   /api/v1/cartons/bulk         # Bulk create cartons
PUT    /api/v1/cartons/bulk         # Bulk update cartons  
DELETE /api/v1/cartons/bulk         # Bulk delete cartons

# File Upload Operations
POST   /api/v1/cartons/upload       # Upload CSV/Excel file
GET    /api/v1/cartons/upload/{job_id}        # Get upload job status
GET    /api/v1/cartons/upload/{job_id}/errors # Get upload errors

# Templates
GET    /api/v1/cartons/templates    # List available templates
GET    /api/v1/cartons/templates/{template_id} # Download template
POST   /api/v1/cartons/templates    # Create custom template
```

#### 4. Truck Management
```yaml
# Truck Fleet Operations
GET    /api/v1/trucks               # List trucks with filtering
POST   /api/v1/trucks               # Create new truck
GET    /api/v1/trucks/{truck_id}    # Get specific truck
PUT    /api/v1/trucks/{truck_id}    # Update truck
DELETE /api/v1/trucks/{truck_id}    # Delete truck

# Truck Recommendations
POST   /api/v1/trucks/recommend     # Get truck recommendations
GET    /api/v1/trucks/recommend/{recommendation_id} # Get recommendation details

# Fleet Analytics
GET    /api/v1/trucks/analytics     # Fleet utilization analytics
GET    /api/v1/trucks/analytics/utilization # Utilization metrics
GET    /api/v1/trucks/analytics/costs       # Cost analysis
```

#### 5. Optimization Engine
```yaml
# Core Optimization
POST   /api/v1/optimize             # Create optimization request
GET    /api/v1/optimize/{job_id}    # Get optimization result
DELETE /api/v1/optimize/{job_id}    # Cancel optimization job

# Optimization History
GET    /api/v1/optimize/history     # List optimization history
GET    /api/v1/optimize/history/{job_id} # Get historical optimization

# Algorithm Management
GET    /api/v1/algorithms           # List available algorithms
GET    /api/v1/algorithms/{algo_id} # Get algorithm details
POST   /api/v1/algorithms/recommend # Get algorithm recommendation

# Batch Processing
POST   /api/v1/optimize/batch       # Submit batch optimization
GET    /api/v1/optimize/batch/{batch_id} # Get batch status
```

#### 6. Analytics & Reporting
```yaml
# Usage Analytics
GET    /api/v1/analytics/usage      # API usage statistics
GET    /api/v1/analytics/performance # Optimization performance metrics
GET    /api/v1/analytics/costs      # Cost savings analytics

# Custom Reports
GET    /api/v1/reports              # List available reports
POST   /api/v1/reports              # Generate custom report
GET    /api/v1/reports/{report_id}  # Get report results
DELETE /api/v1/reports/{report_id}  # Delete report

# Data Export
POST   /api/v1/export/cartons       # Export carton data
POST   /api/v1/export/optimizations # Export optimization results
GET    /api/v1/export/{export_id}   # Download export file
```

---

## 📊 GraphQL API Design

### GraphQL Schema Overview
```graphql
type Query {
  # Carton queries
  cartons(filter: CartonFilter, pagination: PaginationInput): CartonConnection
  carton(id: ID!): Carton
  
  # Truck queries  
  trucks(filter: TruckFilter, pagination: PaginationInput): TruckConnection
  truck(id: ID!): Truck
  
  # Optimization queries
  optimizations(filter: OptimizationFilter, pagination: PaginationInput): OptimizationConnection
  optimization(id: ID!): Optimization
  
  # Analytics queries
  analytics(timeRange: TimeRangeInput, metrics: [MetricType!]): AnalyticsResult
  
  # Real-time subscriptions
  optimizationProgress(jobId: ID!): OptimizationProgress
}

type Mutation {
  # Carton mutations
  createCarton(input: CreateCartonInput!): CartonResult
  updateCarton(id: ID!, input: UpdateCartonInput!): CartonResult
  deleteCarton(id: ID!): DeleteResult
  
  # Optimization mutations
  createOptimization(input: OptimizationInput!): OptimizationResult
  cancelOptimization(id: ID!): CancelResult
}

type Subscription {
  optimizationUpdates(jobId: ID!): OptimizationUpdate
  systemNotifications(userId: ID!): Notification
}
```

### Complex Query Examples
```graphql
# Get cartons with their optimization history
query getCartonsWithOptimizations {
  cartons(filter: {isActive: true}) {
    edges {
      node {
        id
        name
        dimensions {
          length
          width
          height
        }
        optimizations(last: 5) {
          edges {
            node {
              id
              algorithm
              result {
                volumeUtilization
                recommendation
              }
              createdAt
            }
          }
        }
      }
    }
  }
}

# Real-time optimization progress
subscription optimizationProgress($jobId: ID!) {
  optimizationProgress(jobId: $jobId) {
    jobId
    status
    progress
    currentAlgorithm
    estimatedTimeRemaining
    result {
      volumeUtilization
      recommendedTrucks {
        truck {
          name
          dimensions
        }
        utilization
      }
    }
  }
}
```

---

## 🔧 API FEATURES IMPLEMENTATION

### 1. Rate Limiting Strategy

#### Tier-Based Rate Limits
```yaml
Subscription Tiers:
  Starter ($49/month):
    - API Calls: 1,000/hour
    - Optimizations: 100/hour
    - Bulk Uploads: 5/day
    - Concurrent Requests: 10
    
  Professional ($199/month):
    - API Calls: 10,000/hour
    - Optimizations: 1,000/hour  
    - Bulk Uploads: 50/day
    - Concurrent Requests: 50
    
  Enterprise ($999/month):
    - API Calls: 100,000/hour
    - Optimizations: 10,000/hour
    - Bulk Uploads: Unlimited
    - Concurrent Requests: 200
    
  Enterprise Plus (Custom):
    - API Calls: Unlimited
    - Optimizations: Unlimited
    - Bulk Uploads: Unlimited
    - Concurrent Requests: 1,000+
```

#### Rate Limiting Implementation
```python
class RateLimitingService:
    def __init__(self, redis_client):
        self.redis = redis_client
        
    async def check_rate_limit(self, user_id: str, endpoint: str, 
                              limit: int, window: int) -> bool:
        """
        Sliding window rate limiting with Redis
        """
        key = f"rate_limit:{user_id}:{endpoint}"
        current_time = int(time.time())
        window_start = current_time - window
        
        # Remove expired entries
        await self.redis.zremrangebyscore(key, 0, window_start)
        
        # Count current requests
        current_count = await self.redis.zcard(key)
        
        if current_count >= limit:
            return False
            
        # Add current request
        await self.redis.zadd(key, {str(current_time): current_time})
        await self.redis.expire(key, window)
        
        return True
        
    async def get_rate_limit_status(self, user_id: str, endpoint: str) -> dict:
        """Get current rate limit status for user"""
        key = f"rate_limit:{user_id}:{endpoint}"
        current_count = await self.redis.zcard(key)
        
        return {
            "current_usage": current_count,
            "remaining": max(0, limit - current_count),
            "reset_time": int(time.time()) + window
        }
```

### 2. API Caching Strategy

#### Multi-Level Caching
```python
class APICachingService:
    def __init__(self, redis_client, cdn_client):
        self.redis = redis_client
        self.cdn = cdn_client
        
    async def get_cached_response(self, cache_key: str) -> Optional[dict]:
        """Get response from cache hierarchy"""
        # L1: CDN Cache (for static/public data)
        if self.is_public_endpoint(cache_key):
            response = await self.cdn.get(cache_key)
            if response:
                return response
                
        # L2: Redis Cache (for dynamic/user-specific data)
        response = await self.redis.get(cache_key)
        if response:
            return json.loads(response)
            
        return None
        
    async def set_cache_response(self, cache_key: str, data: dict, 
                               ttl: int = 300):
        """Cache response with appropriate TTL"""
        # Cache in Redis
        await self.redis.setex(cache_key, ttl, json.dumps(data))
        
        # Cache in CDN for public endpoints
        if self.is_public_endpoint(cache_key):
            await self.cdn.set(cache_key, data, ttl)
            
    def generate_cache_key(self, endpoint: str, params: dict, 
                          user_id: str = None) -> str:
        """Generate consistent cache keys"""
        key_parts = [endpoint]
        
        # Add user context for private data
        if user_id and not self.is_public_endpoint(endpoint):
            key_parts.append(f"user:{user_id}")
            
        # Add sorted parameters
        if params:
            param_string = "&".join([f"{k}={v}" for k, v in sorted(params.items())])
            key_parts.append(hashlib.md5(param_string.encode()).hexdigest())
            
        return ":".join(key_parts)
```

### 3. API Documentation Generation

#### OpenAPI 3.0 Specification
```yaml
openapi: 3.0.3
info:
  title: TruckOptimum API
  description: Enterprise truck loading optimization API
  version: 1.0.0
  termsOfService: https://truckoptimum.com/terms
  contact:
    name: TruckOptimum API Support
    url: https://truckoptimum.com/support
    email: api-support@truckoptimum.com
  license:
    name: Proprietary
    url: https://truckoptimum.com/license

servers:
  - url: https://api.truckoptimum.com/api/v1
    description: Production server
  - url: https://staging-api.truckoptimum.com/api/v1  
    description: Staging server

paths:
  /optimize:
    post:
      summary: Create optimization request
      description: Optimize carton loading for specified truck configuration
      operationId: createOptimization
      tags:
        - Optimization
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/OptimizationRequest'
            examples:
              basic_optimization:
                summary: Basic optimization request
                value:
                  cartons: [
                    {
                      "id": "carton-1",
                      "dimensions": {"length": 10, "width": 10, "height": 10},
                      "weight": 5.0,
                      "quantity": 100
                    }
                  ]
                  trucks: [
                    {
                      "id": "truck-1", 
                      "dimensions": {"length": 100, "width": 50, "height": 50},
                      "max_weight": 1000
                    }
                  ]
                  preferences: {
                    "algorithm": "auto",
                    "prioritize": "volume_utilization"
                  }
      responses:
        '202':
          description: Optimization request accepted
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OptimizationJob'
        '400':
          description: Invalid request parameters
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '429':
          description: Rate limit exceeded
          headers:
            X-RateLimit-Limit:
              schema:
                type: integer
              description: Request limit per hour
            X-RateLimit-Remaining:
              schema:
                type: integer
              description: Remaining requests in current window
            X-RateLimit-Reset:
              schema:
                type: integer
              description: Time when rate limit resets (Unix timestamp)

components:
  schemas:
    OptimizationRequest:
      type: object
      required:
        - cartons
        - trucks
      properties:
        cartons:
          type: array
          items:
            $ref: '#/components/schemas/CartonInput'
          minItems: 1
          maxItems: 10000
        trucks:
          type: array  
          items:
            $ref: '#/components/schemas/TruckInput'
          minItems: 1
          maxItems: 100
        preferences:
          $ref: '#/components/schemas/OptimizationPreferences'
          
    OptimizationJob:
      type: object
      properties:
        id:
          type: string
          format: uuid
          description: Unique job identifier
        status:
          type: string
          enum: [pending, processing, completed, failed]
          description: Current job status
        created_at:
          type: string
          format: date-time
          description: Job creation timestamp
        estimated_completion:
          type: string
          format: date-time
          description: Estimated completion time
        progress:
          type: number
          minimum: 0
          maximum: 100
          description: Completion percentage
        result_url:
          type: string
          format: uri
          description: URL to fetch results when completed
          
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: JWT token obtained from /auth/login endpoint
```

### 4. Error Handling and Status Codes

#### Standardized Error Response Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "cartons[0].dimensions.length",
        "message": "Length must be greater than 0",
        "value": -5
      }
    ],
    "request_id": "req_1234567890abcdef",
    "timestamp": "2025-01-15T10:30:00Z",
    "documentation_url": "https://docs.truckoptimum.com/errors/validation-error"
  }
}
```

#### HTTP Status Code Usage
```yaml
Success Responses:
  200 OK: Successful GET, PUT operations
  201 Created: Successful POST operations (resource created)
  202 Accepted: Async operations (optimization requests)
  204 No Content: Successful DELETE operations

Client Error Responses:
  400 Bad Request: Invalid request syntax or parameters
  401 Unauthorized: Missing or invalid authentication
  403 Forbidden: Valid auth but insufficient permissions  
  404 Not Found: Resource not found
  409 Conflict: Resource conflict (duplicate creation)
  422 Unprocessable Entity: Valid syntax but semantic errors
  429 Too Many Requests: Rate limit exceeded

Server Error Responses:
  500 Internal Server Error: Unexpected server error
  502 Bad Gateway: Upstream service error
  503 Service Unavailable: Service temporarily unavailable
  504 Gateway Timeout: Upstream service timeout
```

---

## 🔒 SECURITY IMPLEMENTATION

### API Authentication & Authorization

#### JWT Token Structure
```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "key-2025-01"
  },
  "payload": {
    "sub": "user-uuid-here",
    "tenant_id": "tenant-uuid-here", 
    "email": "user@company.com",
    "roles": ["user", "admin"],
    "permissions": [
      "cartons:read",
      "cartons:write",
      "optimize:create",
      "analytics:read"
    ],
    "subscription_tier": "enterprise",
    "rate_limits": {
      "api_calls_per_hour": 100000,
      "optimizations_per_hour": 10000
    },
    "iat": 1705312200,
    "exp": 1705398600,
    "iss": "truckoptimum.com",
    "aud": "api.truckoptimum.com"
  }
}
```

#### API Key Management
```python
class APIKeyManager:
    async def create_api_key(self, user_id: str, tenant_id: str, 
                            permissions: List[str], name: str) -> dict:
        """Create new API key with specific permissions"""
        key_id = str(uuid.uuid4())
        api_key = self.generate_secure_key()
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        
        key_data = {
            "id": key_id,
            "user_id": user_id,
            "tenant_id": tenant_id,
            "name": name,
            "permissions": permissions,
            "created_at": datetime.utcnow(),
            "last_used": None,
            "is_active": True
        }
        
        # Store key hash and metadata
        await self.db.api_keys.create({
            **key_data,
            "key_hash": key_hash
        })
        
        # Return key only once during creation
        return {
            "api_key": api_key,
            "metadata": key_data
        }
        
    async def validate_api_key(self, api_key: str) -> Optional[dict]:
        """Validate API key and return user context"""
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        
        key_record = await self.db.api_keys.find_by_hash(key_hash)
        if not key_record or not key_record["is_active"]:
            return None
            
        # Update last used timestamp
        await self.db.api_keys.update_last_used(key_record["id"])
        
        return {
            "user_id": key_record["user_id"],
            "tenant_id": key_record["tenant_id"],
            "permissions": key_record["permissions"]
        }
```

---

## 📊 MONITORING AND ANALYTICS

### API Metrics Collection
```python
class APIMetricsCollector:
    def __init__(self, metrics_client):
        self.metrics = metrics_client
        
    async def record_api_call(self, endpoint: str, method: str, 
                             status_code: int, response_time: float,
                             user_id: str, tenant_id: str):
        """Record API call metrics"""
        tags = {
            "endpoint": endpoint,
            "method": method,
            "status_code": status_code,
            "tenant_id": tenant_id,
            "subscription_tier": await self.get_subscription_tier(tenant_id)
        }
        
        # Request count
        await self.metrics.increment("api.requests.total", tags=tags)
        
        # Response time
        await self.metrics.histogram("api.response_time", response_time, tags=tags)
        
        # Error rate
        if status_code >= 400:
            await self.metrics.increment("api.errors.total", tags=tags)
            
    async def record_optimization_performance(self, algorithm: str, 
                                            execution_time: float,
                                            volume_utilization: float):
        """Record optimization-specific metrics"""
        tags = {"algorithm": algorithm}
        
        await self.metrics.histogram("optimization.execution_time", 
                                   execution_time, tags=tags)
        await self.metrics.histogram("optimization.volume_utilization", 
                                   volume_utilization, tags=tags)
```

### SLA Monitoring
```yaml
API SLA Metrics:
  Response Time SLA:
    - P50 < 100ms for CRUD operations
    - P95 < 200ms for CRUD operations  
    - P99 < 500ms for CRUD operations
    - Optimization < 2000ms (maintain current performance)
    
  Availability SLA:
    - 99.9% uptime (8.77 hours downtime/year)
    - < 0.1% error rate for successful requests
    - Automatic failover within 30 seconds
    
  Rate Limit SLA:
    - Fair usage enforcement without impacting legitimate traffic
    - Burst capacity 2x normal limits for short periods
    - Clear rate limit headers in all responses
```

This comprehensive API architecture provides a robust foundation for TruckOptimum's transformation into an enterprise SaaS platform, with proper versioning, security, documentation, and performance monitoring to support the $70M ARR goal.