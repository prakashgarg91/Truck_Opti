"""
Shipment Repository Implementation
Specialized repository for shipment tracking and delivery management
"""

from typing import List, Dict, Any
from abc import abstractmethod
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, desc
from datetime import datetime, timedelta, date

from .base import BaseRepository, IRepository, RepositoryResult, QuerySpec
from ..models import Shipment, ShipmentItem, Customer, Route
from ..domain.entities import ShipmentEntity
from ..domain.value_objects import Money


class IShipmentRepository(IRepository[ShipmentEntity]):
    """Shipment repository interface with specialized tracking methods"""

    @abstractmethod
    def track_shipment(self, shipment_id: int) -> RepositoryResult[ShipmentEntity]:
        """Get complete shipment tracking information"""
        pass

    @abstractmethod
    def get_active_shipments(self) -> RepositoryResult[List[ShipmentEntity]]:
        """Get all active (not delivered) shipments"""
        pass

    @abstractmethod
    def get_shipments_by_status(self, status: str) -> RepositoryResult[List[ShipmentEntity]]:
        """Get shipments by status"""
        pass

    @abstractmethod
    def get_delivery_schedule(self, start_date: date, end_date: date) -> RepositoryResult[List[ShipmentEntity]]:
        """Get delivery schedule for date range"""
        pass

    @abstractmethod
    def update_shipment_status(self, shipment_id: int, new_status: str) -> RepositoryResult[ShipmentEntity]:
        """Update shipment status"""
        pass


