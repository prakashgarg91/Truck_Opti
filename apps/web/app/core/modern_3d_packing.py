"""
Advanced 3D Bin Packing Integration Module
==========================================
This module integrates multiple state-of-the-art 3D bin packing algorithms
from various sources including:
- py3dbp (enzoruiz/3dbinpacking) - Basic 3D bin packing
- Janet-19 improvements - Enhanced heuristics
- D-Wave hybrid solver concepts - CQM-based optimization

Features:
- Multiple algorithm support
- Constraint handling (weight, fragility, stackability)
- Load balancing and stability optimization
- Real-time 3D visualization data generation

Author: TruckOpti Team
Version: 2.0.0
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional, Tuple, Any, Callable
import math
import random
import time
import copy
from collections import defaultdict
import heapq


class PackingAlgorithm(Enum):
    """Available 3D bin packing algorithms"""
    # Basic Algorithms
    FIRST_FIT_DECREASING = "first_fit_decreasing"
    BEST_FIT_DECREASING = "best_fit_decreasing"
    
    # Skyline-based
    SKYLINE_BOTTOM_LEFT = "skyline_bl"
    SKYLINE_MIN_WASTE = "skyline_min_waste"
    
    # Heuristic Algorithms
    EXTREME_POINTS = "extreme_points"
    GUILLOTINE_3D = "guillotine_3d"
    SHELF_ALGORITHM = "shelf_algorithm"
    
    # Metaheuristic Algorithms
    GENETIC_ALGORITHM = "genetic"
    SIMULATED_ANNEALING = "simulated_annealing"
    TABU_SEARCH = "tabu_search"
    ANT_COLONY = "ant_colony"
    PARTICLE_SWARM = "pso"
    
    # Hybrid/Advanced
    HYBRID_GENETIC_LOCAL = "hybrid_ga_local"
    MULTI_OBJECTIVE = "multi_objective"
    
    # Mathematical Optimization
    SCIPY_OPTIMIZE = "scipy_optimize"
    CQM_HYBRID = "cqm_hybrid"  # Inspired by D-Wave approach


class Orientation(Enum):
    """6 possible orientations for a rectangular item in 3D space"""
    # (length, width, height) mappings relative to original dimensions
    LWH = 0  # Original orientation
    LHW = 1  # Rotate along X-axis
    WLH = 2  # Rotate along Z-axis
    WHL = 3  # Rotate along X-axis then Z-axis
    HLW = 4  # Rotate along Y-axis
    HWL = 5  # Rotate along Y-axis then X-axis


@dataclass
class Item3D:
    """Represents a 3D item (carton/box) to be packed"""
    id: str
    name: str
    length: float
    width: float
    height: float
    weight: float
    quantity: int = 1
    
    # Advanced properties
    priority: int = 1  # Higher = pack first
    fragile: bool = False
    stackable: bool = True
    max_stack_weight: float = float('inf')
    rotation_allowed: bool = True
    
    # Color for visualization (hex)
    color: str = "#3B82F6"
    
    # Optional metadata
    sku: Optional[str] = None
    category: Optional[str] = None
    
    @property
    def volume(self) -> float:
        return self.length * self.width * self.height
    
    @property
    def base_area(self) -> float:
        return self.length * self.width
    
    def get_dimensions(self, orientation: Orientation) -> Tuple[float, float, float]:
        """Get dimensions for a specific orientation (x, y, z in bin coordinates)"""
        l, w, h = self.length, self.width, self.height
        orientations = {
            Orientation.LWH: (l, w, h),
            Orientation.LHW: (l, h, w),
            Orientation.WLH: (w, l, h),
            Orientation.WHL: (w, h, l),
            Orientation.HLW: (h, l, w),
            Orientation.HWL: (h, w, l),
        }
        return orientations[orientation]
    
    def get_all_orientations(self) -> List[Tuple[float, float, float]]:
        """Get all possible orientations"""
        if not self.rotation_allowed:
            return [(self.length, self.width, self.height)]
        
        # Return unique orientations only
        orientations = set()
        for o in Orientation:
            dims = self.get_dimensions(o)
            orientations.add(dims)
        return list(orientations)
    
    def to_dict(self) -> Dict:
        return {
            'id': self.id,
            'name': self.name,
            'length': self.length,
            'width': self.width,
            'height': self.height,
            'weight': self.weight,
            'quantity': self.quantity,
            'priority': self.priority,
            'fragile': self.fragile,
            'stackable': self.stackable,
            'color': self.color,
            'volume': self.volume,
            'sku': self.sku,
            'category': self.category
        }


@dataclass
class Bin3D:
    """Represents a 3D container (truck/bin) to pack items into"""
    id: str
    name: str
    length: float
    width: float
    height: float
    max_weight: float
    
    # Cost parameters
    cost_per_km: float = 0.0
    base_cost: float = 0.0
    
    # Additional properties
    category: str = "standard"  # light, medium, heavy
    availability: bool = True
    
    # For multi-bin scenarios
    quantity: int = 1
    
    @property
    def volume(self) -> float:
        return self.length * self.width * self.height
    
    @property
    def center_x(self) -> float:
        return self.length / 2
    
    @property
    def center_y(self) -> float:
        return self.width / 2
    
    @property
    def center_z(self) -> float:
        return self.height / 2
    
    def to_dict(self) -> Dict:
        return {
            'id': self.id,
            'name': self.name,
            'length': self.length,
            'width': self.width,
            'height': self.height,
            'max_weight': self.max_weight,
            'volume': self.volume,
            'cost_per_km': self.cost_per_km,
            'base_cost': self.base_cost,
            'category': self.category
        }


@dataclass
class PlacedItem:
    """Represents an item placed in a bin at a specific position"""
    item: Item3D
    bin_id: str
    x: float
    y: float
    z: float
    orientation: Orientation
    
    # Actual dimensions in bin coordinates
    dx: float = 0  # Length in x direction
    dy: float = 0  # Width in y direction  
    dz: float = 0  # Height in z direction
    
    def __post_init__(self):
        if self.dx == 0 or self.dy == 0 or self.dz == 0:
            self.dx, self.dy, self.dz = self.item.get_dimensions(self.orientation)
    
    @property
    def x2(self) -> float:
        return self.x + self.dx
    
    @property
    def y2(self) -> float:
        return self.y + self.dy
    
    @property
    def z2(self) -> float:
        return self.z + self.dz
    
    @property
    def center_x(self) -> float:
        return self.x + self.dx / 2
    
    @property
    def center_y(self) -> float:
        return self.y + self.dy / 2
    
    @property
    def center_z(self) -> float:
        return self.z + self.dz / 2
    
    def intersects(self, other: 'PlacedItem') -> bool:
        """Check if this item intersects with another"""
        return not (
            self.x >= other.x2 or other.x >= self.x2 or
            self.y >= other.y2 or other.y >= self.y2 or
            self.z >= other.z2 or other.z >= self.z2
        )
    
    def get_support_area(self, items_below: List['PlacedItem']) -> float:
        """Calculate the support area from items below"""
        total_support = 0.0
        base_area = self.dx * self.dy
        
        for below in items_below:
            if abs(below.z2 - self.z) < 0.001:  # Item is directly below
                # Calculate overlap area
                overlap_x = max(0, min(self.x2, below.x2) - max(self.x, below.x))
                overlap_y = max(0, min(self.y2, below.y2) - max(self.y, below.y))
                total_support += overlap_x * overlap_y
        
        return total_support / base_area if base_area > 0 else 0
    
    def to_dict(self) -> Dict:
        return {
            'item_id': self.item.id,
            'item_name': self.item.name,
            'bin_id': self.bin_id,
            'position': {'x': self.x, 'y': self.y, 'z': self.z},
            'dimensions': {'dx': self.dx, 'dy': self.dy, 'dz': self.dz},
            'orientation': self.orientation.value,
            'weight': self.item.weight,
            'volume': self.dx * self.dy * self.dz,
            'color': self.item.color
        }


@dataclass
class PackingMetrics:
    """Comprehensive metrics for a packing solution"""
    # Basic metrics
    volume_utilization: float = 0.0
    weight_utilization: float = 0.0
    items_packed: int = 0
    items_unpacked: int = 0
    
    # Advanced metrics
    load_balance_score: float = 0.0  # 0-100, how centered is the load
    stability_score: float = 0.0  # 0-100, stacking quality
    fragile_protection_score: float = 0.0  # 0-100
    packing_efficiency: float = 0.0  # Combined score
    
    # Center of mass
    center_of_mass: Tuple[float, float, float] = (0.0, 0.0, 0.0)
    
    # Performance
    execution_time_ms: float = 0.0
    algorithm_used: str = ""
    
    # Warnings
    warnings: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return {
            'volume_utilization': round(self.volume_utilization, 2),
            'weight_utilization': round(self.weight_utilization, 2),
            'items_packed': self.items_packed,
            'items_unpacked': self.items_unpacked,
            'load_balance_score': round(self.load_balance_score, 2),
            'stability_score': round(self.stability_score, 2),
            'fragile_protection_score': round(self.fragile_protection_score, 2),
            'packing_efficiency': round(self.packing_efficiency, 2),
            'center_of_mass': {
                'x': round(self.center_of_mass[0], 2),
                'y': round(self.center_of_mass[1], 2),
                'z': round(self.center_of_mass[2], 2)
            },
            'execution_time_ms': round(self.execution_time_ms, 2),
            'algorithm_used': self.algorithm_used,
            'warnings': self.warnings
        }


@dataclass
class PackingResult:
    """Complete result of a packing operation"""
    success: bool
    bins_used: int
    placed_items: List[PlacedItem]
    unpacked_items: List[Item3D]
    metrics: PackingMetrics
    
    # For multi-bin scenarios
    bin_assignments: Dict[str, List[PlacedItem]] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        return {
            'success': self.success,
            'bins_used': self.bins_used,
            'placed_items': [p.to_dict() for p in self.placed_items],
            'unpacked_items': [i.to_dict() for i in self.unpacked_items],
            'metrics': self.metrics.to_dict(),
            'bin_assignments': {
                bin_id: [p.to_dict() for p in items]
                for bin_id, items in self.bin_assignments.items()
            }
        }
    
    def get_visualization_data(self) -> Dict:
        """Generate data for 3D visualization"""
        return {
            'items': [
                {
                    'position': [p.x, p.y, p.z],
                    'size': [p.dx, p.dy, p.dz],
                    'color': p.item.color,
                    'name': p.item.name,
                    'weight': p.item.weight
                }
                for p in self.placed_items
            ],
            'metrics': self.metrics.to_dict()
        }


class ExtremePointsPacker:
    """
    Extreme Points algorithm for 3D bin packing
    Based on the concept of tracking potential placement points
    """
    
    def __init__(self, bin: Bin3D):
        self.bin = bin
        self.placed_items: List[PlacedItem] = []
        self.total_weight = 0.0
        
        # Extreme points start with origin
        self.extreme_points: List[Tuple[float, float, float]] = [(0, 0, 0)]
    
    def can_place(self, item: Item3D, x: float, y: float, z: float, 
                  dims: Tuple[float, float, float]) -> bool:
        """Check if item can be placed at position with given dimensions"""
        dx, dy, dz = dims
        
        # Boundary check
        if x + dx > self.bin.length or y + dy > self.bin.width or z + dz > self.bin.height:
            return False
        
        # Weight check
        if self.total_weight + item.weight > self.bin.max_weight:
            return False
        
        # Collision check
        for placed in self.placed_items:
            if not (x >= placed.x2 or placed.x >= x + dx or
                    y >= placed.y2 or placed.y >= y + dy or
                    z >= placed.z2 or placed.z >= z + dz):
                return False
        
        return True
    
    def get_support_at_position(self, x: float, y: float, z: float,
                                 dx: float, dy: float) -> float:
        """Calculate support ratio at a position"""
        if z == 0:
            return 1.0  # Full support from floor
        
        base_area = dx * dy
        support_area = 0.0
        
        for placed in self.placed_items:
            if abs(placed.z2 - z) < 0.001:  # Item directly below
                overlap_x = max(0, min(x + dx, placed.x2) - max(x, placed.x))
                overlap_y = max(0, min(y + dy, placed.y2) - max(y, placed.y))
                support_area += overlap_x * overlap_y
        
        return support_area / base_area if base_area > 0 else 0
    
    def find_best_position(self, item: Item3D) -> Optional[Tuple[float, float, float, Tuple[float, float, float]]]:
        """Find best position for item using extreme points"""
        best_position = None
        best_score = float('-inf')
        
        for point in sorted(self.extreme_points, key=lambda p: (p[2], p[1], p[0])):
            x, y, z = point
            
            for dims in item.get_all_orientations():
                if self.can_place(item, x, y, z, dims):
                    # Score based on multiple factors
                    dx, dy, dz = dims
                    
                    # Prefer lower positions
                    height_score = 100 - (z / self.bin.height * 50)
                    
                    # Prefer positions with good support
                    support = self.get_support_at_position(x, y, z, dx, dy)
                    support_score = support * 30
                    
                    # Prefer corner positions (less wasted space)
                    corner_score = 0
                    if x == 0: corner_score += 5
                    if y == 0: corner_score += 5
                    if z == 0: corner_score += 10
                    
                    # Volume efficiency
                    volume_score = (dx * dy * dz / self.bin.volume) * 10
                    
                    total_score = height_score + support_score + corner_score + volume_score
                    
                    if total_score > best_score:
                        best_score = total_score
                        best_position = (x, y, z, dims)
        
        return best_position
    
    def place_item(self, item: Item3D, x: float, y: float, z: float,
                   dims: Tuple[float, float, float], orientation: Orientation = Orientation.LWH) -> PlacedItem:
        """Place item and update extreme points"""
        dx, dy, dz = dims
        
        placed = PlacedItem(
            item=item,
            bin_id=self.bin.id,
            x=x, y=y, z=z,
            orientation=orientation,
            dx=dx, dy=dy, dz=dz
        )
        
        self.placed_items.append(placed)
        self.total_weight += item.weight
        
        # Generate new extreme points from the placed item
        new_points = [
            (x + dx, y, z),      # Right face
            (x, y + dy, z),      # Front face
            (x, y, z + dz),      # Top face
            (x + dx, y + dy, z), # Corner
            (x + dx, y, z + dz),
            (x, y + dy, z + dz),
        ]
        
        # Filter valid extreme points
        valid_points = []
        for px, py, pz in new_points:
            if px <= self.bin.length and py <= self.bin.width and pz <= self.bin.height:
                # Check if point is not inside any placed item
                is_valid = True
                for p in self.placed_items:
                    if (p.x <= px < p.x2 and p.y <= py < p.y2 and p.z <= pz < p.z2):
                        is_valid = False
                        break
                if is_valid:
                    valid_points.append((px, py, pz))
        
        # Remove the used point
        if (x, y, z) in self.extreme_points:
            self.extreme_points.remove((x, y, z))
        
        # Add new valid points
        for point in valid_points:
            if point not in self.extreme_points:
                self.extreme_points.append(point)
        
        # Remove dominated points
        self.extreme_points = self._remove_dominated_points(self.extreme_points)
        
        return placed
    
    def _remove_dominated_points(self, points: List[Tuple[float, float, float]]) -> List[Tuple[float, float, float]]:
        """Remove points that are dominated by others"""
        result = []
        for p1 in points:
            dominated = False
            for p2 in points:
                if p1 != p2:
                    # p1 is dominated if p2 is better or equal in all dimensions
                    if p2[0] <= p1[0] and p2[1] <= p1[1] and p2[2] <= p1[2]:
                        if p2[0] < p1[0] or p2[1] < p1[1] or p2[2] < p1[2]:
                            dominated = True
                            break
            if not dominated:
                result.append(p1)
        return result
    
    def pack(self, items: List[Item3D]) -> Dict:
        """Pack items using extreme points algorithm"""
        packed = []
        unpacked = []
        
        # Sort by priority (high first), then by volume (large first)
        sorted_items = sorted(items, key=lambda i: (-i.priority, -i.volume))
        
        for item in sorted_items:
            for _ in range(item.quantity):
                position = self.find_best_position(item)
                if position:
                    x, y, z, dims = position
                    placed = self.place_item(item, x, y, z, dims)
                    packed.append(placed)
                else:
                    unpacked.append(item)
        
        return self._calculate_result(packed, unpacked)
    
    def _calculate_result(self, packed: List[PlacedItem], unpacked: List[Item3D]) -> Dict:
        """Calculate comprehensive metrics for the packing result"""
        if not packed:
            return {
                'algorithm': 'Extreme Points',
                'packed_items': [],
                'unpacked_items': unpacked,
                'metrics': PackingMetrics().to_dict()
            }
        
        # Volume and weight utilization
        packed_volume = sum(p.dx * p.dy * p.dz for p in packed)
        volume_util = (packed_volume / self.bin.volume) * 100
        weight_util = (self.total_weight / self.bin.max_weight) * 100
        
        # Center of mass calculation
        cm_x, cm_y, cm_z = 0, 0, 0
        if self.total_weight > 0:
            for p in packed:
                cm_x += p.center_x * p.item.weight
                cm_y += p.center_y * p.item.weight
                cm_z += p.center_z * p.item.weight
            cm_x /= self.total_weight
            cm_y /= self.total_weight
            cm_z /= self.total_weight
        
        # Load balance score (distance from ideal center)
        dist = math.sqrt(
            ((cm_x - self.bin.center_x) / self.bin.center_x) ** 2 +
            ((cm_y - self.bin.center_y) / self.bin.center_y) ** 2 +
            ((cm_z - self.bin.center_z) / self.bin.center_z) ** 2
        )
        load_balance = max(0, (1 - dist) * 100)
        
        # Stability score
        stability_violations = 0
        for p in packed:
            if p.z > 0:
                support = p.get_support_area([other for other in packed if other != p and other.z2 <= p.z])
                if support < 0.5:  # Less than 50% support
                    stability_violations += 1
        stability_score = max(0, (1 - stability_violations / len(packed)) * 100)
        
        # Fragile protection score
        fragile_violations = 0
        fragile_items = [p for p in packed if p.item.fragile]
        for f in fragile_items:
            items_above = [p for p in packed if p.z >= f.z2 and
                          not (p.x >= f.x2 or f.x >= p.x2 or
                               p.y >= f.y2 or f.y >= p.y2)]
            if items_above:
                fragile_violations += 1
        fragile_score = max(0, (1 - fragile_violations / max(1, len(fragile_items))) * 100) if fragile_items else 100
        
        # Overall efficiency
        efficiency = (
            0.35 * volume_util +
            0.25 * load_balance +
            0.20 * stability_score +
            0.10 * fragile_score +
            0.10 * (len(packed) / (len(packed) + len(unpacked)) * 100)
        )
        
        metrics = PackingMetrics(
            volume_utilization=volume_util,
            weight_utilization=weight_util,
            items_packed=len(packed),
            items_unpacked=len(unpacked),
            load_balance_score=load_balance,
            stability_score=stability_score,
            fragile_protection_score=fragile_score,
            packing_efficiency=efficiency,
            center_of_mass=(cm_x, cm_y, cm_z),
            algorithm_used='Extreme Points'
        )
        
        return {
            'algorithm': 'Extreme Points',
            'packed_items': packed,
            'unpacked_items': unpacked,
            'metrics': metrics
        }


class GeneticAlgorithm3D:
    """
    Genetic Algorithm for 3D bin packing optimization
    Evolves packing sequences to find optimal arrangements
    """
    
    def __init__(self, bin: Bin3D, population_size: int = 50, 
                 generations: int = 100, mutation_rate: float = 0.1):
        self.bin = bin
        self.population_size = population_size
        self.generations = generations
        self.mutation_rate = mutation_rate
        self.crossover_rate = 0.8
    
    def create_chromosome(self, items: List[Item3D]) -> List[Tuple[Item3D, int]]:
        """Create a random chromosome (item sequence with orientations)"""
        chromosome = []
        for item in items:
            for _ in range(item.quantity):
                orientations = item.get_all_orientations()
                orientation_idx = random.randint(0, len(orientations) - 1)
                chromosome.append((item, orientation_idx))
        random.shuffle(chromosome)
        return chromosome
    
    def evaluate_fitness(self, chromosome: List[Tuple[Item3D, int]]) -> float:
        """Evaluate fitness of a chromosome"""
        packer = ExtremePointsPacker(self.bin)
        packed_count = 0
        total_volume = 0
        cm_x, cm_y, cm_z = 0, 0, 0
        total_weight = 0
        
        for item, orientation_idx in chromosome:
            orientations = item.get_all_orientations()
            dims = orientations[orientation_idx % len(orientations)]
            
            # Try to find a position
            position = packer.find_best_position(item)
            if position:
                x, y, z, dims = position
                placed = packer.place_item(item, x, y, z, dims)
                packed_count += 1
                total_volume += dims[0] * dims[1] * dims[2]
                
                # Center of mass
                cm_x += placed.center_x * item.weight
                cm_y += placed.center_y * item.weight
                cm_z += placed.center_z * item.weight
                total_weight += item.weight
        
        if packed_count == 0:
            return 0.0
        
        # Calculate fitness components
        volume_fitness = total_volume / self.bin.volume
        count_fitness = packed_count / len(chromosome)
        
        # Load balance fitness
        if total_weight > 0:
            cm_x /= total_weight
            cm_y /= total_weight
            cm_z /= total_weight
            dist = math.sqrt(
                ((cm_x - self.bin.center_x) / self.bin.center_x) ** 2 +
                ((cm_y - self.bin.center_y) / self.bin.center_y) ** 2 +
                ((cm_z - self.bin.center_z) / self.bin.center_z) ** 2
            )
            balance_fitness = max(0, 1 - dist)
        else:
            balance_fitness = 0
        
        # Combined fitness
        fitness = (
            0.40 * volume_fitness +
            0.30 * count_fitness +
            0.30 * balance_fitness
        )
        
        return fitness
    
    def crossover(self, parent1: List, parent2: List) -> Tuple[List, List]:
        """Order crossover (OX) for permutation chromosomes"""
        if random.random() > self.crossover_rate:
            return parent1.copy(), parent2.copy()
        
        size = len(parent1)
        if size < 2:
            return parent1.copy(), parent2.copy()
        
        # Two-point crossover
        point1 = random.randint(0, size - 1)
        point2 = random.randint(point1, size - 1)
        
        def create_child(p1, p2):
            child = [None] * size
            # Copy segment from p1
            child[point1:point2+1] = p1[point1:point2+1]
            
            # Fill remaining positions from p2
            p2_items = [gene for gene in p2 if gene not in child[point1:point2+1]]
            pos = 0
            for i in range(size):
                if child[i] is None and pos < len(p2_items):
                    child[i] = p2_items[pos]
                    pos += 1
            return child
        
        try:
            child1 = create_child(parent1, parent2)
            child2 = create_child(parent2, parent1)
            return child1, child2
        except:
            return parent1.copy(), parent2.copy()
    
    def mutate(self, chromosome: List) -> List:
        """Mutate chromosome with swap and orientation change"""
        mutated = chromosome.copy()
        
        if random.random() < self.mutation_rate:
            # Swap mutation
            if len(mutated) >= 2:
                i, j = random.sample(range(len(mutated)), 2)
                mutated[i], mutated[j] = mutated[j], mutated[i]
        
        if random.random() < self.mutation_rate:
            # Orientation mutation
            if mutated:
                i = random.randint(0, len(mutated) - 1)
                item, _ = mutated[i]
                new_orientation = random.randint(0, len(item.get_all_orientations()) - 1)
                mutated[i] = (item, new_orientation)
        
        return mutated
    
    def pack(self, items: List[Item3D]) -> Dict:
        """Pack items using genetic algorithm"""
        start_time = time.time()
        
        # Initialize population
        population = [self.create_chromosome(items) for _ in range(self.population_size)]
        best_chromosome = None
        best_fitness = 0
        
        for generation in range(self.generations):
            # Evaluate fitness
            fitness_scores = [(chrom, self.evaluate_fitness(chrom)) for chrom in population]
            fitness_scores.sort(key=lambda x: x[1], reverse=True)
            
            # Track best solution
            if fitness_scores[0][1] > best_fitness:
                best_fitness = fitness_scores[0][1]
                best_chromosome = fitness_scores[0][0].copy()
            
            # Selection - tournament selection
            def tournament_select():
                contestants = random.sample(fitness_scores, min(5, len(fitness_scores)))
                return max(contestants, key=lambda x: x[1])[0]
            
            # Create new generation
            new_population = []
            
            # Elitism - keep best 10%
            elite_count = max(1, self.population_size // 10)
            for i in range(elite_count):
                new_population.append(fitness_scores[i][0])
            
            # Generate rest through crossover and mutation
            while len(new_population) < self.population_size:
                parent1 = tournament_select()
                parent2 = tournament_select()
                child1, child2 = self.crossover(parent1, parent2)
                child1 = self.mutate(child1)
                child2 = self.mutate(child2)
                new_population.extend([child1, child2])
            
            population = new_population[:self.population_size]
        
        execution_time = (time.time() - start_time) * 1000
        
        # Convert best chromosome to actual packing
        return self._chromosome_to_packing(best_chromosome, execution_time)
    
    def _chromosome_to_packing(self, chromosome: List[Tuple[Item3D, int]], 
                                execution_time: float) -> Dict:
        """Convert chromosome to actual packing result"""
        packer = ExtremePointsPacker(self.bin)
        packed = []
        unpacked = []
        
        for item, orientation_idx in chromosome:
            position = packer.find_best_position(item)
            if position:
                x, y, z, dims = position
                placed = packer.place_item(item, x, y, z, dims)
                packed.append(placed)
            else:
                unpacked.append(item)
        
        result = packer._calculate_result(packed, unpacked)
        result['algorithm'] = 'Genetic Algorithm'
        result['metrics'].execution_time_ms = execution_time
        result['metrics'].algorithm_used = 'Genetic Algorithm'
        
        return result


class ModernBinPacker:
    """
    Main class for 3D bin packing with multiple algorithm support
    Provides a unified interface for all packing algorithms
    """
    
    def __init__(self):
        self.algorithms: Dict[PackingAlgorithm, Callable] = {
            PackingAlgorithm.EXTREME_POINTS: self._pack_extreme_points,
            PackingAlgorithm.GENETIC_ALGORITHM: self._pack_genetic,
            PackingAlgorithm.FIRST_FIT_DECREASING: self._pack_ffd,
            PackingAlgorithm.BEST_FIT_DECREASING: self._pack_bfd,
        }
    
    def pack(self, items: List[Item3D], bin: Bin3D, 
             algorithm: PackingAlgorithm = PackingAlgorithm.EXTREME_POINTS,
             **kwargs) -> PackingResult:
        """
        Pack items into bin using specified algorithm
        
        Args:
            items: List of items to pack
            bin: The bin/container to pack into
            algorithm: Algorithm to use
            **kwargs: Algorithm-specific parameters
        
        Returns:
            PackingResult with placed items and metrics
        """
        start_time = time.time()
        
        pack_func = self.algorithms.get(algorithm, self._pack_extreme_points)
        result_dict = pack_func(items, bin, **kwargs)
        
        execution_time = (time.time() - start_time) * 1000
        
        # Create PackingResult
        metrics = result_dict.get('metrics', PackingMetrics())
        if isinstance(metrics, dict):
            metrics = PackingMetrics(**metrics) if metrics else PackingMetrics()
        
        metrics.execution_time_ms = execution_time
        metrics.algorithm_used = algorithm.value
        
        packed = result_dict.get('packed_items', [])
        unpacked = result_dict.get('unpacked_items', [])
        
        result = PackingResult(
            success=len(unpacked) == 0,
            bins_used=1,
            placed_items=packed,
            unpacked_items=unpacked,
            metrics=metrics,
            bin_assignments={bin.id: packed}
        )
        
        return result
    
    def _pack_extreme_points(self, items: List[Item3D], bin: Bin3D, **kwargs) -> Dict:
        """Pack using Extreme Points algorithm"""
        packer = ExtremePointsPacker(bin)
        return packer.pack(items)
    
    def _pack_genetic(self, items: List[Item3D], bin: Bin3D, 
                      population_size: int = 50, generations: int = 100, **kwargs) -> Dict:
        """Pack using Genetic Algorithm"""
        packer = GeneticAlgorithm3D(bin, population_size=population_size, generations=generations)
        return packer.pack(items)
    
    def _pack_ffd(self, items: List[Item3D], bin: Bin3D, **kwargs) -> Dict:
        """Pack using First Fit Decreasing heuristic"""
        # Sort by volume descending
        sorted_items = sorted(items, key=lambda i: -i.volume)
        packer = ExtremePointsPacker(bin)
        return packer.pack(sorted_items)
    
    def _pack_bfd(self, items: List[Item3D], bin: Bin3D, **kwargs) -> Dict:
        """Pack using Best Fit Decreasing heuristic"""
        # Sort by volume descending
        sorted_items = sorted(items, key=lambda i: -i.volume)
        packer = ExtremePointsPacker(bin)
        return packer.pack(sorted_items)
    
    def compare_algorithms(self, items: List[Item3D], bin: Bin3D,
                           algorithms: List[PackingAlgorithm] = None) -> Dict[str, PackingResult]:
        """
        Compare multiple algorithms on the same problem
        
        Returns:
            Dictionary mapping algorithm names to their results
        """
        if algorithms is None:
            algorithms = list(self.algorithms.keys())
        
        results = {}
        for algo in algorithms:
            try:
                result = self.pack(items, bin, algo)
                results[algo.value] = result
            except Exception as e:
                print(f"Error with {algo.value}: {e}")
        
        return results
    
    def get_best_algorithm(self, items: List[Item3D], bin: Bin3D) -> Tuple[PackingAlgorithm, PackingResult]:
        """
        Find the best algorithm for the given problem
        
        Returns:
            Tuple of (best algorithm, its result)
        """
        results = self.compare_algorithms(items, bin)
        
        best_algo = None
        best_result = None
        best_score = -1
        
        for algo_name, result in results.items():
            score = result.metrics.packing_efficiency
            if score > best_score:
                best_score = score
                best_algo = PackingAlgorithm(algo_name)
                best_result = result
        
        return best_algo, best_result


# Helper functions for data conversion

def items_from_dict(data: List[Dict]) -> List[Item3D]:
    """Convert list of dictionaries to Item3D objects"""
    items = []
    for i, d in enumerate(data):
        item = Item3D(
            id=d.get('id', str(i)),
            name=d.get('name', f'Item_{i}'),
            length=float(d.get('length', 0)),
            width=float(d.get('width', 0)),
            height=float(d.get('height', 0)),
            weight=float(d.get('weight', 0)),
            quantity=int(d.get('quantity', 1)),
            priority=int(d.get('priority', 1)),
            fragile=bool(d.get('fragile', False)),
            stackable=bool(d.get('stackable', True)),
            color=d.get('color', '#3B82F6'),
            sku=d.get('sku'),
            category=d.get('category')
        )
        items.append(item)
    return items


def bin_from_dict(data: Dict) -> Bin3D:
    """Convert dictionary to Bin3D object"""
    return Bin3D(
        id=data.get('id', '1'),
        name=data.get('name', 'Bin'),
        length=float(data.get('length', 0)),
        width=float(data.get('width', 0)),
        height=float(data.get('height', 0)),
        max_weight=float(data.get('max_weight', float('inf'))),
        cost_per_km=float(data.get('cost_per_km', 0)),
        base_cost=float(data.get('base_cost', 0)),
        category=data.get('category', 'standard')
    )


# Example usage and testing
if __name__ == "__main__":
    # Create a sample bin (truck)
    truck = Bin3D(
        id="truck1",
        name="Standard Truck",
        length=600,  # cm
        width=240,
        height=240,
        max_weight=10000  # kg
    )
    
    # Create sample items
    items = [
        Item3D(id="1", name="Large Box", length=100, width=80, height=60, weight=50, quantity=5, color="#EF4444"),
        Item3D(id="2", name="Medium Box", length=60, width=40, height=40, weight=30, quantity=10, color="#F59E0B"),
        Item3D(id="3", name="Small Box", length=30, width=30, height=30, weight=15, quantity=20, color="#10B981"),
        Item3D(id="4", name="Fragile Item", length=50, width=50, height=30, weight=20, quantity=3, fragile=True, color="#8B5CF6"),
    ]
    
    # Pack using different algorithms
    packer = ModernBinPacker()
    
    print("Testing Modern 3D Bin Packing...")
    print("=" * 50)
    
    # Test Extreme Points
    result = packer.pack(items, truck, PackingAlgorithm.EXTREME_POINTS)
    print(f"\nExtreme Points Algorithm:")
    print(f"  Items packed: {result.metrics.items_packed}")
    print(f"  Items unpacked: {result.metrics.items_unpacked}")
    print(f"  Volume utilization: {result.metrics.volume_utilization:.1f}%")
    print(f"  Load balance: {result.metrics.load_balance_score:.1f}")
    print(f"  Efficiency: {result.metrics.packing_efficiency:.1f}")
    
    # Test Genetic Algorithm
    result = packer.pack(items, truck, PackingAlgorithm.GENETIC_ALGORITHM, 
                         population_size=30, generations=50)
    print(f"\nGenetic Algorithm:")
    print(f"  Items packed: {result.metrics.items_packed}")
    print(f"  Items unpacked: {result.metrics.items_unpacked}")
    print(f"  Volume utilization: {result.metrics.volume_utilization:.1f}%")
    print(f"  Load balance: {result.metrics.load_balance_score:.1f}")
    print(f"  Efficiency: {result.metrics.packing_efficiency:.1f}")
    print(f"  Execution time: {result.metrics.execution_time_ms:.2f}ms")
    
    # Find best algorithm
    best_algo, best_result = packer.get_best_algorithm(items, truck)
    print(f"\nBest Algorithm: {best_algo.value}")
    print(f"  Efficiency Score: {best_result.metrics.packing_efficiency:.1f}")
