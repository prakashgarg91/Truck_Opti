"""
Advanced 3D Packing Engine - Lazy Loaded
Smart truck recommendation with real 3D bin packing algorithms
"""

import time
from typing import List, Dict, Tuple, Optional

class Carton3D:
    """3D Carton with rotation capabilities"""
    def __init__(self, id: int, name: str, length: float, width: float, height: float, weight: float):
        self.id = id
        self.name = name
        self.length = length
        self.width = width  
        self.height = height
        self.weight = weight
        self.volume = length * width * height
        
    def get_rotations(self):
        """Get all possible rotations"""
        return [
            (self.length, self.width, self.height),  # Original
            (self.length, self.height, self.width),  # Rotate around length
            (self.width, self.length, self.height),  # Rotate around height
            (self.width, self.height, self.length),  # Rotate width-height
            (self.height, self.length, self.width),  # Rotate height-length
            (self.height, self.width, self.length),  # Rotate height-width
        ]

class Truck3D:
    """3D Truck container"""
    def __init__(self, id: int, name: str, length: float, width: float, height: float, max_weight: float, cost_per_km: float = 0):
        self.id = id
        self.name = name
        self.length = length
        self.width = width
        self.height = height
        self.max_weight = max_weight
        self.cost_per_km = cost_per_km
        self.volume = length * width * height

class PackingResult:
    """3D Packing result with detailed metrics"""
    def __init__(self):
        self.success = False
        self.packed_cartons = []
        self.unpacked_cartons = []
        self.volume_utilization = 0.0
        self.weight_utilization = 0.0
        self.stability_score = 0.0
        self.packing_efficiency = 0.0
        self.algorithm_used = ""
        self.processing_time = 0.0

