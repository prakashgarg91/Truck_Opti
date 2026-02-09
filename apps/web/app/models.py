from datetime import datetime
import json
import uuid

# Import db from the module where it's defined
from .extensions import db


def _generate_shipment_number() -> str:
    """Generate a unique shipment identifier."""
    return f"SHIP-{uuid.uuid4().hex[:8].upper()}"


class BaseModel:
    """Base model class with shared functionality for all models"""

    def as_dict(self, include_columns=None, exclude_columns=None):
        """Enhanced dictionary serialization with optional column filtering"""
        columns = include_columns or [c.name for c in self.__table__.columns]
        exclude_columns = exclude_columns or []

        def safe_serialize(column_name):
            """Safely convert complex types to JSON-serializable formats"""
            value = getattr(self, column_name, None)
            if value is None:
                return None
            if isinstance(value, datetime):
                return value.isoformat()
            if hasattr(value, 'as_dict'):
                return value.as_dict()
            try:
                json.dumps(value)
                return value
            except TypeError:
                return str(value)

        result = {}
        for column in columns:
            if column not in exclude_columns:
                result[column] = safe_serialize(column)
        return result


class TruckType(BaseModel, db.Model):
    __tablename__ = 'truck_type'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    length = db.Column(db.Float, nullable=False)
    width = db.Column(db.Float, nullable=False)
    height = db.Column(db.Float, nullable=False)
    max_weight = db.Column(db.Float)
    cost_per_km = db.Column(db.Float, default=0.0)
    fuel_efficiency = db.Column(db.Float, default=0.0)  # km per liter
    driver_cost_per_day = db.Column(db.Float, default=0.0)
    maintenance_cost_per_km = db.Column(db.Float, default=0.0)
    truck_category = db.Column(db.String(50), default='Standard')  # Light, Medium, Heavy
    availability = db.Column(db.Boolean, default=True, index=True)  # Index for filtering available trucks
    description = db.Column(db.Text)
    
    # Relationships
    packing_jobs = db.relationship('PackingJob', backref='truck_type', lazy=True)
    
    # Indexes for performance optimization - use strings, not self references
    __table_args__ = (
        db.Index('idx_truck_volume', 'length', 'width', 'height'),  # For volume-based sorting
        db.Index('idx_truck_availability_category', 'availability', 'truck_category'),
    )
    
    def calculate_max_cartons(self, avg_carton_weight=50, safety_factor=0.7):
        """Estimate maximum number of standard cartons this truck can carry"""
        if not self.max_weight:
            return None
        return int((self.max_weight * safety_factor) / avg_carton_weight)
    
    def get_performance_metrics(self):
        """Generate detailed performance metrics for truck type"""
        return {
            'volume_m3': round(self.length * self.width * self.height / 1_000_000, 2) if self.length and self.width and self.height else None,
            'has_valid_dimensions': all([self.length > 0, self.width > 0, self.height > 0]),
            'estimated_max_cartons': self.calculate_max_cartons(),
            'category_details': {
                'category': self.truck_category,
                'is_available': self.availability
            },
            'cost_metrics': {
                'cost_per_km': self.cost_per_km,
                'fuel_efficiency': self.fuel_efficiency,
                'driver_daily_cost': self.driver_cost_per_day,
                'maintenance_cost_per_km': self.maintenance_cost_per_km
            }
        }


class CartonType(BaseModel, db.Model):
    __tablename__ = 'carton_type'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    length = db.Column(db.Float, nullable=False)
    width = db.Column(db.Float, nullable=False)
    height = db.Column(db.Float, nullable=False)
    weight = db.Column(db.Float)
    can_rotate = db.Column(db.Boolean, default=True)
    fragile = db.Column(db.Boolean, default=False)
    stackable = db.Column(db.Boolean, default=True)
    max_stack_height = db.Column(db.Integer, default=5)
    priority = db.Column(db.Integer, default=1)  # 1-5, 5 being highest
    value = db.Column(db.Float, default=0.0)
    category = db.Column(db.String(50), default='General', index=True)
    description = db.Column(db.Text)
    
    # Indexes for carton type searches - use strings, not self references
    __table_args__ = (
        db.Index('idx_carton_name', 'name'),  # For name-based searches
        db.Index('idx_carton_dimensions', 'length', 'width', 'height'),  # For dimension-based searches
    )
    
    def get_packaging_metrics(self):
        """Compute detailed packaging and handling metrics"""
        return {
            'volume_m3': round(self.length * self.width * self.height / 1_000_000, 4) if self.length and self.width and self.height else None,
            'has_valid_dimensions': all([self.length > 0, self.width > 0, self.height > 0]),
            'density_kg_m3': round(self.weight / (self.length * self.width * self.height / 1_000_000), 2) if self.weight and self.length and self.width and self.height else None,
            'handling_requirements': {
                'fragile': self.fragile,
                'stackable': self.stackable,
                'max_stack_height': self.max_stack_height,
                'priority': self.priority
            },
            'value_metrics': {
                'carton_value': self.value,
                'category': self.category
            }
        }


