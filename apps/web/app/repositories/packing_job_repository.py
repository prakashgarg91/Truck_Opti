"""
Packing Job Repository Implementation
Specialized repository for packing job operations with comprehensive tracking
"""

from typing import List, Dict, Any
from abc import abstractmethod
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, desc
from datetime import datetime, timedelta

from .base import BaseRepository, IRepository, RepositoryResult, QuerySpec
from ..models import PackingJob, PackingResult
from ..domain.entities import PackingJobEntity
from ..domain.value_objects import Money


class IPackingJobRepository(IRepository[PackingJobEntity]):
    """Packing job repository interface with specialized operations"""

    @abstractmethod
    def get_by_status(self, status: str) -> RepositoryResult[List[PackingJobEntity]]:
        """Get packing jobs by status"""
        pass

    @abstractmethod
    def get_recent_jobs(self, days: int = 7) -> RepositoryResult[List[PackingJobEntity]]:
        """Get recent packing jobs within specified days"""
        pass

    @abstractmethod
    def get_job_statistics(self, start_date: datetime = None, end_date: datetime = None) -> RepositoryResult[Dict[str, Any]]:
        """Get comprehensive job statistics"""
        pass

    @abstractmethod
    def get_jobs_by_truck_type(self, truck_type_id: int) -> RepositoryResult[List[PackingJobEntity]]:
        """Get all jobs for a specific truck type"""
        pass

    @abstractmethod
    def get_jobs_by_optimization_goal(self, goal: str) -> RepositoryResult[List[PackingJobEntity]]:
        """Get jobs filtered by optimization goal"""
        pass