class Advanced3DPacker:
    """Advanced 3D bin packing with multiple algorithms"""
    
    def __init__(self):
        self.algorithms = [
            "bottom_left_fill",
            "best_fit_decreasing", 
            "first_fit_decreasing",
            "next_fit_decreasing",
            "skyline_extreme_points",
            "physics_based_stability"
        ]
    
    def pack_cartons_in_truck(self, truck: Truck3D, cartons: List[Carton3D], algorithm: str = "auto") -> PackingResult:
        """Main packing function with algorithm selection"""
        start_time = time.time()
        
        if algorithm == "auto":
            # Try multiple algorithms and return best result
            best_result = None
            best_efficiency = 0
            
            for algo in self.algorithms:
                result = self._pack_with_algorithm(truck, cartons, algo)
                if result.packing_efficiency > best_efficiency:
                    best_efficiency = result.packing_efficiency
                    best_result = result
                    best_result.algorithm_used = f"{algo} (auto-selected)"
            
            result = best_result or PackingResult()
        else:
            result = self._pack_with_algorithm(truck, cartons, algorithm)
        
        result.processing_time = time.time() - start_time
        return result
    
    def _pack_with_algorithm(self, truck: Truck3D, cartons: List[Carton3D], algorithm: str) -> PackingResult:
        """Pack using specific algorithm"""
        if algorithm == "bottom_left_fill":
            return self._bottom_left_fill(truck, cartons)
        elif algorithm == "best_fit_decreasing":
            return self._best_fit_decreasing(truck, cartons)
        elif algorithm == "first_fit_decreasing":
            return self._first_fit_decreasing(truck, cartons)
        elif algorithm == "skyline_extreme_points":
            return self._skyline_extreme_points(truck, cartons)
        elif algorithm == "physics_based_stability":
            return self._physics_based_stability(truck, cartons)
        else:
            return self._next_fit_decreasing(truck, cartons)
    
    def _bottom_left_fill(self, truck: Truck3D, cartons: List[Carton3D]) -> PackingResult:
        """Bottom-Left-Fill algorithm with rotation optimization"""
        result = PackingResult()
        result.algorithm_used = "Bottom-Left-Fill with Rotation"
        
        # Sort cartons by volume (largest first)
        sorted_cartons = sorted(cartons, key=lambda c: c.volume, reverse=True)
        
        packed_positions = []
        current_weight = 0
        occupied_spaces = []
        
        for carton in sorted_cartons:
            if current_weight + carton.weight > truck.max_weight:
                result.unpacked_cartons.append(carton)
                continue
            
            # Try all rotations to find best fit
            best_position = None
            best_rotation = None
            
            for rotation in carton.get_rotations():
                l, w, h = rotation
                
                # Try to find position using bottom-left strategy
                position = self._find_bottom_left_position(l, w, h, truck, occupied_spaces)
                
                if position:
                    best_position = position
                    best_rotation = rotation
                    break
            
            if best_position:
                x, y, z = best_position
                l, w, h = best_rotation
                
                # Add to packed items
                packed_positions.append({
                    'carton': carton,
                    'position': (x, y, z),
                    'dimensions': (l, w, h),
                    'rotation': best_rotation != (carton.length, carton.width, carton.height)
                })
                
                # Mark space as occupied
                occupied_spaces.append((x, y, z, x + l, y + w, z + h))
                current_weight += carton.weight
                result.packed_cartons.append(carton)
            else:
                result.unpacked_cartons.append(carton)
        
        # Calculate metrics
        result.success = len(result.packed_cartons) > 0
        total_packed_volume = sum(c.volume for c in result.packed_cartons)
        result.volume_utilization = (total_packed_volume / truck.volume) * 100
        result.weight_utilization = (current_weight / truck.max_weight) * 100
        result.stability_score = self._calculate_stability(packed_positions, truck)
        result.packing_efficiency = (result.volume_utilization + result.weight_utilization) / 2
        
        return result
    
    def _find_bottom_left_position(self, length: float, width: float, height: float, 
                                   truck: Truck3D, occupied_spaces: List[Tuple]) -> Optional[Tuple[float, float, float]]:
        """Find bottom-left position for carton with given dimensions"""
        
        # Start from bottom-left corner
        for z in [0] + [space[5] for space in occupied_spaces]:  # Try floor and tops of existing boxes
            for y in [0] + [space[4] for space in occupied_spaces]:  # Try back and fronts
                for x in [0] + [space[3] for space in occupied_spaces]:  # Try left and rights
                    
                    # Check if carton fits in truck at this position
                    if (x + length <= truck.length and 
                        y + width <= truck.width and 
                        z + height <= truck.height):
                        
                        # Check if position conflicts with existing cartons
                        new_space = (x, y, z, x + length, y + width, z + height)
                        if not self._spaces_overlap(new_space, occupied_spaces):
                            return (x, y, z)
        
        return None
    
    def _spaces_overlap(self, space1: Tuple, occupied_spaces: List[Tuple]) -> bool:
        """Check if space overlaps with any occupied space"""
        x1, y1, z1, x2, y2, z2 = space1
        
        for occupied in occupied_spaces:
            ox1, oy1, oz1, ox2, oy2, oz2 = occupied
            
            # Check for overlap in 3D
            if not (x2 <= ox1 or x1 >= ox2 or 
                    y2 <= oy1 or y1 >= oy2 or 
                    z2 <= oz1 or z1 >= oz2):
                return True
        
        return False
    
    def _best_fit_decreasing(self, truck: Truck3D, cartons: List[Carton3D]) -> PackingResult:
        """Best Fit Decreasing algorithm"""
        result = PackingResult()
        result.algorithm_used = "Best-Fit-Decreasing"
        
        # Sort by volume decreasing
        sorted_cartons = sorted(cartons, key=lambda c: c.volume, reverse=True)
        
        # Simple implementation - can be enhanced
        return self._bottom_left_fill(truck, sorted_cartons)
    
    def _first_fit_decreasing(self, truck: Truck3D, cartons: List[Carton3D]) -> PackingResult:
        """First Fit Decreasing algorithm"""
        result = PackingResult()
        result.algorithm_used = "First-Fit-Decreasing"
        
        # Sort by largest dimension decreasing
        sorted_cartons = sorted(cartons, key=lambda c: max(c.length, c.width, c.height), reverse=True)
        
        return self._bottom_left_fill(truck, sorted_cartons)
    
    def _next_fit_decreasing(self, truck: Truck3D, cartons: List[Carton3D]) -> PackingResult:
        """Next Fit Decreasing algorithm"""
        result = PackingResult()
        result.algorithm_used = "Next-Fit-Decreasing"
        
        # Sort by weight decreasing
        sorted_cartons = sorted(cartons, key=lambda c: c.weight, reverse=True)
        
        return self._bottom_left_fill(truck, sorted_cartons)
    
    def _calculate_stability(self, packed_positions: List[Dict], truck: Truck3D) -> float:
        """Calculate stability score based on support and weight distribution"""
        if not packed_positions:
            return 0.0
        
        stability_score = 0.0
        total_cartons = len(packed_positions)
        
        for item in packed_positions:
            x, y, z = item['position']
            
            # Ground support gets full points
            if z == 0:
                stability_score += 100
            else:
                # Calculate support from boxes below
                support_ratio = self._calculate_support_ratio(item, packed_positions)
                stability_score += support_ratio * 100
        
        return stability_score / total_cartons if total_cartons > 0 else 0.0
    
    def _calculate_support_ratio(self, item: Dict, all_items: List[Dict]) -> float:
        """Calculate how much of the carton is supported by boxes below"""
        x, y, z = item['position']
        l, w, h = item['dimensions']
        
        if z == 0:  # On ground
            return 1.0
        
        supported_area = 0.0
        total_area = l * w
        
        # Check overlap with boxes directly below
        for other in all_items:
            if other == item:
                continue
                
            ox, oy, oz = other['position']
            ol, ow, oh = other['dimensions']
            
            # Check if other box is directly below
            if oz + oh == z:
                # Calculate overlap area
                overlap_x = max(0, min(x + l, ox + ol) - max(x, ox))
                overlap_y = max(0, min(y + w, oy + ow) - max(y, oy))
                overlap_area = overlap_x * overlap_y
                supported_area += overlap_area
        
        return min(supported_area / total_area, 1.0) if total_area > 0 else 0.0
    
    def _skyline_extreme_points(self, truck: Truck3D, cartons: List[Carton3D]) -> PackingResult:
        """Enhanced Skyline Algorithm with Extreme Points optimization"""
        result = PackingResult()
        result.algorithm_used = "Skyline-Extreme-Points"
        
        # Sort cartons by volume (largest first) for better packing
        sorted_cartons = sorted(cartons, key=lambda c: c.volume, reverse=True)
        
        # Initialize skyline and extreme points
        skyline = SkylineProfile()
        extreme_points = ExtremePointsManager()
        
        packed_positions = []
        current_weight = 0
        
        for carton in sorted_cartons:
            if current_weight + carton.weight > truck.max_weight:
                result.unpacked_cartons.append(carton)
                continue
            
            # Find best placement using extreme points
            best_placement = self._find_extreme_point_placement(
                carton, truck, skyline, extreme_points
            )
            
            if best_placement:
                position, rotation, fitness_score = best_placement
                x, y, z = position
                l, w, h = rotation
                
                # Place carton and update skyline
                packed_positions.append({
                    'carton': carton,
                    'position': position,
                    'dimensions': rotation,
                    'rotation': rotation != (carton.length, carton.width, carton.height),
                    'fitness_score': fitness_score
                })
                
                skyline.update_skyline(x, y, z, l, w, h)
                extreme_points.update_extreme_points(skyline.profile)
                current_weight += carton.weight
                result.packed_cartons.append(carton)
            else:
                result.unpacked_cartons.append(carton)
        
        # Calculate enhanced metrics
        result.success = len(result.packed_cartons) > 0
        total_packed_volume = sum(c.volume for c in result.packed_cartons)
        result.volume_utilization = (total_packed_volume / truck.volume) * 100
        result.weight_utilization = (current_weight / truck.max_weight) * 100
        result.stability_score = self._calculate_enhanced_stability(packed_positions, truck)
        result.packing_efficiency = (result.volume_utilization + result.weight_utilization + result.stability_score) / 3
        
        return result
    
    def _physics_based_stability(self, truck: Truck3D, cartons: List[Carton3D]) -> PackingResult:
        """Physics-based stability optimization algorithm"""
        result = PackingResult()
        result.algorithm_used = "Physics-Based-Stability"
        
        # Sort by weight (heaviest first for better stability)
        sorted_cartons = sorted(cartons, key=lambda c: c.weight, reverse=True)
        
        packed_positions = []
        current_weight = 0
        center_of_gravity_tracker = CenterOfGravityTracker()
        
        for carton in sorted_cartons:
            if current_weight + carton.weight > truck.max_weight:
                result.unpacked_cartons.append(carton)
                continue
            
            # Find placement that optimizes center of gravity and stability
            best_placement = self._find_stability_optimized_placement(
                carton, truck, packed_positions, center_of_gravity_tracker
            )
            
            if best_placement:
                position, rotation, stability_score = best_placement
                x, y, z = position
                l, w, h = rotation
                
                # Place carton and update physics
                packed_positions.append({
                    'carton': carton,
                    'position': position,
                    'dimensions': rotation,
                    'rotation': rotation != (carton.length, carton.width, carton.height),
                    'stability_contribution': stability_score
                })
                
                center_of_gravity_tracker.add_carton(carton, position, rotation)
                current_weight += carton.weight
                result.packed_cartons.append(carton)
            else:
                result.unpacked_cartons.append(carton)
        
        # Calculate physics-based metrics
        result.success = len(result.packed_cartons) > 0
        total_packed_volume = sum(c.volume for c in result.packed_cartons)
        result.volume_utilization = (total_packed_volume / truck.volume) * 100
        result.weight_utilization = (current_weight / truck.max_weight) * 100
        result.stability_score = center_of_gravity_tracker.calculate_overall_stability(truck)
        result.packing_efficiency = (result.volume_utilization * 0.3 + 
                                   result.weight_utilization * 0.2 + 
                                   result.stability_score * 0.5)  # Weight stability higher
        
        return result
    
    def _find_extreme_point_placement(self, carton: Carton3D, truck: Truck3D, 
                                     skyline: 'SkylineProfile', extreme_points: 'ExtremePointsManager') -> Optional[Tuple]:
        """Find optimal placement using extreme points strategy"""
        best_placement = None
        best_fitness = float('-inf')
        
        for rotation in carton.get_rotations():
            l, w, h = rotation
            
            # Skip if carton doesn't fit in any orientation
            if l > truck.length or w > truck.width or h > truck.height:
                continue
            
            # Try each extreme point
            for point in extreme_points.get_candidate_points():
                x, y, z = point
                
                # Check if placement is valid
                if (x + l <= truck.length and 
                    y + w <= truck.width and 
                    z + h <= truck.height):
                    
                    # Calculate fitness score for this placement
                    fitness = self._calculate_placement_fitness(
                        carton, (x, y, z), rotation, skyline, truck
                    )
                    
                    if fitness > best_fitness:
                        best_fitness = fitness
                        best_placement = ((x, y, z), rotation, fitness)
        
        return best_placement
    
    def _find_stability_optimized_placement(self, carton: Carton3D, truck: Truck3D, 
                                          existing_positions: List[Dict], 
                                          cog_tracker: 'CenterOfGravityTracker') -> Optional[Tuple]:
        """Find placement that optimizes center of gravity and load distribution"""
        best_placement = None
        best_stability = float('-inf')
        
        for rotation in carton.get_rotations():
            l, w, h = rotation
            
            if l > truck.length or w > truck.width or h > truck.height:
                continue
            
            # Try positions that minimize center of gravity displacement
            for x in range(0, int(truck.length - l) + 1):
                for y in range(0, int(truck.width - w) + 1):
                    for z in range(0, int(truck.height - h) + 1):
                        position = (x, y, z)
                        
                        # Check for collisions
                        if not self._check_collision_free(position, rotation, existing_positions):
                            continue
                        
                        # Calculate stability contribution
                        stability = cog_tracker.calculate_stability_impact(
                            carton, position, rotation, truck
                        )
                        
                        if stability > best_stability:
                            best_stability = stability
                            best_placement = (position, rotation, stability)
        
        return best_placement
    
    def _calculate_placement_fitness(self, carton: Carton3D, position: Tuple, 
                                   rotation: Tuple, skyline: 'SkylineProfile', truck: Truck3D) -> float:
        """Calculate fitness score for a placement (higher is better)"""
        x, y, z = position
        l, w, h = rotation
        
        # Factors for fitness calculation
        factors = {
            'height_penalty': -z * 0.1,  # Prefer lower placements
            'corner_preference': self._calculate_corner_preference(x, y, truck),
            'space_efficiency': self._calculate_space_efficiency(position, rotation, skyline),
            'support_quality': self._calculate_support_quality(position, rotation, skyline),
            'compactness': self._calculate_compactness_score(position, rotation, truck)
        }
        
        # Weighted combination
        fitness = (factors['height_penalty'] * 0.2 +
                  factors['corner_preference'] * 0.2 +
                  factors['space_efficiency'] * 0.3 +
                  factors['support_quality'] * 0.2 +
                  factors['compactness'] * 0.1)
        
        return fitness
    
    def _calculate_enhanced_stability(self, packed_positions: List[Dict], truck: Truck3D) -> float:
        """Enhanced stability calculation with multiple factors"""
        if not packed_positions:
            return 0.0
        
        total_stability = 0.0
        total_weight = sum(item['carton'].weight for item in packed_positions)
        
        for item in packed_positions:
            # Base support calculation
            support_ratio = self._calculate_support_ratio(item, packed_positions)
            
            # Weight distribution factor
            weight_factor = item['carton'].weight / total_weight if total_weight > 0 else 0
            
            # Height penalty (lower is more stable)
            height_penalty = 1.0 - (item['position'][2] / truck.height)
            
            # Combined stability score
            item_stability = (support_ratio * 0.5 + 
                            height_penalty * 0.3 + 
                            weight_factor * 0.2) * 100
            
            total_stability += item_stability
        
        return total_stability / len(packed_positions) if packed_positions else 0.0
    
    def _check_collision_free(self, position: Tuple, rotation: Tuple, existing_positions: List[Dict]) -> bool:
        """Check if placement collides with existing cartons"""
        x, y, z = position
        l, w, h = rotation
        new_space = (x, y, z, x + l, y + w, z + h)
        
        for item in existing_positions:
            ix, iy, iz = item['position']
            il, iw, ih = item['dimensions']
            existing_space = (ix, iy, iz, ix + il, iy + iw, iz + ih)
            
            # Check for 3D overlap
            if not (new_space[3] <= existing_space[0] or new_space[0] >= existing_space[3] or
                    new_space[4] <= existing_space[1] or new_space[1] >= existing_space[4] or
                    new_space[5] <= existing_space[2] or new_space[2] >= existing_space[5]):
                return False
        
        return True
    
    def _calculate_corner_preference(self, x: float, y: float, truck: Truck3D) -> float:
        """Calculate preference for corner placements"""
        corner_distance = min(x, truck.length - x) + min(y, truck.width - y)
        max_distance = truck.length + truck.width
        return 1.0 - (corner_distance / max_distance)
    
    def _calculate_space_efficiency(self, position: Tuple, rotation: Tuple, skyline: 'SkylineProfile') -> float:
        """Calculate space utilization efficiency"""
        # Simplified space efficiency calculation
        return 0.8  # Placeholder - would implement full skyline analysis
    
    def _calculate_support_quality(self, position: Tuple, rotation: Tuple, skyline: 'SkylineProfile') -> float:
        """Calculate quality of support underneath"""
        x, y, z = position
        if z == 0:  # Ground level
            return 1.0
        
        # Simplified support calculation
        return max(0.0, 1.0 - z / 10.0)  # Placeholder
    
    def _calculate_compactness_score(self, position: Tuple, rotation: Tuple, truck: Truck3D) -> float:
        """Calculate how compact the placement is"""
        x, y, z = position
        l, w, h = rotation
        
        # Distance from center of truck
        truck_center_x = truck.length / 2
        truck_center_y = truck.width / 2
        
        carton_center_x = x + l / 2
        carton_center_y = y + w / 2
        
        distance_from_center = ((carton_center_x - truck_center_x) ** 2 + 
                               (carton_center_y - truck_center_y) ** 2) ** 0.5
        
        max_distance = ((truck.length / 2) ** 2 + (truck.width / 2) ** 2) ** 0.5
        
        return 1.0 - (distance_from_center / max_distance)