class Customer(BaseModel, db.Model):
    """Customer model for logistics operations"""
    __tablename__ = 'customer'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(200))
    phone = db.Column(db.String(50))
    address = db.Column(db.Text)
    city = db.Column(db.String(100))
    state = db.Column(db.String(100))
    pincode = db.Column(db.String(20))
    gstin = db.Column(db.String(15))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    shipments = db.relationship('Shipment', backref='customer', lazy=True)
    invoices = db.relationship('GSTInvoice', backref='customer', lazy=True)


class Route(BaseModel, db.Model):
    """Route planning and optimization"""
    __tablename__ = 'route'
    
    id = db.Column(db.Integer, primary_key=True)
    
    name = db.Column(db.String(200))
    status = db.Column(db.String(50), default='pending')  # pending, active, completed
    
    # Route details
    start_location = db.Column(db.Text)
    end_location = db.Column(db.Text)
    waypoints = db.Column(db.Text)  # JSON array of waypoints
    
    # Distance and time
    total_distance_km = db.Column(db.Float)
    estimated_duration_minutes = db.Column(db.Integer)
    
    # Assigned resources
    truck_id = db.Column(db.Integer, db.ForeignKey('truck_type.id'), nullable=True)
    driver_id = db.Column(db.String(100))
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)
    
    # Relationships
    truck = db.relationship('TruckType', backref='routes')
    shipments = db.relationship('Shipment', backref='route', lazy=True)


class Shipment(BaseModel, db.Model):
    """Shipment tracking model"""
    __tablename__ = 'shipment'
    
    id = db.Column(db.Integer, primary_key=True)
    shipment_number = db.Column(db.String(100), unique=True, nullable=False, default=_generate_shipment_number)
    
    # Foreign keys
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    truck_id = db.Column(db.Integer, db.ForeignKey('truck_type.id'), nullable=True)
    route_id = db.Column(db.Integer, db.ForeignKey('route.id'), nullable=True)
    
    # Status
    status = db.Column(db.String(50), default='pending')  # pending, in_transit, delivered, cancelled
    priority = db.Column(db.Integer, default=1)  # 1-5
    
    # Locations
    origin_address = db.Column(db.Text)
    destination_address = db.Column(db.Text)
    
    # Tracking
    current_latitude = db.Column(db.Float)
    current_longitude = db.Column(db.Float)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    pickup_time = db.Column(db.DateTime)
    delivery_time = db.Column(db.DateTime)
    estimated_delivery = db.Column(db.DateTime)
    date_created = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Financial
    total_value = db.Column(db.Float, default=0.0)
    total_weight = db.Column(db.Float, default=0.0)
    total_volume = db.Column(db.Float, default=0.0)
    special_instructions = db.Column(db.Text)
    
    # Relationships
    items = db.relationship('ShipmentItem', backref='shipment', lazy=True, cascade='all, delete-orphan')
    packing_jobs = db.relationship('PackingJob', backref='shipment', lazy=True)
    invoice = db.relationship('GSTInvoice', backref='shipment', uselist=False)


