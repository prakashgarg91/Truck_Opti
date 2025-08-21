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
            "next_fit_decreasing"
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

class SmartTruckRecommendation:
    """Smart truck recommendation system"""
    
    def __init__(self):
        self.packer = Advanced3DPacker()
    
    def recommend_optimal_trucks(self, available_trucks: List[Truck3D], 
                                cartons: List[Carton3D]) -> List[Dict]:
        """Recommend trucks sorted by optimization score"""
        recommendations = []
        
        for truck in available_trucks:
            # Try packing cartons in this truck
            packing_result = self.packer.pack_cartons_in_truck(truck, cartons, "auto")
            
            # Calculate recommendation score
            score = self._calculate_recommendation_score(truck, packing_result)
            
            recommendations.append({
                'truck': truck,
                'packing_result': packing_result,
                'recommendation_score': score,
                'fits_all': len(packing_result.unpacked_cartons) == 0,
                'cost_efficiency': self._calculate_cost_efficiency(truck, packing_result)
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

# Global lazy-loaded instance
_packing_engine = None

def get_packing_engine():
    """Lazy load packing engine only when needed"""
    global _packing_engine
    if _packing_engine is None:
        print("Loading advanced 3D packing engine...")
        _packing_engine = SmartTruckRecommendation()
    return _packing_engine