# Supporting classes for advanced algorithms
class SkylineProfile:
    """Manages skyline profile for efficient space utilization"""
    
    def __init__(self):
        self.profile = [(0, 0, float('inf'), float('inf'))]  # (x, y, width, depth, height)
    
    def update_skyline(self, x: float, y: float, z: float, l: float, w: float, h: float):
        """Update skyline after placing a carton"""
        # Simplified skyline update - would implement full skyline maintenance
        new_point = (x + l, y + w, l, w, z + h)
        self.profile.append(new_point)


class ExtremePointsManager:
    """Manages extreme points for optimal carton placement"""
    
    def __init__(self):
        self.extreme_points = [(0, 0, 0)]  # Start with origin
    
    def get_candidate_points(self) -> List[Tuple[float, float, float]]:
        """Get candidate extreme points for placement"""
        return self.extreme_points
    
    def update_extreme_points(self, skyline_profile: List[Tuple]):
        """Update extreme points based on skyline changes"""
        # Extract unique points from skyline
        new_points = [(point[0], point[1], point[4]) for point in skyline_profile]
        self.extreme_points.extend(new_points)
        
        # Remove duplicates and keep unique points
        self.extreme_points = list(set(self.extreme_points))


class CenterOfGravityTracker:
    """Tracks and optimizes center of gravity for load stability"""
    
    def __init__(self):
        self.total_weight = 0.0
        self.weighted_x = 0.0
        self.weighted_y = 0.0
        self.weighted_z = 0.0
    
    def add_carton(self, carton: Carton3D, position: Tuple, rotation: Tuple):
        """Add carton to center of gravity calculation"""
        x, y, z = position
        l, w, h = rotation
        
        # Calculate carton center
        center_x = x + l / 2
        center_y = y + w / 2
        center_z = z + h / 2
        
        # Update weighted averages
        self.weighted_x += carton.weight * center_x
        self.weighted_y += carton.weight * center_y
        self.weighted_z += carton.weight * center_z
        self.total_weight += carton.weight
    
    def calculate_stability_impact(self, carton: Carton3D, position: Tuple, 
                                 rotation: Tuple, truck: Truck3D) -> float:
        """Calculate stability impact of adding this carton"""
        if self.total_weight == 0:
            return 100.0  # First carton always has good stability
        
        x, y, z = position
        l, w, h = rotation
        
        # Calculate new center of gravity
        center_x = x + l / 2
        center_y = y + w / 2
        center_z = z + h / 2
        
        new_total_weight = self.total_weight + carton.weight
        new_cog_x = (self.weighted_x + carton.weight * center_x) / new_total_weight
        new_cog_y = (self.weighted_y + carton.weight * center_y) / new_total_weight
        new_cog_z = (self.weighted_z + carton.weight * center_z) / new_total_weight
        
        # Calculate stability score based on COG position
        truck_center_x = truck.length / 2
        truck_center_y = truck.width / 2
        
        # Distance from ideal center
        distance_from_ideal = ((new_cog_x - truck_center_x) ** 2 + 
                              (new_cog_y - truck_center_y) ** 2) ** 0.5
        
        max_distance = ((truck.length / 2) ** 2 + (truck.width / 2) ** 2) ** 0.5
        
        # Stability score (higher is better)
        stability = 100.0 * (1.0 - distance_from_ideal / max_distance)
        
        # Penalty for high center of gravity
        height_penalty = (new_cog_z / truck.height) * 20.0
        
        return max(0.0, stability - height_penalty)
    
    def calculate_overall_stability(self, truck: Truck3D) -> float:
        """Calculate overall load stability"""
        if self.total_weight == 0:
            return 0.0
        
        # Current center of gravity
        cog_x = self.weighted_x / self.total_weight
        cog_y = self.weighted_y / self.total_weight
        cog_z = self.weighted_z / self.total_weight
        
        # Ideal center
        ideal_x = truck.length / 2
        ideal_y = truck.width / 2
        
        # Calculate stability factors
        lateral_stability = 100.0 * (1.0 - abs(cog_x - ideal_x) / (truck.length / 2))
        longitudinal_stability = 100.0 * (1.0 - abs(cog_y - ideal_y) / (truck.width / 2))
        vertical_stability = 100.0 * (1.0 - cog_z / truck.height)
        
        # Combined stability score
        overall_stability = (lateral_stability + longitudinal_stability + vertical_stability) / 3
        
        return max(0.0, min(100.0, overall_stability))