class ShipmentItem(BaseModel, db.Model):
    """Individual items within a shipment"""
    __tablename__ = 'shipment_item'
    
    id = db.Column(db.Integer, primary_key=True)
    
    shipment_id = db.Column(db.Integer, db.ForeignKey('shipment.id'), nullable=False)
    carton_type_id = db.Column(db.Integer, db.ForeignKey('carton_type.id'), nullable=True)
    
    # Item details
    name = db.Column(db.String(200), nullable=False)
    quantity = db.Column(db.Integer, default=1)
    
    # Physical properties
    length = db.Column(db.Float)
    width = db.Column(db.Float)
    height = db.Column(db.Float)
    weight = db.Column(db.Float)
    
    # Special handling
    is_fragile = db.Column(db.Boolean, default=False)
    special_instructions = db.Column(db.Text)
    
    # Relationships
    carton_type = db.relationship('CartonType', backref='shipment_items')


class PackingJob(BaseModel, db.Model):
    __tablename__ = 'packing_job'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    date_created = db.Column(db.DateTime, default=datetime.utcnow)
    truck_type_id = db.Column(db.Integer, db.ForeignKey('truck_type.id'))
    shipment_id = db.Column(db.Integer, db.ForeignKey('shipment.id'), nullable=True)
    status = db.Column(db.String(20), default='pending')
    optimization_goal = db.Column(db.String(20), default='space')  # space, cost, time
    
    # Relationships
    packing_results = db.relationship('PackingResult', backref='packing_job', lazy=True)


class PackingResult(BaseModel, db.Model):
    __tablename__ = 'packing_result'
    
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('packing_job.id'))
    truck_count = db.Column(db.Integer)
    space_utilization = db.Column(db.Float)
    weight_utilization = db.Column(db.Float)
    total_cost = db.Column(db.Float, default=0.0)
    estimated_fuel_cost = db.Column(db.Float, default=0.0)
    estimated_delivery_time = db.Column(db.Float, default=0.0)
    co2_emissions = db.Column(db.Float, default=0.0)
    result_data = db.Column(db.JSON)  # Stores 3D packing positions
    optimization_score = db.Column(db.Float, default=0.0)
    date_calculated = db.Column(db.DateTime, default=datetime.utcnow)


class Analytics(BaseModel, db.Model):
    """Analytics data model"""
    __tablename__ = 'analytics'
    
    id = db.Column(db.Integer, primary_key=True)
    
    metric_type = db.Column(db.String(100), nullable=False)
    metric_name = db.Column(db.String(200), nullable=False)
    metric_value = db.Column(db.Float, default=0.0)
    
    # Legacy analytics fields
    date = db.Column(db.Date, default=lambda: datetime.utcnow().date())
    total_shipments = db.Column(db.Integer, default=0)
    total_trucks_used = db.Column(db.Integer, default=0)
    average_space_utilization = db.Column(db.Float, default=0.0)
    total_cost = db.Column(db.Float, default=0.0)
    total_distance = db.Column(db.Float, default=0.0)
    total_co2_emissions = db.Column(db.Float, default=0.0)
    
    # Time period
    period_start = db.Column(db.DateTime)
    period_end = db.Column(db.DateTime)
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class SaleOrder(BaseModel, db.Model):
    """Sale Order model for Excel/CSV upload processing"""
    __tablename__ = 'sale_order'
    
    id = db.Column(db.Integer, primary_key=True)
    sale_order_number = db.Column(db.String(100), nullable=False)
    batch_id = db.Column(db.Integer, db.ForeignKey('sale_order_batch.id'))
    customer_name = db.Column(db.String(200))
    order_date = db.Column(db.Date)
    delivery_address = db.Column(db.Text)
    priority = db.Column(db.Integer, default=1)  # 1-5, 5 being highest
    status = db.Column(db.String(20), default='pending')  # pending, processed, optimized
    total_items = db.Column(db.Integer, default=0)
    total_volume = db.Column(db.Float, default=0.0)
    total_weight = db.Column(db.Float, default=0.0)
    recommended_truck_id = db.Column(db.Integer, db.ForeignKey('truck_type.id'))
    optimization_score = db.Column(db.Float, default=0.0)
    estimated_utilization = db.Column(db.Float, default=0.0)
    estimated_cost = db.Column(db.Float, default=0.0)
    processing_notes = db.Column(db.Text)
    date_created = db.Column(db.DateTime, default=datetime.utcnow)
    date_processed = db.Column(db.DateTime)
    
    # Relationships
    recommended_truck = db.relationship('TruckType', backref='recommended_orders')
    sale_order_items = db.relationship('SaleOrderItem', backref='sale_order', lazy=True, cascade='all, delete-orphan')
    truck_recommendations = db.relationship('TruckRecommendation', backref='sale_order', lazy=True)
    
    # Indexes for sale order queries
    __table_args__ = (
        db.Index('idx_sale_order_batch', 'batch_id'),  # For batch filtering
        db.Index('idx_sale_order_status', 'status'),  # For status filtering
        db.Index('idx_sale_order_date', 'date_created'),  # For date sorting
        db.Index('idx_sale_order_number', 'sale_order_number'),  # For order number searches
    )


