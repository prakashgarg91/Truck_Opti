from . import db
from datetime import datetime

class TruckType(db.Model):
    def as_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}
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
    
    # Indexes for performance optimization
    __table_args__ = (
        db.Index('idx_truck_volume', length, width, height),  # For volume-based sorting
        db.Index('idx_truck_availability_category', availability, truck_category),
    )

class CartonType(db.Model):
    def as_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}
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
    
    # Indexes for carton type searches
    __table_args__ = (
        db.Index('idx_carton_name', name),  # For name-based searches
        db.Index('idx_carton_dimensions', length, width, height),  # For dimension-based searches
    )

class Customer(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120))
    phone = db.Column(db.String(20))
    address = db.Column(db.Text)
    city = db.Column(db.String(50))
    postal_code = db.Column(db.String(10))
    country = db.Column(db.String(50))
    
    # Relationships
    shipments = db.relationship('Shipment', backref='customer', lazy=True)

class Route(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    origin = db.Column(db.String(100), nullable=False)
    destination = db.Column(db.String(100), nullable=False)
    distance_km = db.Column(db.Float, nullable=False)
    estimated_time_hours = db.Column(db.Float)
    toll_cost = db.Column(db.Float, default=0.0)
    fuel_cost = db.Column(db.Float, default=0.0)
    
    # Relationships
    shipments = db.relationship('Shipment', backref='route', lazy=True)

class Shipment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    shipment_number = db.Column(db.String(50), unique=True, nullable=False)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'))
    route_id = db.Column(db.Integer, db.ForeignKey('route.id'))
    priority = db.Column(db.Integer, default=1)  # 1-5
    delivery_date = db.Column(db.Date)
    status = db.Column(db.String(20), default='pending')  # pending, packed, shipped, delivered
    total_value = db.Column(db.Float, default=0.0)
    special_instructions = db.Column(db.Text)
    date_created = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    shipment_items = db.relationship('ShipmentItem', backref='shipment', lazy=True, cascade='all, delete-orphan')

class ShipmentItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    shipment_id = db.Column(db.Integer, db.ForeignKey('shipment.id'))
    carton_type_id = db.Column(db.Integer, db.ForeignKey('carton_type.id'))
    quantity = db.Column(db.Integer, nullable=False)
    
    # Relationships
    carton_type = db.relationship('CartonType', backref='shipment_items')

class PackingJob(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    date_created = db.Column(db.DateTime, default=datetime.utcnow)
    truck_type_id = db.Column(db.Integer, db.ForeignKey('truck_type.id'))
    shipment_id = db.Column(db.Integer, db.ForeignKey('shipment.id'), nullable=True)
    status = db.Column(db.String(20), default='pending')
    optimization_goal = db.Column(db.String(20), default='space')  # space, cost, time
    
    # Relationships
    shipment = db.relationship('Shipment', backref='packing_jobs')
    packing_results = db.relationship('PackingResult', backref='packing_job', lazy=True)

class PackingResult(db.Model):
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

class Analytics(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, default=datetime.utcnow().date())
    total_shipments = db.Column(db.Integer, default=0)
    total_trucks_used = db.Column(db.Integer, default=0)
    average_space_utilization = db.Column(db.Float, default=0.0)
    total_cost = db.Column(db.Float, default=0.0)
    total_distance = db.Column(db.Float, default=0.0)
    total_co2_emissions = db.Column(db.Float, default=0.0)

class SaleOrder(db.Model):
    """Sale Order model for Excel/CSV upload processing"""
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
    
    # Indexes for sale order queries
    __table_args__ = (
        db.Index('idx_sale_order_batch', batch_id),  # For batch filtering
        db.Index('idx_sale_order_status', status),  # For status filtering
        db.Index('idx_sale_order_date', date_created),  # For date sorting
        db.Index('idx_sale_order_number', sale_order_number),  # For order number searches
    )

class SaleOrderItem(db.Model):
    """Individual items within a sale order"""
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

class SaleOrderBatch(db.Model):
    """Batch processing for multiple sale orders from Excel/CSV"""
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

class TruckRecommendation(db.Model):
    """Store truck recommendations for sale orders with detailed analysis"""
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
    sale_order = db.relationship('SaleOrder', backref='truck_recommendations')
    truck_type = db.relationship('TruckType', backref='recommendations')

class UserSettings(db.Model):
    """Store user configuration and preferences for logistics operations"""
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