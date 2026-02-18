"""
Unit tests for TruckOpti data models.
Tests TruckType, CartonType and their business logic methods.
"""

import pytest
from app import create_app, db
from app.models import TruckType, CartonType, PackingJob


@pytest.fixture(scope="module")
def app():
    """Create a fresh app for each test module."""
    test_app = create_app("testing")
    with test_app.app_context():
        db.create_all()
        yield test_app
        db.session.remove()
        db.drop_all()


@pytest.fixture(autouse=True)
def clean_db(app):
    """Roll back after every test so they stay independent."""
    with app.app_context():
        yield
        db.session.rollback()


# ---------------------------------------------------------------------------
# TruckType model tests
# ---------------------------------------------------------------------------

class TestTruckTypeModel:
    """Tests for the TruckType model."""

    def test_create_truck_type(self, app):
        with app.app_context():
            truck = TruckType(
                name="Tata 14 ft",
                length=430.0,
                width=200.0,
                height=190.0,
                max_weight=10000.0,
            )
            db.session.add(truck)
            db.session.commit()

            saved = TruckType.query.filter_by(name="Tata 14 ft").first()
            assert saved is not None
            assert saved.length == 430.0
            assert saved.width == 200.0
            assert saved.height == 190.0
            assert saved.max_weight == 10000.0

    def test_truck_type_defaults(self, app):
        with app.app_context():
            truck = TruckType(
                name="Default Truck",
                length=300.0,
                width=200.0,
                height=200.0,
            )
            db.session.add(truck)
            db.session.commit()

            saved = TruckType.query.filter_by(name="Default Truck").first()
            assert saved.cost_per_km == 0.0
            assert saved.fuel_efficiency == 0.0
            assert saved.driver_cost_per_day == 0.0
            assert saved.maintenance_cost_per_km == 0.0
            assert saved.truck_category == "Standard"
            assert saved.availability is True

    def test_truck_as_dict(self, app):
        with app.app_context():
            truck = TruckType(
                name="Dict Truck",
                length=500.0,
                width=220.0,
                height=220.0,
                max_weight=15000.0,
                truck_category="Heavy",
            )
            db.session.add(truck)
            db.session.commit()

            result = truck.as_dict()
            assert result["name"] == "Dict Truck"
            assert result["length"] == 500.0
            assert result["truck_category"] == "Heavy"

    def test_calculate_max_cartons(self, app):
        with app.app_context():
            truck = TruckType(
                name="Max Cartons Truck",
                length=600.0,
                width=230.0,
                height=230.0,
                max_weight=16000.0,
            )
            db.session.add(truck)
            db.session.commit()

            max_cartons = truck.calculate_max_cartons(avg_carton_weight=50)
            # Expected: int((16000 * 0.7) / 50) = int(224) = 224
            assert max_cartons == 224

    def test_calculate_max_cartons_no_weight(self, app):
        with app.app_context():
            truck = TruckType(
                name="No Weight Truck",
                length=400.0,
                width=200.0,
                height=200.0,
                max_weight=None,
            )
            db.session.add(truck)
            db.session.commit()

            assert truck.calculate_max_cartons() is None

    def test_get_performance_metrics(self, app):
        with app.app_context():
            truck = TruckType(
                name="Perf Truck",
                length=600.0,
                width=230.0,
                height=230.0,
                max_weight=16000.0,
                cost_per_km=15.0,
                fuel_efficiency=6.0,
                driver_cost_per_day=2000.0,
                maintenance_cost_per_km=2.0,
                truck_category="Heavy",
                availability=True,
            )
            db.session.add(truck)
            db.session.commit()

            metrics = truck.get_performance_metrics()
            assert "volume_m3" in metrics
            assert metrics["has_valid_dimensions"] is True
            assert metrics["category_details"]["category"] == "Heavy"
            assert metrics["cost_metrics"]["cost_per_km"] == 15.0

    def test_truck_availability_filter(self, app):
        with app.app_context():
            t1 = TruckType(name="Available Truck", length=300.0, width=200.0, height=200.0, availability=True)
            t2 = TruckType(name="Unavailable Truck", length=300.0, width=200.0, height=200.0, availability=False)
            db.session.add_all([t1, t2])
            db.session.commit()

            available = TruckType.query.filter_by(availability=True).all()
            names = [t.name for t in available]
            assert "Available Truck" in names
            assert "Unavailable Truck" not in names