class SmartTruckRecommendation:
    """Smart truck recommendation system"""
    
    def __init__(self):
        self.packer = Advanced3DPacker()
    
    def recommend_optimal_trucks(self, available_trucks: List[Truck3D], 
                                cartons: List[Carton3D]) -> List[Dict]:
        """Enhanced truck recommendation with advanced multi-pass optimization"""
        recommendations = []
        
        # Advanced optimization strategies from previous TruckOpti
        optimization_strategies = [
            ("volume_priority", lambda c: c.volume),
            ("weight_priority", lambda c: c.weight), 
            ("density_priority", lambda c: c.weight / c.volume if c.volume > 0 else 0),
            ("balanced_priority", lambda c: c.volume * 0.4 + c.weight * 0.6),
            ("space_efficiency", lambda c: (c.length * c.width * c.height) / (c.length + c.width + c.height))
        ]
        
        for truck in available_trucks:
            best_result = None
            best_score = 0
            
            # Try multiple optimization strategies and keep the best
            for strategy_name, sort_key in optimization_strategies:
                # Sort cartons according to current strategy
                sorted_cartons = sorted(cartons, key=sort_key, reverse=True)
                
                # Try packing with this strategy
                packing_result = self.packer.pack_cartons_in_truck(truck, sorted_cartons, "auto")
                
                # Enhanced scoring with multiple criteria
                score = self._calculate_enhanced_recommendation_score(truck, packing_result, strategy_name)
                
                if score > best_score:
                    best_score = score
                    best_result = packing_result
                    best_result.optimization_strategy = strategy_name
            
            # Use best result for this truck
            final_score = self._calculate_recommendation_score(truck, best_result)
            
            recommendations.append({
                'truck': truck,
                'packing_result': best_result,
                'recommendation_score': final_score,
                'fits_all': len(best_result.unpacked_cartons) == 0,
                'cost_efficiency': self._calculate_cost_efficiency(truck, best_result),
                'space_suggestions': self._generate_space_optimization_suggestions(truck, best_result)
            })
        
        # Sort by recommendation score (highest first)
        recommendations.sort(key=lambda x: x['recommendation_score'], reverse=True)
        
        return recommendations
    
    def _calculate_recommendation_score(self, truck: Truck3D, result: PackingResult) -> float:
        """Calculate overall recommendation score (0-100)"""
        if not result.success:
            return 0.0
        
        # Weighted scoring
        volume_score = result.volume_utilization * 0.3
        weight_score = result.weight_utilization * 0.2
        stability_score = result.stability_score * 0.25
        efficiency_score = result.packing_efficiency * 0.25
        
        return min(volume_score + weight_score + stability_score + efficiency_score, 100.0)
    
    def _calculate_cost_efficiency(self, truck: Truck3D, result: PackingResult) -> float:
        """Calculate cost per unit volume utilized"""
        if result.volume_utilization == 0:
            return float('inf')
        
        return truck.cost_per_km / (result.volume_utilization / 100)
    
    def _calculate_enhanced_recommendation_score(self, truck: Truck3D, result: PackingResult, strategy: str) -> float:
        """Enhanced scoring with strategy-specific weighting from advanced TruckOpti"""
        if not result.success:
            return 0.0
        
        # Base scores
        volume_score = result.volume_utilization
        weight_score = result.weight_utilization  
        stability_score = result.stability_score
        efficiency_score = result.packing_efficiency
        
        # Strategy-specific weighting (from previous TruckOpti advanced algorithms)
        if strategy == "volume_priority":
            weighted_score = volume_score * 0.5 + weight_score * 0.2 + stability_score * 0.2 + efficiency_score * 0.1
        elif strategy == "weight_priority":
            weighted_score = volume_score * 0.2 + weight_score * 0.5 + stability_score * 0.2 + efficiency_score * 0.1
        elif strategy == "density_priority":
            weighted_score = volume_score * 0.25 + weight_score * 0.25 + stability_score * 0.4 + efficiency_score * 0.1
        elif strategy == "balanced_priority":
            weighted_score = volume_score * 0.3 + weight_score * 0.3 + stability_score * 0.25 + efficiency_score * 0.15
        elif strategy == "space_efficiency":
            weighted_score = volume_score * 0.4 + weight_score * 0.15 + stability_score * 0.15 + efficiency_score * 0.3
        else:
            weighted_score = (volume_score + weight_score + stability_score + efficiency_score) / 4
        
        # Bonus for perfect fits
        if len(result.unpacked_cartons) == 0:
            weighted_score *= 1.1
        
        # Penalty for poor utilization
        if volume_score < 50:
            weighted_score *= 0.8
        
        return min(weighted_score, 100.0)
    
    def _generate_space_optimization_suggestions(self, truck: Truck3D, result: PackingResult) -> List[str]:
        """Generate space optimization suggestions from advanced TruckOpti algorithms"""
        suggestions = []
        
        if result.volume_utilization < 60:
            suggestions.append("Consider using a smaller truck to improve cost efficiency")
        
        if result.weight_utilization < 70:
            suggestions.append("Additional cartons can be loaded - weight capacity not fully utilized")
        
        if result.stability_score < 80:
            suggestions.append("Rearrange heavier items at the bottom for better stability")
        
        if len(result.unpacked_cartons) > 0:
            suggestions.append(f"{len(result.unpacked_cartons)} cartons couldn't fit - consider larger truck or split shipment")
        
        if result.volume_utilization > 90:
            suggestions.append("Excellent space utilization achieved!")
        
        if result.stability_score > 90:
            suggestions.append("Load is well-balanced and stable for transport")
        
        # Advanced suggestions based on packing efficiency
        if result.packing_efficiency > 85:
            suggestions.append("Optimal packing configuration found - ready for dispatch")
        elif result.packing_efficiency < 60:
            suggestions.append("Try reordering cartons by size or weight for better packing")
        
        return suggestions if suggestions else ["Good packing configuration achieved"]

# Global lazy-loaded instance
_packing_engine = None

def get_packing_engine():
    """Lazy load packing engine only when needed"""
    global _packing_engine
    if _packing_engine is None:
        print("Loading advanced 3D packing engine...")
        _packing_engine = SmartTruckRecommendation()
    return _packing_engine