class PackingJobRepository(BaseRepository[PackingJobEntity, PackingJob], IPackingJobRepository):
    """Concrete packing job repository implementation with full functionality"""

    def __init__(self, db: Session):
        super().__init__(db, PackingJob, self._map_to_entity)

    def _map_to_entity(self, model: PackingJob) -> PackingJobEntity:
        """Map SQLAlchemy model to domain entity"""
        try:
            # Get latest packing result for this job
            latest_result = None
            if model.packing_results:
                latest_result = max(model.packing_results, key=lambda r: r.date_calculated)

            return PackingJobEntity(
                id=model.id,
                name=model.name,
                date_created=model.date_created,
                truck_type_id=model.truck_type_id,
                shipment_id=model.shipment_id,
                status=model.status,
                optimization_goal=model.optimization_goal,
                # Include result data if available
                space_utilization=latest_result.space_utilization if latest_result else 0.0,
                weight_utilization=latest_result.weight_utilization if latest_result else 0.0,
                total_cost=Money(latest_result.total_cost) if latest_result and latest_result.total_cost else Money(0.0),
                optimization_score=latest_result.optimization_score if latest_result else 0.0
            )
        except Exception as e:
            self.logger.error(f"Error mapping packing job model to entity: {str(e)}")
            raise

    def get_by_status(self, status: str) -> RepositoryResult[List[PackingJobEntity]]:
        """Get packing jobs by status (pending, processing, completed, failed)"""
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
            self.logger.error(f"Error getting jobs by status: {str(e)}")
            return RepositoryResult.error_result(f"Error getting jobs by status: {str(e)}")

    def get_recent_jobs(self, days: int = 7) -> RepositoryResult[List[PackingJobEntity]]:
        """Get recent packing jobs within specified days"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days)

            query = self.db.query(self.model_class).filter(
                self.model_class.date_created >= cutoff_date
            ).order_by(desc(self.model_class.date_created))

            models = query.all()
            entities = [self._map_to_entity(model) for model in models]

            return RepositoryResult.success_result(entities)

        except Exception as e:
            self.logger.error(f"Error getting recent jobs: {str(e)}")
            return RepositoryResult.error_result(f"Error getting recent jobs: {str(e)}")

    def get_job_statistics(self, start_date: datetime = None, end_date: datetime = None) -> RepositoryResult[Dict[str, Any]]:
        """Get comprehensive job statistics for the specified period"""
        try:
            # Default to last 30 days if not specified
            if not start_date:
                start_date = datetime.utcnow() - timedelta(days=30)
            if not end_date:
                end_date = datetime.utcnow()

            # Build query with date filter
            base_query = self.db.query(self.model_class).filter(
                and_(
                    self.model_class.date_created >= start_date,
                    self.model_class.date_created <= end_date
                )
            )

            # Total jobs count
            total_jobs = base_query.count()

            # Jobs by status
            status_distribution = self.db.query(
                self.model_class.status,
                func.count(self.model_class.id).label('count')
            ).filter(
                and_(
                    self.model_class.date_created >= start_date,
                    self.model_class.date_created <= end_date
                )
            ).group_by(self.model_class.status).all()

            # Jobs by optimization goal
            goal_distribution = self.db.query(
                self.model_class.optimization_goal,
                func.count(self.model_class.id).label('count')
            ).filter(
                and_(
                    self.model_class.date_created >= start_date,
                    self.model_class.date_created <= end_date
                )
            ).group_by(self.model_class.optimization_goal).all()

            # Get packing results statistics
            results_stats = self.db.query(
                func.avg(PackingResult.space_utilization).label('avg_space_util'),
                func.avg(PackingResult.weight_utilization).label('avg_weight_util'),
                func.sum(PackingResult.total_cost).label('total_cost'),
                func.sum(PackingResult.truck_count).label('total_trucks'),
                func.avg(PackingResult.optimization_score).label('avg_score')
            ).join(
                PackingJob, PackingResult.job_id == PackingJob.id
            ).filter(
                and_(
                    PackingJob.date_created >= start_date,
                    PackingJob.date_created <= end_date
                )
            ).first()

            # Jobs per day trend
            daily_jobs = self.db.query(
                func.date(self.model_class.date_created).label('date'),
                func.count(self.model_class.id).label('count')
            ).filter(
                and_(
                    self.model_class.date_created >= start_date,
                    self.model_class.date_created <= end_date
                )
            ).group_by(func.date(self.model_class.date_created)).all()

            statistics = {
                'period': {
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat(),
                    'days': (end_date - start_date).days
                },
                'total_jobs': total_jobs,
                'status_distribution': [
                    {'status': s.status, 'count': s.count}
                    for s in status_distribution
                ],
                'goal_distribution': [
                    {'goal': g.optimization_goal, 'count': g.count}
                    for g in goal_distribution
                ],
                'performance_metrics': {
                    'avg_space_utilization': float(results_stats.avg_space_util or 0),
                    'avg_weight_utilization': float(results_stats.avg_weight_util or 0),
                    'total_cost': float(results_stats.total_cost or 0),
                    'total_trucks_used': int(results_stats.total_trucks or 0),
                    'avg_optimization_score': float(results_stats.avg_score or 0)
                },
                'daily_trend': [
                    {'date': str(d.date), 'count': d.count}
                    for d in daily_jobs
                ],
                'jobs_per_day_avg': total_jobs / max((end_date - start_date).days, 1)
            }

            return RepositoryResult.success_result(statistics)

        except Exception as e:
            self.logger.error(f"Error getting job statistics: {str(e)}")
            return RepositoryResult.error_result(f"Error getting job statistics: {str(e)}")

    def get_jobs_by_truck_type(self, truck_type_id: int) -> RepositoryResult[List[PackingJobEntity]]:
        """Get all jobs for a specific truck type"""
        try:
            spec = QuerySpec()
            spec.add_filter("truck_type_id", "eq", truck_type_id)
            spec.sort_field = "date_created"
            spec.sort_direction = "desc"

            result = self.get_all(spec)
            if result.success:
                return RepositoryResult.success_result(result.data.items)
            return result

        except Exception as e:
            self.logger.error(f"Error getting jobs by truck type: {str(e)}")
            return RepositoryResult.error_result(f"Error getting jobs by truck type: {str(e)}")

    def get_jobs_by_optimization_goal(self, goal: str) -> RepositoryResult[List[PackingJobEntity]]:
        """Get jobs filtered by optimization goal (space, cost, time)"""
        try:
            spec = QuerySpec()
            spec.add_filter("optimization_goal", "eq", goal)
            spec.sort_field = "date_created"
            spec.sort_direction = "desc"

            result = self.get_all(spec)
            if result.success:
                return RepositoryResult.success_result(result.data.items)
            return result

        except Exception as e:
            self.logger.error(f"Error getting jobs by optimization goal: {str(e)}")
            return RepositoryResult.error_result(f"Error getting jobs by optimization goal: {str(e)}")

    def update_job_status(self, job_id: int, status: str, notes: str = None) -> RepositoryResult[PackingJobEntity]:
        """Update job status with optional notes"""
        try:
            update_data = {'status': status}
            if notes:
                # Note: You may need to add a notes field to the model
                update_data['processing_notes'] = notes

            return self.update(job_id, update_data)

        except Exception as e:
            self.logger.error(f"Error updating job status: {str(e)}")
            return RepositoryResult.error_result(f"Error updating job status: {str(e)}")

    def get_completed_jobs_with_results(self, limit: int = 10) -> RepositoryResult[List[Dict[str, Any]]]:
        """Get recent completed jobs with their packing results"""
        try:
            jobs = self.db.query(self.model_class).filter(
                self.model_class.status == 'completed'
            ).order_by(desc(self.model_class.date_created)).limit(limit).all()

            jobs_with_results = []
            for job in jobs:
                job_data = {
                    'job': self._map_to_entity(job),
                    'results': []
                }

                for result in job.packing_results:
                    job_data['results'].append({
                        'id': result.id,
                        'truck_count': result.truck_count,
                        'space_utilization': result.space_utilization,
                        'weight_utilization': result.weight_utilization,
                        'total_cost': result.total_cost,
                        'optimization_score': result.optimization_score,
                        'date_calculated': result.date_calculated.isoformat() if result.date_calculated else None
                    })

                jobs_with_results.append(job_data)

            return RepositoryResult.success_result(jobs_with_results)

        except Exception as e:
            self.logger.error(f"Error getting completed jobs with results: {str(e)}")
            return RepositoryResult.error_result(f"Error getting completed jobs with results: {str(e)}")

    def get_performance_comparison(self, job_ids: List[int]) -> RepositoryResult[Dict[str, Any]]:
        """Compare performance metrics across multiple jobs"""
        try:
            if not job_ids:
                return RepositoryResult.error_result("No job IDs provided for comparison")

            jobs = self.db.query(self.model_class).filter(
                self.model_class.id.in_(job_ids)
            ).all()

            comparison = {
                'jobs': [],
                'best_space_utilization': None,
                'best_cost_efficiency': None,
                'best_optimization_score': None
            }

            best_space = 0
            best_cost = float('inf')
            best_score = 0

            for job in jobs:
                latest_result = None
                if job.packing_results:
                    latest_result = max(job.packing_results, key=lambda r: r.date_calculated)

                if latest_result:
                    job_info = {
                        'id': job.id,
                        'name': job.name,
                        'space_utilization': latest_result.space_utilization,
                        'total_cost': latest_result.total_cost,
                        'optimization_score': latest_result.optimization_score,
                        'truck_count': latest_result.truck_count
                    }
                    comparison['jobs'].append(job_info)

                    # Track bests
                    if latest_result.space_utilization > best_space:
                        best_space = latest_result.space_utilization
                        comparison['best_space_utilization'] = job.id

                    if latest_result.total_cost < best_cost:
                        best_cost = latest_result.total_cost
                        comparison['best_cost_efficiency'] = job.id

                    if latest_result.optimization_score > best_score:
                        best_score = latest_result.optimization_score
                        comparison['best_optimization_score'] = job.id

            return RepositoryResult.success_result(comparison)

        except Exception as e:
            self.logger.error(f"Error comparing job performance: {str(e)}")
            return RepositoryResult.error_result(f"Error comparing job performance: {str(e)}")

    def delete_old_jobs(self, days: int = 90, exclude_statuses: List[str] = None) -> RepositoryResult[int]:
        """Delete jobs older than specified days (excluding certain statuses)"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            exclude_statuses = exclude_statuses or ['completed']

            query = self.db.query(self.model_class).filter(
                and_(
                    self.model_class.date_created < cutoff_date,
                    ~self.model_class.status.in_(exclude_statuses)
                )
            )

            count = query.count()
            query.delete(synchronize_session=False)
            self.db.commit()

            self.logger.info(f"Deleted {count} old packing jobs")
            return RepositoryResult.success_result(count)

        except Exception as e:
            self.db.rollback()
            self.logger.error(f"Error deleting old jobs: {str(e)}")
            return RepositoryResult.error_result(f"Error deleting old jobs: {str(e)}")