class SaleOrderItem(BaseModel, db.Model):
    """Individual items within a sale order"""
    __tablename__ = 'sale_order_item'
    
    id = db.Column(db.Integer, primary_key=True)
    sale_order_id = db.Column(db.Integer, db.ForeignKey('sale_order.id'), nullable=False)
    item_code = db.Column(db.String(100), nullable=False)
    item_name = db.Column(db.String(200), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    unit_length = db.Column(db.Float, default=0.0)
    unit_width = db.Column(db.Float, default=0.0)
    unit_height = db.Column(db.Float, default=0.0)
    unit_weight = db.Column(db.Float, default=0.0)
    unit_value = db.Column(db.Float, default=0.0)
    category = db.Column(db.String(100), default='General')
    fragile = db.Column(db.Boolean, default=False)
    stackable = db.Column(db.Boolean, default=True)
    total_volume = db.Column(db.Float, default=0.0)
    total_weight = db.Column(db.Float, default=0.0)
    notes = db.Column(db.Text)


class SaleOrderBatch(BaseModel, db.Model):
    """Batch processing for multiple sale orders from Excel/CSV"""
    __tablename__ = 'sale_order_batch'
    
    id = db.Column(db.Integer, primary_key=True)
    batch_name = db.Column(db.String(200), nullable=False)
    filename = db.Column(db.String(200), nullable=False)
    total_orders = db.Column(db.Integer, default=0)
    processed_orders = db.Column(db.Integer, default=0)
    failed_orders = db.Column(db.Integer, default=0)
    status = db.Column(db.String(20), default='pending')  # pending, processing, completed, failed
    processing_notes = db.Column(db.Text)
    date_created = db.Column(db.DateTime, default=datetime.utcnow)
    date_completed = db.Column(db.DateTime)
    
    # Relationships
    sale_orders = db.relationship('SaleOrder', backref='batch', lazy=True)


class TruckRecommendation(BaseModel, db.Model):
    """Store truck recommendations for sale orders with detailed analysis"""
    __tablename__ = 'truck_recommendation'
    
    id = db.Column(db.Integer, primary_key=True)
    sale_order_id = db.Column(db.Integer, db.ForeignKey('sale_order.id'), nullable=False)
    truck_type_id = db.Column(db.Integer, db.ForeignKey('truck_type.id'), nullable=False)
    ranking = db.Column(db.Integer, default=1)  # 1 = best recommendation
    utilization_score = db.Column(db.Float, default=0.0)
    cost_score = db.Column(db.Float, default=0.0)
    efficiency_score = db.Column(db.Float, default=0.0)
    overall_score = db.Column(db.Float, default=0.0)
    space_utilization = db.Column(db.Float, default=0.0)
    weight_utilization = db.Column(db.Float, default=0.0)
    estimated_cost = db.Column(db.Float, default=0.0)
    fits_completely = db.Column(db.Boolean, default=True)
    overflow_items = db.Column(db.Integer, default=0)
    recommendation_reason = db.Column(db.Text)
    date_calculated = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    truck_type = db.relationship('TruckType', backref='recommendations')


class UserSettings(BaseModel, db.Model):
    """Store user configuration and preferences for logistics operations"""
    __tablename__ = 'user_settings'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(50), default='default_user')  # For future multi-user support
    
    # Default truck preferences
    default_truck_category = db.Column(db.String(50), default='Standard')
    preferred_truck_types = db.Column(db.Text)  # JSON string of preferred truck IDs
    
    # Cost calculation parameters
    fuel_cost_per_liter = db.Column(db.Float, default=100.0)  # INR per liter
    driver_daily_allowance = db.Column(db.Float, default=800.0)  # INR per day
    insurance_cost_percentage = db.Column(db.Float, default=2.0)  # % of trip cost
    loading_unloading_cost = db.Column(db.Float, default=500.0)  # INR per truck
    
    # Optimization strategy defaults
    default_optimization_goal = db.Column(db.String(20), default='space')  # space, cost, balanced
    space_utilization_target = db.Column(db.Float, default=85.0)  # Target utilization %
    weight_safety_margin = db.Column(db.Float, default=10.0)  # Safety margin %
    
    # Packing preferences
    allow_carton_rotation = db.Column(db.Boolean, default=True)
    fragile_items_on_top = db.Column(db.Boolean, default=True)
    max_stack_height = db.Column(db.Integer, default=5)
    load_balance_priority = db.Column(db.Boolean, default=True)
    
    # UI/UX preferences
    dashboard_refresh_interval = db.Column(db.Integer, default=30)  # seconds
    show_detailed_metrics = db.Column(db.Boolean, default=True)
    enable_3d_visualization = db.Column(db.Boolean, default=True)
    charts_animation_enabled = db.Column(db.Boolean, default=True)
    
    # Notification preferences
    email_notifications = db.Column(db.Boolean, default=False)
    job_completion_alerts = db.Column(db.Boolean, default=True)
    cost_threshold_alerts = db.Column(db.Boolean, default=True)
    cost_alert_threshold = db.Column(db.Float, default=10000.0)  # INR
    
    # Company/Organization settings
    company_name = db.Column(db.String(200), default='TruckOpti User')
    default_origin_city = db.Column(db.String(100), default='Mumbai')
    working_hours_start = db.Column(db.String(5), default='09:00')
    working_hours_end = db.Column(db.String(5), default='18:00')
    
    # Data management
    auto_cleanup_old_jobs = db.Column(db.Boolean, default=False)
    data_retention_days = db.Column(db.Integer, default=90)
    
    # Timestamps
    date_created = db.Column(db.DateTime, default=datetime.utcnow)
    date_updated = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    @staticmethod
    def get_user_settings(user_id='default_user'):
        """Get user settings, create default if doesn't exist"""
        settings = UserSettings.query.filter_by(user_id=user_id).first()
        if not settings:
            settings = UserSettings(user_id=user_id)
            db.session.add(settings)
            db.session.commit()
        return settings
    
    def as_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class LocationHistory(BaseModel, db.Model):
    """Persisted location history for tracking and audit"""
    __tablename__ = 'location_history'
    
    id = db.Column(db.Integer, primary_key=True)
    entity_id = db.Column(db.String(50), nullable=False, index=True)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    accuracy = db.Column(db.Float, default=0.0)
    speed = db.Column(db.Float, default=0.0)
    heading = db.Column(db.Float, default=0.0)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    shipment_id = db.Column(db.Integer, db.ForeignKey('shipment.id'), nullable=True)


