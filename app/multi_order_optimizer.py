"""
Multi-Order Truck Optimization Engine
Priority 1: Logic for consolidating multiple sale orders into single trucks for maximum cost savings
"""

import logging
from typing import List, Dict, Any, Tuple, Optional
from collections import defaultdict
import numpy as np
from app.models import SaleOrder, TruckType, CartonType
from app.packer import pack_cartons_optimized
from app.cost_engine import cost_engine

class MultiOrderOptimizer:
    """
    Advanced optimizer that consolidates multiple sale orders into single trucks
    for maximum space utilization and cost savings.
    """
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
    
    def optimize_multi_order_consolidation(
        self, 
        sale_orders: List[SaleOrder], 
        trucks: List[TruckType],
        optimization_strategy: str = 'cost_saving'
    ) -> List[Dict[str, Any]]:
        """
        Main optimization function that consolidates multiple sale orders.
        
        Args:
            sale_orders: List of sale orders to optimize
            trucks: Available truck types
            optimization_strategy: 'cost_saving', 'space_utilization', or 'balanced'
        
        Returns:
            List of optimized truck recommendations with consolidated orders
        """
        self.logger.info(f"Starting multi-order optimization for {len(sale_orders)} orders")
        
        # Group orders by delivery region for consolidation
        regional_groups = self._group_orders_by_region(sale_orders)
        
        consolidated_recommendations = []
        
        for region, orders in regional_groups.items():
            self.logger.info(f"Optimizing {len(orders)} orders for region: {region}")
            
            # Try different consolidation strategies
            consolidation_results = self._try_consolidation_strategies(orders, trucks, optimization_strategy)
            
            # Select best consolidation approach
            best_result = self._select_best_consolidation(consolidation_results, optimization_strategy)
            
            if best_result:
                consolidated_recommendations.append(best_result)
        
        return consolidated_recommendations
    
    def _group_orders_by_region(self, sale_orders: List[SaleOrder]) -> Dict[str, List[SaleOrder]]:
        """Group orders by delivery region for potential consolidation."""
        regional_groups = defaultdict(list)
        
        for order in sale_orders:
            # Extract city/region from delivery address
            delivery_address = getattr(order.sale_order_items[0], 'delivery_address', 'Unknown') if order.sale_order_items else 'Unknown'
            
            # Simple region extraction (can be enhanced with geolocation)
            region = self._extract_region(delivery_address)
            regional_groups[region].append(order)
        
        return dict(regional_groups)
    
    def _extract_region(self, address: str) -> str:
        """Extract region from delivery address."""
        major_cities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Ahmedabad']
        address_upper = address.upper()
        
        for city in major_cities:
            if city.upper() in address_upper:
                return city
        
        return 'Other'
    
    def _try_consolidation_strategies(
        self, 
        orders: List[SaleOrder], 
        trucks: List[TruckType], 
        optimization_strategy: str
    ) -> List[Dict[str, Any]]:
        """Try different consolidation strategies."""
        strategies = []
        
        # Strategy 1: Single large truck for all orders
        single_truck_result = self._try_single_truck_consolidation(orders, trucks, optimization_strategy)
        if single_truck_result:
            strategies.append(single_truck_result)
        
        # Strategy 2: Optimal multi-truck consolidation
        multi_truck_result = self._try_multi_truck_consolidation(orders, trucks, optimization_strategy)
        if multi_truck_result:
            strategies.append(multi_truck_result)
        
        # Strategy 3: Individual orders (fallback)
        individual_result = self._try_individual_orders(orders, trucks, optimization_strategy)
        if individual_result:
            strategies.append(individual_result)
        
        return strategies
    
    def _try_single_truck_consolidation(
        self, 
        orders: List[SaleOrder], 
        trucks: List[TruckType], 
        optimization_strategy: str
    ) -> Optional[Dict[str, Any]]:
        """Try to fit all orders in a single truck."""
        # Combine all cartons from all orders
        consolidated_cartons = defaultdict(int)
        
        for order in orders:
            for item in order.sale_order_items:
                carton = item.carton
                consolidated_cartons[carton] += item.quantity
        
        # Find optimal single truck
        best_truck = None
        best_result = None
        best_score = -1
        
        for truck in sorted(trucks, key=lambda t: t.length * t.width * t.height):
            try:
                truck_combo = {truck: 1}
                pack_result = pack_cartons_optimized(truck_combo, consolidated_cartons, optimization_strategy)
                
                if pack_result:
                    result = pack_result[0]
                    utilization = result.get('utilization', 0)
                    fits_completely = len(result.get('unfitted_items', [])) == 0
                    
                    if fits_completely:
                        # Calculate comprehensive cost
                        route_info = {'distance_km': 150, 'route_type': 'highway', 'location': 'India'}
                        cost_breakdown = cost_engine.calculate_comprehensive_cost(truck, route_info)
                        total_cost = cost_breakdown.total_cost
                        
                        # Score based on cost efficiency and utilization
                        score = (utilization * 100) - (total_cost / 100)
                        
                        if score > best_score:
                            best_score = score
                            best_truck = truck
                            best_result = {
                                'strategy': 'single_truck_consolidation',
                                'truck': truck,
                                'orders': orders,
                                'utilization': utilization,
                                'total_cost': total_cost,
                                'cost_per_order': total_cost / len(orders),
                                'space_utilization': utilization,
                                'fits_completely': fits_completely,
                                'carton_distribution': dict(consolidated_cartons),
                                'savings': self._calculate_savings(orders, total_cost),
                                'score': score,
                                'description': f"CONSOLIDATED: {len(orders)} orders in 1 truck • {utilization:.1%} utilization • ₹{total_cost:.0f} total cost"
                            }
                            break  # Use smallest truck that fits
            
            except Exception as e:
                self.logger.error(f"Error testing single truck {truck.name}: {e}")
                continue
        
        return best_result
    
    def _try_multi_truck_consolidation(
        self, 
        orders: List[SaleOrder], 
        trucks: List[TruckType], 
        optimization_strategy: str
    ) -> Optional[Dict[str, Any]]:
        """Try optimal multi-truck consolidation using advanced algorithms."""
        if len(orders) < 2:
            return None
        
        # Use dynamic programming approach for optimal grouping
        optimal_grouping = self._find_optimal_grouping(orders, trucks, optimization_strategy)
        
        if optimal_grouping:
            total_cost = sum(group['cost'] for group in optimal_grouping['groups'])
            total_utilization = np.mean([group['utilization'] for group in optimal_grouping['groups']])
            
            return {
                'strategy': 'multi_truck_consolidation',
                'groups': optimal_grouping['groups'],
                'orders': orders,
                'total_cost': total_cost,
                'cost_per_order': total_cost / len(orders),
                'average_utilization': total_utilization,
                'num_trucks': len(optimal_grouping['groups']),
                'savings': self._calculate_savings(orders, total_cost),
                'score': (total_utilization * 100) - (total_cost / 100),
                'description': f"OPTIMIZED: {len(orders)} orders in {len(optimal_grouping['groups'])} trucks • {total_utilization:.1%} avg utilization • ₹{total_cost:.0f} total cost"
            }
        
        return None
    
    def _try_individual_orders(
        self, 
        orders: List[SaleOrder], 
        trucks: List[TruckType], 
        optimization_strategy: str
    ) -> Optional[Dict[str, Any]]:
        """Fallback: individual truck for each order."""
        individual_results = []
        total_cost = 0
        
        for order in orders:
            carton_quantities = defaultdict(int)
            for item in order.sale_order_items:
                carton_quantities[item.carton] += item.quantity
            
            # Find best truck for this order
            best_truck = None
            best_cost = float('inf')
            
            for truck in trucks:
                try:
                    truck_combo = {truck: 1}
                    pack_result = pack_cartons_optimized(truck_combo, carton_quantities, optimization_strategy)
                    
                    if pack_result and len(pack_result[0].get('unfitted_items', [])) == 0:
                        route_info = {'distance_km': 150, 'route_type': 'highway', 'location': 'India'}
                        cost_breakdown = cost_engine.calculate_comprehensive_cost(truck, route_info)
                        cost = cost_breakdown.total_cost
                        
                        if cost < best_cost:
                            best_cost = cost
                            best_truck = truck
                
                except Exception:
                    continue
            
            if best_truck:
                individual_results.append({
                    'order': order,
                    'truck': best_truck,
                    'cost': best_cost
                })
                total_cost += best_cost
        
        if individual_results:
            return {
                'strategy': 'individual_orders',
                'individual_results': individual_results,
                'orders': orders,
                'total_cost': total_cost,
                'cost_per_order': total_cost / len(orders),
                'num_trucks': len(individual_results),
                'savings': 0,  # No savings compared to baseline
                'score': -total_cost / 100,  # Negative score for expensive solution
                'description': f"INDIVIDUAL: {len(orders)} orders in {len(individual_results)} trucks • ₹{total_cost:.0f} total cost"
            }
        
        return None
    
    def _find_optimal_grouping(self, orders: List[SaleOrder], trucks: List[TruckType], strategy: str) -> Optional[Dict]:
        """Find optimal grouping of orders using dynamic programming."""
        # Simplified version - can be enhanced with more sophisticated algorithms
        n = len(orders)
        if n <= 2:
            return self._group_two_orders(orders, trucks, strategy)
        
        # For now, use greedy approach for larger sets
        return self._greedy_grouping(orders, trucks, strategy)
    
    def _group_two_orders(self, orders: List[SaleOrder], trucks: List[TruckType], strategy: str) -> Optional[Dict]:
        """Optimal grouping for two orders."""
        # Combine cartons from both orders
        combined_cartons = defaultdict(int)
        for order in orders:
            for item in order.sale_order_items:
                combined_cartons[item.carton] += item.quantity
        
        # Find best truck for combined load
        for truck in sorted(trucks, key=lambda t: t.length * t.width * t.height):
            try:
                truck_combo = {truck: 1}
                pack_result = pack_cartons_optimized(truck_combo, combined_cartons, strategy)
                
                if pack_result and len(pack_result[0].get('unfitted_items', [])) == 0:
                    route_info = {'distance_km': 150, 'route_type': 'highway', 'location': 'India'}
                    cost_breakdown = cost_engine.calculate_comprehensive_cost(truck, route_info)
                    
                    return {
                        'groups': [{
                            'orders': orders,
                            'truck': truck,
                            'cost': cost_breakdown.total_cost,
                            'utilization': pack_result[0].get('utilization', 0)
                        }]
                    }
            
            except Exception:
                continue
        
        return None
    
    def _greedy_grouping(self, orders: List[SaleOrder], trucks: List[TruckType], strategy: str) -> Optional[Dict]:
        """Greedy grouping approach for multiple orders."""
        remaining_orders = orders.copy()
        groups = []
        
        while remaining_orders:
            best_group = None
            best_score = -float('inf')
            
            # Try different group sizes
            for group_size in range(1, min(4, len(remaining_orders) + 1)):
                from itertools import combinations
                
                for order_combo in combinations(remaining_orders, group_size):
                    combined_cartons = defaultdict(int)
                    for order in order_combo:
                        for item in order.sale_order_items:
                            combined_cartons[item.carton] += item.quantity
                    
                    # Find best truck for this combination
                    for truck in trucks:
                        try:
                            truck_combo = {truck: 1}
                            pack_result = pack_cartons_optimized(truck_combo, combined_cartons, strategy)
                            
                            if pack_result and len(pack_result[0].get('unfitted_items', [])) == 0:
                                route_info = {'distance_km': 150, 'route_type': 'highway', 'location': 'India'}
                                cost_breakdown = cost_engine.calculate_comprehensive_cost(truck, route_info)
                                utilization = pack_result[0].get('utilization', 0)
                                
                                # Score: prioritize high utilization and low cost per order
                                score = utilization * 100 - (cost_breakdown.total_cost / len(order_combo))
                                
                                if score > best_score:
                                    best_score = score
                                    best_group = {
                                        'orders': list(order_combo),
                                        'truck': truck,
                                        'cost': cost_breakdown.total_cost,
                                        'utilization': utilization
                                    }
                        
                        except Exception:
                            continue
            
            if best_group:
                groups.append(best_group)
                for order in best_group['orders']:
                    remaining_orders.remove(order)
            else:
                # Handle remaining orders individually
                if remaining_orders:
                    order = remaining_orders.pop(0)
                    individual_result = self._try_individual_orders([order], trucks, strategy)
                    if individual_result and individual_result['individual_results']:
                        result = individual_result['individual_results'][0]
                        groups.append({
                            'orders': [order],
                            'truck': result['truck'],
                            'cost': result['cost'],
                            'utilization': 0.5  # Estimate
                        })
        
        return {'groups': groups} if groups else None
    
    def _calculate_savings(self, orders: List[SaleOrder], consolidated_cost: float) -> float:
        """Calculate cost savings compared to individual processing."""
        # Estimate individual processing cost (simplified)
        estimated_individual_cost = len(orders) * 2000  # ₹2000 per order baseline
        savings = max(0, estimated_individual_cost - consolidated_cost)
        return savings
    
    def _select_best_consolidation(self, strategies: List[Dict], optimization_strategy: str) -> Optional[Dict]:
        """Select the best consolidation strategy based on optimization goal."""
        if not strategies:
            return None
        
        if optimization_strategy == 'cost_saving':
            # Prioritize lowest total cost
            return min(strategies, key=lambda s: s.get('total_cost', float('inf')))
        
        elif optimization_strategy == 'space_utilization':
            # Prioritize highest space utilization
            return max(strategies, key=lambda s: s.get('space_utilization', s.get('average_utilization', 0)))
        
        else:  # balanced
            # Use overall score
            return max(strategies, key=lambda s: s.get('score', -float('inf')))

# Global instance
multi_order_optimizer = MultiOrderOptimizer()