# ---------------------------------------------------------------------------
# CartonType model tests
# ---------------------------------------------------------------------------

class TestCartonTypeModel:
    """Tests for the CartonType model."""

    def test_create_carton_type(self, app):
        with app.app_context():
            carton = CartonType(
                name="LED TV 32",
                length=80.0,
                width=15.0,
                height=55.0,
                weight=10.0,
            )
            db.session.add(carton)
            db.session.commit()

            saved = CartonType.query.filter_by(name="LED TV 32").first()
            assert saved is not None
            assert saved.length == 80.0
            assert saved.weight == 10.0

    def test_carton_type_defaults(self, app):
        with app.app_context():
            carton = CartonType(
                name="Default Carton",
                length=30.0,
                width=30.0,
                height=30.0,
                weight=5.0,
            )
            db.session.add(carton)
            db.session.commit()

            saved = CartonType.query.filter_by(name="Default Carton").first()
            assert saved.can_rotate is True
            assert saved.fragile is False
            assert saved.stackable is True
            assert saved.max_stack_height == 5
            assert saved.priority == 1

    def test_carton_as_dict(self, app):
        with app.app_context():
            carton = CartonType(
                name="Test Dict Carton",
                length=50.0,
                width=40.0,
                height=30.0,
                weight=8.0,
                fragile=True,
            )
            db.session.add(carton)
            db.session.commit()

            result = carton.as_dict()
            assert result["name"] == "Test Dict Carton"
            assert result["fragile"] is True
            assert result["length"] == 50.0

    def test_get_packaging_metrics(self, app):
        with app.app_context():
            carton = CartonType(
                name="Metrics Carton",
                length=50.0,
                width=40.0,
                height=30.0,
                weight=8.0,
                fragile=False,
                stackable=True,
                priority=3,
            )
            db.session.add(carton)
            db.session.commit()

            metrics = carton.get_packaging_metrics()
            assert "volume_m3" in metrics
            assert metrics["has_valid_dimensions"] is True
            assert metrics["handling_requirements"]["stackable"] is True
            assert metrics["handling_requirements"]["priority"] == 3
            # Volume = 50 * 40 * 30 / 1_000_000 = 0.06 m³
            assert abs(metrics["volume_m3"] - 0.06) < 0.001

    def test_carton_fragile_filter(self, app):
        with app.app_context():
            c1 = CartonType(name="Fragile Glass", length=30.0, width=20.0, height=20.0, weight=2.0, fragile=True)
            c2 = CartonType(name="Sturdy Box", length=30.0, width=20.0, height=20.0, weight=5.0, fragile=False)
            db.session.add_all([c1, c2])
            db.session.commit()

            fragile_items = CartonType.query.filter_by(fragile=True).all()
            names = [c.name for c in fragile_items]
            assert "Fragile Glass" in names
            assert "Sturdy Box" not in names

    def test_carton_density_calculation(self, app):
        """Test that packaging metrics computes density correctly."""
        with app.app_context():
            carton = CartonType(
                name="Density Test",
                length=100.0,
                width=100.0,
                height=100.0,
                weight=1.0,   # 1 kg
            )
            db.session.add(carton)
            db.session.commit()

            metrics = carton.get_packaging_metrics()
            # volume = 0.001 m³, density = 1000 / 0.001 = 1_000_000 kg/m³
            assert metrics["density_kg_m3"] is not None
            assert metrics["density_kg_m3"] > 0


# ---------------------------------------------------------------------------
# PackingJob model tests
# ---------------------------------------------------------------------------

class TestPackingJobModel:
    """Tests for the PackingJob model."""

    def test_create_packing_job(self, app):
        with app.app_context():
            job = PackingJob(name="Test Job", optimization_goal="space")
            db.session.add(job)
            db.session.commit()

            saved = PackingJob.query.filter_by(name="Test Job").first()
            assert saved is not None
            assert saved.optimization_goal == "space"
            assert saved.status == "pending"

    def test_packing_job_as_dict(self, app):
        with app.app_context():
            job = PackingJob(name="Dict Job", optimization_goal="cost")
            db.session.add(job)
            db.session.commit()

            result = job.as_dict()
            assert result["name"] == "Dict Job"
            assert result["optimization_goal"] == "cost"