class ShipmentRepository(BaseRepository[ShipmentEntity, Shipment], IShipmentRepository):
    """Concrete shipment repository implementation with comprehensive tracking"""

    def __init__(self, db: Session):
        super().__init__(db, Shipment, self._map_to_entity)

    def _map_to_entity(self, model: Shipment) -> ShipmentEntity:
        """Map SQLAlchemy model to domain entity"""
        try:
            # Calculate total items and volume
            total_items = 0
            total_volume = 0.0
            total_weight = 0.0

            items_list = []
            for item in model.shipment_items:
                total_items += item.quantity

                if item.carton_type:
                    carton_volume = (item.carton_type.length *
                                   item.carton_type.width *
                                   item.carton_type.height / 1000000)  # Convert to m³
                    total_volume += carton_volume * item.quantity

                    carton_weight = item.carton_type.weight or 0
                    total_weight += carton_weight * item.quantity

                    items_list.append({
                        'id': item.id,
                        'carton_type_id': item.carton_type_id,
                        'carton_name': item.carton_type.name,
                        'quantity': item.quantity,
                        'volume_per_unit': carton_volume,
                        'weight_per_unit': carton_weight
                    })

            return ShipmentEntity(
                id=model.id,
                shipment_number=model.shipment_number,
                customer_id=model.customer_id,
                route_id=model.route_id,
                priority=model.priority,
                delivery_date=model.delivery_date,
                status=model.status,
                total_value=Money(model.total_value or 0.0),
                special_instructions=model.special_instructions or "",
                date_created=model.date_created,
                # Calculated fields
                total_items=total_items,
                total_volume=total_volume,
                total_weight=total_weight,
                items=items_list
            )
        except Exception as e:
            self.logger.error(f"Error mapping shipment model to entity: {str(e)}")
            raise

    def track_shipment(self, shipment_id: int) -> RepositoryResult[ShipmentEntity]:
        """Get complete shipment tracking information with all details"""
        try:
            shipment = self.db.query(self.model_class).filter(
                self.model_class.id == shipment_id
            ).first()

            if not shipment:
                return RepositoryResult.error_result(f"Shipment {shipment_id} not found")

            entity = self._map_to_entity(shipment)

            # Enrich with additional tracking info
            tracking_info = {
                'shipment': entity,
                'customer_info': None,
                'route_info': None,
                'packing_jobs': []
            }

            # Add customer information
            if shipment.customer_id:
                customer = self.db.query(Customer).filter(
                    Customer.id == shipment.customer_id
                ).first()
                if customer:
                    tracking_info['customer_info'] = {
                        'id': customer.id,
                        'name': customer.name,
                        'address': customer.address,
                        'contact': customer.contact_person
                    }

            # Add route information
            if shipment.route_id:
                route = self.db.query(Route).filter(
                    Route.id == shipment.route_id
                ).first()
                if route:
                    tracking_info['route_info'] = {
                        'id': route.id,
                        'name': route.name,
                        'distance': route.distance_km,
                        'origin': route.origin,
                        'destination': route.destination
                    }

            # Add associated packing jobs
            from ..models import PackingJob
            packing_jobs = self.db.query(PackingJob).filter(
                PackingJob.shipment_id == shipment.id
            ).all()

            tracking_info['packing_jobs'] = [
                {
                    'id': job.id,
                    'name': job.name,
                    'status': job.status,
                    'date_created': job.date_created.isoformat() if job.date_created else None
                }
                for job in packing_jobs
            ]

            return RepositoryResult.success_result(tracking_info)

        except Exception as e:
            self.logger.error(f"Error tracking shipment: {str(e)}")
            return RepositoryResult.error_result(f"Error tracking shipment: {str(e)}")

    def get_active_shipments(self) -> RepositoryResult[List[ShipmentEntity]]:
        """Get all active (not delivered) shipments"""
        try:
            spec = QuerySpec()
            spec.add_filter("status", "neq", "delivered")
            spec.sort_field = "delivery_date"
            spec.sort_direction = "asc"

            result = self.get_all(spec)
            if result.success:
                return RepositoryResult.success_result(result.data.items)
            return result

        except Exception as e:
            self.logger.error(f"Error getting active shipments: {str(e)}")
            return RepositoryResult.error_result(f"Error getting active shipments: {str(e)}")

    def get_shipments_by_status(self, status: str) -> RepositoryResult[List[ShipmentEntity]]:
        """Get shipments by status (pending, packed, shipped, delivered)"""
        try:
            spec = QuerySpec()
            spec.add_filter("status", "eq", status)
            spec.sort_field = "date_created"
            spec.sort_direction = "desc"

            result = self.get_all(spec)
            if result.success:
                return RepositoryResult.success_result(result.data.items)
            return result

        except Exception as e:
            self.logger.error(f"Error getting shipments by status: {str(e)}")
            return RepositoryResult.error_result(f"Error getting shipments by status: {str(e)}")

    def get_delivery_schedule(self, start_date: date, end_date: date) -> RepositoryResult[List[ShipmentEntity]]:
        """Get delivery schedule for date range"""
        try:
            query = self.db.query(self.model_class).filter(
                and_(
                    self.model_class.delivery_date.isnot(None),
                    self.model_class.delivery_date >= start_date,
                    self.model_class.delivery_date <= end_date
                )
            ).order_by(self.model_class.delivery_date, self.model_class.priority.desc())

            models = query.all()
            entities = [self._map_to_entity(model) for model in models]

            return RepositoryResult.success_result(entities)

        except Exception as e:
            self.logger.error(f"Error getting delivery schedule: {str(e)}")
            return RepositoryResult.error_result(f"Error getting delivery schedule: {str(e)}")

    def update_shipment_status(self, shipment_id: int, new_status: str) -> RepositoryResult[ShipmentEntity]:
        """Update shipment status with validation"""
        try:
            valid_statuses = ['pending', 'packed', 'shipped', 'delivered', 'cancelled']
            if new_status not in valid_statuses:
                return RepositoryResult.error_result(
                    f"Invalid status: {new_status}. Must be one of {valid_statuses}"
                )

            return self.update(shipment_id, {'status': new_status})

        except Exception as e:
            self.logger.error(f"Error updating shipment status: {str(e)}")
            return RepositoryResult.error_result(f"Error updating shipment status: {str(e)}")

    def get_high_priority_shipments(self, min_priority: int = 4) -> RepositoryResult[List[ShipmentEntity]]:
        """Get high priority shipments"""
        try:
            spec = QuerySpec()
            spec.add_filter("priority", "gte", min_priority)
            spec.add_filter("status", "neq", "delivered")
            spec.sort_field = "priority"
            spec.sort_direction = "desc"

            result = self.get_all(spec)
            if result.success:
                return RepositoryResult.success_result(result.data.items)
            return result

        except Exception as e:
            self.logger.error(f"Error getting high priority shipments: {str(e)}")
            return RepositoryResult.error_result(f"Error getting high priority shipments: {str(e)}")

    def get_overdue_shipments(self) -> RepositoryResult[List[ShipmentEntity]]:
        """Get shipments that are overdue (past delivery date and not delivered)"""
        try:
            today = date.today()

            query = self.db.query(self.model_class).filter(
                and_(
                    self.model_class.delivery_date < today,
                    self.model_class.status.notin_(['delivered', 'cancelled'])
                )
            ).order_by(self.model_class.delivery_date)

            models = query.all()
            entities = [self._map_to_entity(model) for model in models]

            return RepositoryResult.success_result(entities)

        except Exception as e:
            self.logger.error(f"Error getting overdue shipments: {str(e)}")
            return RepositoryResult.error_result(f"Error getting overdue shipments: {str(e)}")

    def get_shipments_by_customer(self, customer_id: int) -> RepositoryResult[List[ShipmentEntity]]:
        """Get all shipments for a specific customer"""
        try:
            spec = QuerySpec()
            spec.add_filter("customer_id", "eq", customer_id)
            spec.sort_field = "date_created"
            spec.sort_direction = "desc"

            result = self.get_all(spec)
            if result.success:
                return RepositoryResult.success_result(result.data.items)
            return result

        except Exception as e:
            self.logger.error(f"Error getting customer shipments: {str(e)}")
            return RepositoryResult.error_result(f"Error getting customer shipments: {str(e)}")

    def get_shipment_statistics(self, start_date: date = None, end_date: date = None) -> RepositoryResult[Dict[str, Any]]:
        """Get comprehensive shipment statistics"""
        try:
            # Default to last 30 days
            if not start_date:
                start_date = date.today() - timedelta(days=30)
            if not end_date:
                end_date = date.today()

            # Base query with date filter
            base_query = self.db.query(self.model_class).filter(
                and_(
                    self.model_class.date_created >= datetime.combine(start_date, datetime.min.time()),
                    self.model_class.date_created <= datetime.combine(end_date, datetime.max.time())
                )
            )

            # Total shipments
            total_shipments = base_query.count()

            # Shipments by status
            status_counts = self.db.query(
                self.model_class.status,
                func.count(self.model_class.id).label('count')
            ).filter(
                and_(
                    self.model_class.date_created >= datetime.combine(start_date, datetime.min.time()),
                    self.model_class.date_created <= datetime.combine(end_date, datetime.max.time())
                )
            ).group_by(self.model_class.status).all()

            # Shipments by priority
            priority_counts = self.db.query(
                self.model_class.priority,
                func.count(self.model_class.id).label('count')
            ).filter(
                and_(
                    self.model_class.date_created >= datetime.combine(start_date, datetime.min.time()),
                    self.model_class.date_created <= datetime.combine(end_date, datetime.max.time())
                )
            ).group_by(self.model_class.priority).all()

            # Total value
            total_value = self.db.query(
                func.sum(self.model_class.total_value)
            ).filter(
                and_(
                    self.model_class.date_created >= datetime.combine(start_date, datetime.min.time()),
                    self.model_class.date_created <= datetime.combine(end_date, datetime.max.time())
                )
            ).scalar() or 0.0

            # On-time delivery rate
            delivered_shipments = self.db.query(self.model_class).filter(
                and_(
                    self.model_class.date_created >= datetime.combine(start_date, datetime.min.time()),
                    self.model_class.date_created <= datetime.combine(end_date, datetime.max.time()),
                    self.model_class.status == 'delivered'
                )
            ).count()

            overdue_count = self.db.query(self.model_class).filter(
                and_(
                    self.model_class.date_created >= datetime.combine(start_date, datetime.min.time()),
                    self.model_class.date_created <= datetime.combine(end_date, datetime.max.time()),
                    self.model_class.delivery_date < date.today(),
                    self.model_class.status.notin_(['delivered', 'cancelled'])
                )
            ).count()

            statistics = {
                'period': {
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat(),
                    'days': (end_date - start_date).days + 1
                },
                'total_shipments': total_shipments,
                'status_distribution': [
                    {'status': s.status, 'count': s.count}
                    for s in status_counts
                ],
                'priority_distribution': [
                    {'priority': p.priority, 'count': p.count}
                    for p in priority_counts
                ],
                'total_value': round(total_value, 2),
                'delivered_count': delivered_shipments,
                'overdue_count': overdue_count,
                'on_time_rate': round((delivered_shipments / total_shipments * 100), 2) if total_shipments > 0 else 0,
                'avg_value_per_shipment': round(total_value / total_shipments, 2) if total_shipments > 0 else 0
            }

            return RepositoryResult.success_result(statistics)

        except Exception as e:
            self.logger.error(f"Error getting shipment statistics: {str(e)}")
            return RepositoryResult.error_result(f"Error getting shipment statistics: {str(e)}")

    def add_items_to_shipment(self, shipment_id: int, items: List[Dict[str, Any]]) -> RepositoryResult[ShipmentEntity]:
        """
        Add multiple items to an existing shipment

        Args:
            shipment_id: ID of the shipment
            items: List of dicts with 'carton_type_id' and 'quantity'
        """
        try:
            shipment = self.db.query(self.model_class).filter(
                self.model_class.id == shipment_id
            ).first()

            if not shipment:
                return RepositoryResult.error_result(f"Shipment {shipment_id} not found")

            # Add each item
            for item_data in items:
                shipment_item = ShipmentItem(
                    shipment_id=shipment_id,
                    carton_type_id=item_data['carton_type_id'],
                    quantity=item_data['quantity']
                )
                self.db.add(shipment_item)

            self.db.commit()
            self.db.refresh(shipment)

            entity = self._map_to_entity(shipment)
            return RepositoryResult.success_result(entity)

        except Exception as e:
            self.db.rollback()
            self.logger.error(f"Error adding items to shipment: {str(e)}")
            return RepositoryResult.error_result(f"Error adding items to shipment: {str(e)}")

    def get_shipments_needing_packing(self) -> RepositoryResult[List[ShipmentEntity]]:
        """Get shipments that need packing (pending status)"""
        try:
            return self.get_shipments_by_status('pending')

        except Exception as e:
            self.logger.error(f"Error getting shipments needing packing: {str(e)}")
            return RepositoryResult.error_result(f"Error getting shipments needing packing: {str(e)}")

    def search_shipments(self, search_term: str) -> RepositoryResult[List[ShipmentEntity]]:
        """Search shipments by shipment number or special instructions"""
        try:
            query = self.db.query(self.model_class).filter(
                or_(
                    self.model_class.shipment_number.ilike(f'%{search_term}%'),
                    self.model_class.special_instructions.ilike(f'%{search_term}%')
                )
            ).order_by(desc(self.model_class.date_created))

            models = query.all()
            entities = [self._map_to_entity(model) for model in models]

            return RepositoryResult.success_result(entities)

        except Exception as e:
            self.logger.error(f"Error searching shipments: {str(e)}")
            return RepositoryResult.error_result(f"Error searching shipments: {str(e)}")

    def cancel_shipment(self, shipment_id: int, reason: str = None) -> RepositoryResult[ShipmentEntity]:
        """Cancel a shipment with optional reason"""
        try:
            update_data = {'status': 'cancelled'}
            if reason:
                update_data['special_instructions'] = f"CANCELLED: {reason}"

            return self.update(shipment_id, update_data)

        except Exception as e:
            self.logger.error(f"Error cancelling shipment: {str(e)}")
            return RepositoryResult.error_result(f"Error cancelling shipment: {str(e)}")