class GSTInvoice(BaseModel, db.Model):
    """GST compliant invoice for logistics services"""
    __tablename__ = 'gst_invoice'
    
    id = db.Column(db.Integer, primary_key=True)
    invoice_number = db.Column(db.String(50), unique=True, nullable=False)
    shipment_id = db.Column(db.Integer, db.ForeignKey('shipment.id'), nullable=False)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    
    # Financials
    base_amount = db.Column(db.Float, nullable=False)
    cgst_rate = db.Column(db.Float, default=9.0)  # 9%
    sgst_rate = db.Column(db.Float, default=9.0)  # 9%
    igst_rate = db.Column(db.Float, default=0.0)  # 18% if interstate
    cgst_amount = db.Column(db.Float, default=0.0)
    sgst_amount = db.Column(db.Float, default=0.0)
    igst_amount = db.Column(db.Float, default=0.0)
    total_gst_amount = db.Column(db.Float, default=0.0)
    total_amount = db.Column(db.Float, nullable=False)
    
    # Compliance
    hsn_code = db.Column(db.String(20), default='9965')  # Goods transport services
    gstin_provider = db.Column(db.String(15))
    gstin_customer = db.Column(db.String(15))
    place_of_supply = db.Column(db.String(100))
    
    status = db.Column(db.String(20), default='draft')  # draft, issued, paid, cancelled
    date_issued = db.Column(db.DateTime, default=datetime.utcnow)
