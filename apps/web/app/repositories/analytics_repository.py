"""
Analytics Repository Implementation
Specialized repository for tracking and analyzing system performance metrics
"""

from typing import List, Dict, Any
from abc import abstractmethod
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, desc
from datetime import datetime, timedelta, date

from .base import BaseRepository, IRepository, RepositoryResult
from ..models import Analytics, PackingJob, TruckType


class IAnalyticsRepository(IRepository):
    """Analytics repository interface with specialized tracking methods"""

    @abstractmethod
    def track_packing_event(self, event_data: Dict[str, Any]) -> RepositoryResult[Analytics]:
        """Track a packing optimization event"""
        pass

    @abstractmethod
    def get_performance_metrics(self, start_date: date = None, end_date: date = None) -> RepositoryResult[Dict[str, Any]]:
        """Get comprehensive performance metrics for a period"""
        pass

    @abstractmethod
    def get_trends(self, metric: str, days: int = 30) -> RepositoryResult[List[Dict[str, Any]]]:
        """Get trend data for a specific metric"""
        pass

    @abstractmethod
    def get_daily_summary(self, target_date: date) -> RepositoryResult[Analytics]:
        """Get or create daily analytics summary"""
        pass


class AnalyticsRepository(BaseRepository, IAnalyticsRepository):
    """Concrete analytics repository implementation with comprehensive tracking"""

    def __init__(self, db: Session):
        super().__init__(db, Analytics, self._map_to_entity)

    def _map_to_entity(self, model: Analytics):
        """Map SQLAlchemy model to analytics entity"""
        # For now, return the model directly as analytics is primarily for data aggregation
        # In a full domain model, this would map to an AnalyticsEntity
        return {
            'id': model.id,
            'date': model.date.isoformat() if model.date else None,
            'total_shipments': model.total_shipments,
            'total_trucks_used': model.total_trucks_used,
            'average_space_utilization': model.average_space_utilization,
            'total_cost': model.total_cost,
            'total_distance': model.total_distance,
            'total_co2_emissions': model.total_co2_emissions
        }

    def track_packing_event(self, event_data: Dict[str, Any]) -> RepositoryResult[Analytics]:
        """
        Track a packing optimization event and update daily analytics

        Args:
            event_data: Dictionary containing:
                - trucks_used: Number of trucks used
                - space_utilization: Space utilization percentage
                - total_cost: Total cost of operation
                - distance: Distance traveled
                - co2_emissions: CO2 emissions
        """
        try:
            today = date.today()

            # Get or create today's analytics record
            analytics = self.db.query(Analytics).filter(
                Analytics.date == today
            ).first()

            if not analytics:
                analytics = Analytics(
                    date=today,
                    total_shipments=0,
                    total_trucks_used=0,
                    average_space_utilization=0.0,
                    total_cost=0.0,
                    total_distance=0.0,
                    total_co2_emissions=0.0
                )
                self.db.add(analytics)

            # Update analytics with new event data
            analytics.total_shipments += 1
            analytics.total_trucks_used += event_data.get('trucks_used', 0)
            analytics.total_cost += event_data.get('total_cost', 0.0)
            analytics.total_distance += event_data.get('distance', 0.0)
            analytics.total_co2_emissions += event_data.get('co2_emissions', 0.0)

            # Calculate running average for space utilization
            current_avg = analytics.average_space_utilization
            new_utilization = event_data.get('space_utilization', 0.0)
            shipment_count = analytics.total_shipments

            analytics.average_space_utilization = (
                (current_avg * (shipment_count - 1) + new_utilization) / shipment_count
            )

            self.db.commit()
            self.db.refresh(analytics)

            self.logger.info(f"Tracked packing event for {today}")
            return RepositoryResult.success_result(self._map_to_entity(analytics))

        except Exception as e:
            self.db.rollback()
            self.logger.error(f"Error tracking packing event: {str(e)}")
            return RepositoryResult.error_result(f"Error tracking packing event: {str(e)}")

    def get_performance_metrics(self, start_date: date = None, end_date: date = None) -> RepositoryResult[Dict[str, Any]]:
        """Get comprehensive performance metrics for a specified period"""
        try:
            # Default to last 30 days if not specified
            if not start_date:
                start_date = date.today() - timedelta(days=30)
            if not end_date:
                end_date = date.today()

            # Query analytics for the period
            analytics_data = self.db.query(Analytics).filter(
                and_(
                    Analytics.date >= start_date,
                    Analytics.date <= end_date
                )
            ).all()

            if not analytics_data:
                return RepositoryResult.success_result({
                    'period': {
                        'start_date': start_date.isoformat(),
                        'end_date': end_date.isoformat(),
                        'days': (end_date - start_date).days
                    },
                    'metrics': {
                        'total_shipments': 0,
                        'total_trucks_used': 0,
                        'average_space_utilization': 0.0,
                        'total_cost': 0.0,
                        'total_distance': 0.0,
                        'total_co2_emissions': 0.0,
                        'avg_trucks_per_shipment': 0.0,
                        'cost_per_shipment': 0.0,
                        'cost_per_km': 0.0
                    }
                })

            # Aggregate metrics
            total_shipments = sum(a.total_shipments for a in analytics_data)
            total_trucks = sum(a.total_trucks_used for a in analytics_data)
            total_cost = sum(a.total_cost for a in analytics_data)
            total_distance = sum(a.total_distance for a in analytics_data)
            total_co2 = sum(a.total_co2_emissions for a in analytics_data)

            # Calculate weighted average for space utilization
            weighted_space_util = sum(
                a.average_space_utilization * a.total_shipments
                for a in analytics_data
            ) / total_shipments if total_shipments > 0 else 0

            metrics = {
                'period': {
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat(),
                    'days': (end_date - start_date).days + 1
                },
                'metrics': {
                    'total_shipments': total_shipments,
                    'total_trucks_used': total_trucks,
                    'average_space_utilization': round(weighted_space_util, 2),
                    'total_cost': round(total_cost, 2),
                    'total_distance': round(total_distance, 2),
                    'total_co2_emissions': round(total_co2, 2),
                    'avg_trucks_per_shipment': round(total_trucks / total_shipments, 2) if total_shipments > 0 else 0,
                    'cost_per_shipment': round(total_cost / total_shipments, 2) if total_shipments > 0 else 0,
                    'cost_per_km': round(total_cost / total_distance, 2) if total_distance > 0 else 0,
                    'co2_per_km': round(total_co2 / total_distance, 2) if total_distance > 0 else 0
                },
                'daily_breakdown': [
                    {
                        'date': a.date.isoformat(),
                        'shipments': a.total_shipments,
                        'trucks': a.total_trucks_used,
                        'utilization': a.average_space_utilization,
                        'cost': a.total_cost
                    }
                    for a in sorted(analytics_data, key=lambda x: x.date)
                ]
            }

            return RepositoryResult.success_result(metrics)

        except Exception as e:
            self.logger.error(f"Error getting performance metrics: {str(e)}")
            return RepositoryResult.error_result(f"Error getting performance metrics: {str(e)}")

    def get_trends(self, metric: str, days: int = 30) -> RepositoryResult[List[Dict[str, Any]]]:
        """
        Get trend data for a specific metric over time

        Args:
            metric: One of 'shipments', 'utilization', 'cost', 'distance', 'co2'
            days: Number of days to look back
        """
        try:
            end_date = date.today()
            start_date = end_date - timedelta(days=days)

            analytics_data = self.db.query(Analytics).filter(
                and_(
                    Analytics.date >= start_date,
                    Analytics.date <= end_date
                )
            ).order_by(Analytics.date).all()

            # Map metric name to database column
            metric_map = {
                'shipments': lambda a: a.total_shipments,
                'utilization': lambda a: a.average_space_utilization,
                'cost': lambda a: a.total_cost,
                'distance': lambda a: a.total_distance,
                'co2': lambda a: a.total_co2_emissions,
                'trucks': lambda a: a.total_trucks_used
            }

            if metric not in metric_map:
                return RepositoryResult.error_result(f"Invalid metric: {metric}")

            getter = metric_map[metric]
            trend_data = [
                {
                    'date': a.date.isoformat(),
                    'value': getter(a)
                }
                for a in analytics_data
            ]

            # Calculate trend statistics
            values = [d['value'] for d in trend_data]
            if values:
                avg_value = sum(values) / len(values)
                max_value = max(values)
                min_value = min(values)

                # Simple trend direction (compare first and last)
                if len(values) > 1:
                    trend_direction = 'up' if values[-1] > values[0] else 'down' if values[-1] < values[0] else 'stable'
                else:
                    trend_direction = 'stable'
            else:
                avg_value = 0
                max_value = 0
                min_value = 0
                trend_direction = 'no_data'

            result = {
                'metric': metric,
                'period_days': days,
                'data': trend_data,
                'statistics': {
                    'average': round(avg_value, 2),
                    'maximum': round(max_value, 2),
                    'minimum': round(min_value, 2),
                    'trend_direction': trend_direction
                }
            }

            return RepositoryResult.success_result(result)

        except Exception as e:
            self.logger.error(f"Error getting trends for {metric}: {str(e)}")
            return RepositoryResult.error_result(f"Error getting trends: {str(e)}")

    def get_daily_summary(self, target_date: date) -> RepositoryResult[Analytics]:
        """Get or create daily analytics summary for a specific date"""
        try:
            analytics = self.db.query(Analytics).filter(
                Analytics.date == target_date
            ).first()

            if not analytics:
                analytics = Analytics(
                    date=target_date,
                    total_shipments=0,
                    total_trucks_used=0,
                    average_space_utilization=0.0,
                    total_cost=0.0,
                    total_distance=0.0,
                    total_co2_emissions=0.0
                )
                self.db.add(analytics)
                self.db.commit()
                self.db.refresh(analytics)

            return RepositoryResult.success_result(self._map_to_entity(analytics))

        except Exception as e:
            self.db.rollback()
            self.logger.error(f"Error getting daily summary: {str(e)}")
            return RepositoryResult.error_result(f"Error getting daily summary: {str(e)}")

    def get_real_time_dashboard_data(self) -> RepositoryResult[Dict[str, Any]]:
        """Get real-time dashboard data with current statistics"""
        try:
            today = date.today()
            week_ago = today - timedelta(days=7)
            month_ago = today - timedelta(days=30)

            # Today's metrics
            today_analytics = self.db.query(Analytics).filter(
                Analytics.date == today
            ).first()

            # Week metrics
            week_result = self.get_performance_metrics(week_ago, today)
            week_metrics = week_result.data.get('metrics', {}) if week_result.success else {}

            # Month metrics
            month_result = self.get_performance_metrics(month_ago, today)
            month_metrics = month_result.data.get('metrics', {}) if month_result.success else {}

            # Recent packing jobs
            recent_jobs = self.db.query(PackingJob).order_by(
                desc(PackingJob.date_created)
            ).limit(5).all()

            # Truck utilization stats
            truck_stats = self.db.query(
                TruckType.name,
                func.count(PackingJob.id).label('usage_count')
            ).join(
                PackingJob, TruckType.id == PackingJob.truck_type_id
            ).group_by(TruckType.name).all()

            dashboard = {
                'today': {
                    'shipments': today_analytics.total_shipments if today_analytics else 0,
                    'trucks_used': today_analytics.total_trucks_used if today_analytics else 0,
                    'avg_utilization': today_analytics.average_space_utilization if today_analytics else 0,
                    'total_cost': today_analytics.total_cost if today_analytics else 0
                },
                'week_summary': week_metrics,
                'month_summary': month_metrics,
                'recent_jobs': [
                    {
                        'id': job.id,
                        'name': job.name,
                        'status': job.status,
                        'date_created': job.date_created.isoformat() if job.date_created else None
                    }
                    for job in recent_jobs
                ],
                'truck_utilization': [
                    {'truck_name': t.name, 'usage_count': t.usage_count}
                    for t in truck_stats
                ],
                'timestamp': datetime.utcnow().isoformat()
            }

            return RepositoryResult.success_result(dashboard)

        except Exception as e:
            self.logger.error(f"Error getting dashboard data: {str(e)}")
            return RepositoryResult.error_result(f"Error getting dashboard data: {str(e)}")

    def compare_periods(self, period1_start: date, period1_end: date,
                       period2_start: date, period2_end: date) -> RepositoryResult[Dict[str, Any]]:
        """Compare metrics between two time periods"""
        try:
            period1_result = self.get_performance_metrics(period1_start, period1_end)
            period2_result = self.get_performance_metrics(period2_start, period2_end)

            if not (period1_result.success and period2_result.success):
                return RepositoryResult.error_result("Failed to get metrics for comparison")

            p1_metrics = period1_result.data['metrics']
            p2_metrics = period2_result.data['metrics']

            # Calculate changes
            comparison = {
                'period1': {
                    'start': period1_start.isoformat(),
                    'end': period1_end.isoformat(),
                    'metrics': p1_metrics
                },
                'period2': {
                    'start': period2_start.isoformat(),
                    'end': period2_end.isoformat(),
                    'metrics': p2_metrics
                },
                'changes': {}
            }

            # Calculate percentage changes for numeric metrics
            for key in ['total_shipments', 'total_trucks_used', 'average_space_utilization',
                       'total_cost', 'total_distance', 'total_co2_emissions']:
                p1_val = p1_metrics.get(key, 0)
                p2_val = p2_metrics.get(key, 0)

                if p1_val > 0:
                    change_pct = ((p2_val - p1_val) / p1_val) * 100
                    comparison['changes'][key] = {
                        'absolute': round(p2_val - p1_val, 2),
                        'percentage': round(change_pct, 2),
                        'direction': 'up' if change_pct > 0 else 'down' if change_pct < 0 else 'stable'
                    }
                else:
                    comparison['changes'][key] = {
                        'absolute': p2_val,
                        'percentage': 0,
                        'direction': 'no_data_period1'
                    }

            return RepositoryResult.success_result(comparison)

        except Exception as e:
            self.logger.error(f"Error comparing periods: {str(e)}")
            return RepositoryResult.error_result(f"Error comparing periods: {str(e)}")

    def cleanup_old_analytics(self, days_to_keep: int = 365) -> RepositoryResult[int]:
        """Remove analytics data older than specified days"""
        try:
            cutoff_date = date.today() - timedelta(days=days_to_keep)

            deleted_count = self.db.query(Analytics).filter(
                Analytics.date < cutoff_date
            ).delete(synchronize_session=False)

            self.db.commit()

            self.logger.info(f"Cleaned up {deleted_count} old analytics records")
            return RepositoryResult.success_result(deleted_count)

        except Exception as e:
            self.db.rollback()
            self.logger.error(f"Error cleaning up analytics: {str(e)}")
            return RepositoryResult.error_result(f"Error cleaning up analytics: {str(e)}")
