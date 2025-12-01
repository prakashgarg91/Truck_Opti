# Advanced 3D Bin Packing Integration Plan

## Executive Summary

This document outlines a comprehensive plan to integrate three advanced 3D bin packing solutions into TruckOptimum to enhance packing capabilities, improve optimization quality, and provide cutting-edge algorithmic options.

---

## 📊 Repository Analysis

### 1. enzoruiz/3dbinpacking (py3dbp)
| Attribute | Details |
|-----------|---------|
| **Stars** | 423 ⭐ |
| **License** | MIT (✅ Commercial friendly) |
| **Language** | Python |
| **Install** | `pip install py3dbp` |
| **Algorithm** | Heuristic-based (Dube paper) |
| **Complexity** | Low |
| **Dependencies** | None (pure Python) |

**Key Features:**
- Simple Packer/Bin/Item API
- 6 rotation types for items
- Sorting options (bigger_first)
- Item distribution across multiple bins
- Decimal precision control
- Fitted/unfitted item tracking

**Strengths:**
- ✅ Already integrated in your `apps/web/app/packer.py`
- ✅ Simple, fast, reliable
- ✅ No external dependencies
- ✅ MIT License - commercial friendly

**Limitations:**
- ❌ No load balancing/weight distribution
- ❌ No fragile item handling
- ❌ No stacking constraints
- ❌ Basic heuristic only

---

### 2. Janet-19/3d-bin-packing-problem
| Attribute | Details |
|-----------|---------|
| **Stars** | 127 ⭐ |
| **License** | None specified (⚠️ Risk) |
| **Language** | Python/Jupyter Notebook |
| **Algorithm** | Genetic Algorithm + Heuristics |
| **Complexity** | Medium |
| **Dependencies** | Based on py3dbp |

**Key Features:**
- Mathematical formulation of 3D-BPP
- Orientation selection module
- Placement selection module (pivot points)
- Improved packing rate over base py3dbp
- Best bin selection based on packing rate

**Algorithm Logic:**
```
1. Sort items biggest → smallest
2. For each item:
   a. Try all 6 orientations
   b. Find best pivot point (back-lower-left corner)
   c. Select best orientation + placement combination
3. Choose bin with highest packing rate
```

**Strengths:**
- ✅ Better packing rates than base py3dbp
- ✅ Academic foundation (Li et al., 2014)
- ✅ Pivot-based placement selection

**Limitations:**
- ⚠️ **NO LICENSE** - Cannot use commercially without permission
- ❌ Jupyter Notebook format (needs conversion)
- ❌ No weight/stability constraints
- ❌ No multi-objective optimization

---

### 3. dwave-examples/3d-bin-packing (Quantum/Hybrid)
| Attribute | Details |
|-----------|---------|
| **Stars** | 115 ⭐ |
| **License** | Apache 2.0 (✅ Commercial friendly) |
| **Language** | Python |
| **Algorithm** | Constrained Quadratic Model (CQM) |
| **Complexity** | High |
| **Solvers** | D-Wave Quantum + SciPy HiGHS |

**Key Features:**
- Mathematical optimization (not heuristic)
- Multi-objective: minimize bins + minimize height
- Exact geometric constraints (no overlap guarantee)
- Orientation constraints (1 of 6 per item)
- Bin assignment constraints
- Boundary constraints
- **Two solver options:**
  1. D-Wave Leap Hybrid CQM Solver (cloud quantum)
  2. SciPy MILP Solver (local, free)

**Mathematical Model:**
```
Variables:
- v_j: binary - bin j is used
- u_(i,j): binary - case i in bin j
- r_(i,k): binary - orientation k for case i
- x_i, y_i, z_i: continuous - position of case i
- s_j: continuous - height in bin j

Objectives:
1. Minimize average case height
2. Minimize max height per bin
3. Minimize number of bins used

Constraints:
- Each case has exactly 1 orientation
- Each case goes to exactly 1 bin
- No overlap between cases (6 directional checks)
- Cases within bin boundaries
```

**Strengths:**
- ✅ **Mathematical optimality** (not just heuristic)
- ✅ Apache 2.0 License - commercial OK
- ✅ **Dual solver**: quantum cloud OR local SciPy
- ✅ Guarantees no overlapping
- ✅ Multi-bin optimization
- ✅ Well-tested with unit tests

**Limitations:**
- ❌ Requires `dimod`, `dwave-system` dependencies
- ❌ Quantum solver requires D-Wave Leap account ($)
- ❌ SciPy solver limited to ~50 items (exponential scaling)
- ❌ No fragile/weight distribution (basic model)
- ❌ Higher computational complexity

---

## 🎯 Integration Recommendation

### Priority Matrix

| Repository | Recommend | Reason |
|------------|-----------|--------|
| **py3dbp** | ✅ Keep (Already integrated) | Fast, simple, reliable baseline |
| **Janet-19** | ⚠️ Partial (Concepts only) | No license - extract ideas only |
| **D-Wave** | ✅ **HIGH PRIORITY** | Best quality, Apache license, dual solver |

### Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TruckOptimum Packing Engine                  │
├─────────────────────────────────────────────────────────────────┤
│                      Algorithm Selector                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │   py3dbp    │ │  Advanced   │ │   D-Wave    │ │  D-Wave    │ │
│  │  (Current)  │ │  Heuristic  │ │   SciPy     │ │  Quantum   │ │
│  │   Fast      │ │  Enhanced   │ │   MILP      │ │   CQM      │ │
│  │  ~10ms      │ │  ~100ms     │ │  ~5-30s     │ │  ~20s      │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
│       ↑               ↑               ↑               ↑         │
│   Small jobs     Medium jobs     Large jobs      Premium tier   │
│   <50 items     50-200 items    <50 items*      Cloud account   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Detailed Integration Plan

### Phase 1: D-Wave SciPy Solver Integration (Week 1-2)
**Priority: HIGH | License: Apache 2.0 ✅**

#### 1.1 Dependencies Installation
```bash
# Add to requirements.txt
dimod>=0.12.0
dwave-system>=1.18.0  # Optional - only for quantum
numpy>=1.24.0
scipy>=1.11.0
tabulate>=0.9.0
```

#### 1.2 Create Adapter Module
**File:** `apps/web/app/core/dwave_packing_adapter.py`

```python
"""
D-Wave 3D Bin Packing Adapter for TruckOptimum
Integrates mathematical optimization via CQM model
"""

from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import numpy as np
from itertools import combinations, permutations

# D-Wave imports
from dimod import Binary, ConstrainedQuadraticModel, Real, quicksum

# Local solver (no cloud required)
import scipy.optimize


@dataclass
class DWaveCase:
    """Case/carton representation for D-Wave solver"""
    id: int
    name: str
    length: float
    width: float
    height: float
    weight: float
    quantity: int = 1


@dataclass  
class DWaveBin:
    """Bin/truck representation for D-Wave solver"""
    id: int
    name: str
    length: float
    width: float
    height: float
    max_weight: float


class DWavePackingSolver:
    """
    3D Bin Packing using Constrained Quadratic Model
    Supports local SciPy solver (free) or D-Wave Quantum (cloud)
    """
    
    def __init__(self, use_quantum: bool = False, time_limit: float = 20.0):
        self.use_quantum = use_quantum
        self.time_limit = time_limit
        
    def solve(self, cases: List[DWaveCase], bins: List[DWaveBin]) -> Dict:
        """
        Solve 3D bin packing problem
        
        Args:
            cases: List of cases to pack
            bins: List of available bins (same dimensions assumed)
            
        Returns:
            Solution dictionary with placements and metrics
        """
        # Expand quantities
        expanded_cases = self._expand_cases(cases)
        
        # Build CQM model
        cqm, variables, effective_dims = self._build_cqm(expanded_cases, bins[0])
        
        # Solve
        if self.use_quantum:
            solution = self._solve_quantum(cqm)
        else:
            solution = self._solve_scipy(cqm)
            
        # Parse results
        return self._parse_solution(solution, variables, expanded_cases, bins[0], effective_dims)
    
    def _expand_cases(self, cases: List[DWaveCase]) -> List[DWaveCase]:
        """Expand cases by quantity"""
        expanded = []
        for case in cases:
            for i in range(case.quantity):
                expanded.append(DWaveCase(
                    id=len(expanded),
                    name=f"{case.name}_{i}",
                    length=case.length,
                    width=case.width,
                    height=case.height,
                    weight=case.weight,
                    quantity=1
                ))
        return expanded
    
    def _build_cqm(self, cases: List[DWaveCase], bin_template: DWaveBin) -> Tuple:
        """Build Constrained Quadratic Model"""
        num_cases = len(cases)
        num_bins = self._estimate_bins_needed(cases, bin_template)
        
        cqm = ConstrainedQuadraticModel()
        
        # Variables
        x = {i: Real(f"x_{i}", lower_bound=0, upper_bound=bin_template.length * num_bins) 
             for i in range(num_cases)}
        y = {i: Real(f"y_{i}", lower_bound=0, upper_bound=bin_template.width) 
             for i in range(num_cases)}
        z = {i: Real(f"z_{i}", lower_bound=0, upper_bound=bin_template.height) 
             for i in range(num_cases)}
        
        # Orientation variables (6 possible orientations)
        o = {(i, k): Binary(f"o_{i}_{k}") for i in range(num_cases) for k in range(6)}
        
        # Bin assignment
        bin_loc = {(i, j): Binary(f"case_{i}_in_bin_{j}") 
                   for i in range(num_cases) for j in range(num_bins)}
        
        # Bin usage
        bin_on = {j: Binary(f"bin_{j}_is_used") for j in range(num_bins)}
        
        # Geometric relation selectors
        selector = {(i, k, s): Binary(f"sel_{i}_{k}_{s}")
                    for i, k in combinations(range(num_cases), r=2) for s in range(6)}
        
        # Bin heights
        bin_height = {j: Real(f"upper_bound_{j}", upper_bound=bin_template.height) 
                      for j in range(num_bins)}
        
        # Effective dimensions based on orientation
        dx, dy, dz = {}, {}, {}
        for i in range(num_cases):
            perms = list(permutations([cases[i].length, cases[i].width, cases[i].height]))
            dx[i] = sum(perms[j][0] * o[i, j] for j in range(6))
            dy[i] = sum(perms[j][1] * o[i, j] for j in range(6))
            dz[i] = sum(perms[j][2] * o[i, j] for j in range(6))
        
        # Constraints
        # 1. Each case has exactly one orientation
        for i in range(num_cases):
            cqm.add_discrete(quicksum([o[i, k] for k in range(6)]), label=f"orientation_{i}")
        
        # 2. Each case in exactly one bin
        for i in range(num_cases):
            cqm.add_discrete(quicksum([bin_loc[i, j] for j in range(num_bins)]), 
                            label=f"case_{i}_assignment")
        
        # 3. Geometric constraints (no overlap) - simplified for SciPy
        for i, k in combinations(range(num_cases), r=2):
            cqm.add_discrete(quicksum([selector[i, k, s] for s in range(6)]), 
                            label=f"discrete_{i}_{k}")
        
        # 4. Boundary constraints
        for i in range(num_cases):
            cqm.add_constraint(y[i] + dy[i] <= bin_template.width, label=f"maxy_{i}")
            cqm.add_constraint(z[i] + dz[i] <= bin_template.height, label=f"maxz_{i}")
        
        # Objective: minimize bins used + minimize height
        obj = quicksum(bin_on[j] for j in range(num_bins)) * bin_template.height
        obj += quicksum(z[i] + dz[i] for i in range(num_cases)) / num_cases
        cqm.set_objective(obj)
        
        variables = {
            'x': x, 'y': y, 'z': z, 'o': o,
            'bin_loc': bin_loc, 'bin_on': bin_on,
            'selector': selector, 'bin_height': bin_height
        }
        
        return cqm, variables, (dx, dy, dz)
    
    def _estimate_bins_needed(self, cases: List[DWaveCase], bin_template: DWaveBin) -> int:
        """Estimate minimum bins needed based on volume"""
        total_volume = sum(c.length * c.width * c.height for c in cases)
        bin_volume = bin_template.length * bin_template.width * bin_template.height
        return max(1, int(np.ceil(total_volume / bin_volume * 1.2)))  # 20% buffer
    
    def _solve_scipy(self, cqm: ConstrainedQuadraticModel) -> Dict:
        """Solve using SciPy MILP (local, free)"""
        # Implementation using scipy.optimize.milp
        # This is a simplified version - full implementation in actual code
        pass
    
    def _solve_quantum(self, cqm: ConstrainedQuadraticModel) -> Dict:
        """Solve using D-Wave Leap Hybrid CQM Solver (cloud)"""
        from dwave.system import LeapHybridCQMSampler
        sampler = LeapHybridCQMSampler()
        result = sampler.sample_cqm(cqm, time_limit=self.time_limit)
        return result.first.sample
    
    def _parse_solution(self, solution: Dict, variables: Dict, 
                       cases: List[DWaveCase], bin_template: DWaveBin,
                       effective_dims: Tuple) -> Dict:
        """Parse solver solution into TruckOptimum format"""
        # Convert to standard packed_cartons format
        pass
```

#### 1.3 Integration with Existing Engine

**Update:** `apps/desktop/TruckOptimum/advanced_3d_algorithms.py`

```python
# Add new algorithm type
class Algorithm3DType(Enum):
    # ... existing algorithms ...
    DWAVE_SCIPY = "dwave_scipy"      # Mathematical optimization (local)
    DWAVE_QUANTUM = "dwave_quantum"  # Quantum hybrid (cloud)
```

#### 1.4 API Endpoint Integration

**Update:** `apps/web/app/routes.py`

```python
@api.route('/optimize-advanced', methods=['POST'])
def optimize_advanced():
    """
    Advanced optimization with algorithm selection
    
    Algorithms:
    - 'fast': py3dbp heuristic (~10ms)
    - 'balanced': Enhanced heuristic (~100ms)
    - 'optimal': D-Wave SciPy MILP (~5-30s)
    - 'quantum': D-Wave Quantum CQM (~20s, requires cloud)
    """
    data = request.get_json()
    algorithm = data.get('algorithm', 'balanced')
    
    if algorithm == 'optimal':
        solver = DWavePackingSolver(use_quantum=False)
        result = solver.solve(cases, bins)
    elif algorithm == 'quantum':
        solver = DWavePackingSolver(use_quantum=True)
        result = solver.solve(cases, bins)
    # ... existing algorithms ...
```

---

### Phase 2: Enhanced Heuristic Integration (Week 3)
**Concepts from Janet-19 (ideas only, no code copy)**

#### 2.1 Pivot Point Selection Enhancement

Add to existing `SkylineBottomLeft` class:

```python
class EnhancedSkylineBottomLeft(SkylineBottomLeft):
    """Enhanced with pivot point selection from research"""
    
    def find_best_position_enhanced(self, carton: Carton3D) -> Optional[Tuple]:
        """
        Enhanced position finding with multi-criteria scoring
        Based on concepts from Li et al. (2014) research paper
        """
        candidates = []
        
        for orientation in carton.get_orientations():
            l, w, h = orientation
            
            # Generate pivot points from existing items
            pivots = self._generate_pivot_points()
            
            for pivot in pivots:
                x, y, z = pivot
                if self.can_place(carton, x, y, z, orientation):
                    # Score this placement
                    score = self._score_placement(x, y, z, orientation, carton)
                    candidates.append((x, y, z, orientation, score))
        
        if not candidates:
            return None
            
        # Return best scored position
        best = max(candidates, key=lambda c: c[4])
        return (best[0], best[1], best[2], best[3])
    
    def _generate_pivot_points(self) -> List[Tuple[float, float, float]]:
        """Generate candidate pivot points from placed items"""
        pivots = [(0, 0, 0)]  # Origin always available
        
        for placed in self.placed_cartons:
            # Corner points of each placed item
            pivots.extend([
                (placed.x2, placed.y, placed.z),   # Right
                (placed.x, placed.y2, placed.z),   # Front
                (placed.x, placed.y, placed.z2),   # Top
                (placed.x2, placed.y2, placed.z),  # Right-front corner
                (placed.x2, placed.y, placed.z2),  # Right-top corner
                (placed.x, placed.y2, placed.z2),  # Front-top corner
            ])
        
        return list(set(pivots))  # Remove duplicates
    
    def _score_placement(self, x: float, y: float, z: float, 
                         orientation: Tuple, carton: Carton3D) -> float:
        """Multi-criteria placement scoring"""
        l, w, h = orientation
        score = 0.0
        
        # 1. Prefer lower positions (gravity)
        score += (1 - z / self.truck.height) * 30
        
        # 2. Prefer back-left positions (fill from corner)
        score += (1 - x / self.truck.length) * 20
        score += (1 - y / self.truck.width) * 20
        
        # 3. Prefer touching walls/other items (stability)
        touches = self._count_contact_surfaces(x, y, z, l, w, h)
        score += touches * 10
        
        # 4. Minimize wasted space
        waste = self._calculate_local_waste(x, y, z, l, w, h)
        score -= waste * 5
        
        return score
```

---

### Phase 3: Unified Algorithm Selector (Week 4)

#### 3.1 Smart Algorithm Selection

```python
class SmartAlgorithmSelector:
    """Automatically select best algorithm based on problem characteristics"""
    
    @staticmethod
    def select_algorithm(num_items: int, num_trucks: int, 
                        time_budget: float, has_constraints: bool) -> str:
        """
        Select optimal algorithm based on problem size and requirements
        
        Returns algorithm identifier
        """
        # Small problems - use fast heuristic
        if num_items < 30:
            return 'skyline_bl'
        
        # Medium problems - use enhanced heuristic
        if num_items < 100:
            if time_budget > 1.0:
                return 'genetic'
            return 'skyline_spatial'
        
        # Large problems with time budget - use mathematical optimization
        if num_items < 50 and time_budget > 10.0:
            return 'dwave_scipy'
        
        # Very large problems - use metaheuristics
        if time_budget > 5.0:
            return 'hybrid_genetic'
        
        # Default to balanced approach
        return 'simulated_annealing'
```

---

## 📦 New Dependencies

### Required (Add to requirements.txt)
```
# D-Wave / Mathematical Optimization
dimod>=0.12.0
numpy>=1.24.0
scipy>=1.11.0
tabulate>=0.9.0

# Optional - for quantum cloud solver
# dwave-system>=1.18.0
# dwave-ocean-sdk>=6.0.0
```

### Installation Commands
```bash
# Core dependencies (local solver)
pip install dimod scipy tabulate

# Optional: D-Wave quantum cloud
pip install dwave-ocean-sdk
dwave setup  # Configure Leap account
```

---

## 🔧 Configuration

### Environment Variables
```env
# D-Wave Configuration (optional - for quantum solver)
DWAVE_API_TOKEN=your_leap_api_token
DWAVE_ENDPOINT=https://cloud.dwavesys.com/sapi/

# Algorithm Defaults
DEFAULT_PACKING_ALGORITHM=balanced
DWAVE_TIME_LIMIT=20
ENABLE_QUANTUM_SOLVER=false
```

### Algorithm Configuration
```python
# config/packing_config.py
ALGORITHM_CONFIG = {
    'skyline_bl': {
        'name': 'Skyline Bottom-Left',
        'speed': 'fast',
        'quality': 'good',
        'max_items': 500,
        'typical_time_ms': 10
    },
    'genetic': {
        'name': 'Genetic Algorithm',
        'speed': 'medium',
        'quality': 'very_good',
        'max_items': 200,
        'typical_time_ms': 500,
        'params': {
            'population_size': 50,
            'generations': 100,
            'mutation_rate': 0.1
        }
    },
    'dwave_scipy': {
        'name': 'Mathematical Optimization (MILP)',
        'speed': 'slow',
        'quality': 'optimal',
        'max_items': 50,  # Exponential scaling
        'typical_time_ms': 15000,
        'params': {
            'time_limit': 20.0
        }
    },
    'dwave_quantum': {
        'name': 'Quantum Hybrid (D-Wave)',
        'speed': 'slow',
        'quality': 'optimal',
        'max_items': 100,
        'typical_time_ms': 20000,
        'requires_cloud': True,
        'params': {
            'time_limit': 20.0
        }
    }
}
```

---

## 📊 Expected Improvements

### Benchmark Comparison (Estimated)

| Algorithm | 20 Items | 50 Items | 100 Items | Space Util |
|-----------|----------|----------|-----------|------------|
| py3dbp (current) | 5ms | 15ms | 40ms | 75-85% |
| Enhanced Heuristic | 20ms | 80ms | 200ms | 80-88% |
| Genetic Algorithm | 200ms | 800ms | 2s | 82-90% |
| D-Wave SciPy | 2s | 15s | N/A* | 88-95% |
| D-Wave Quantum | 5s | 15s | 25s | 90-98% |

*SciPy MILP doesn't scale well beyond ~50 items

### Quality Metrics

| Feature | Current | After Integration |
|---------|---------|-------------------|
| Space Utilization | 75-85% | 85-95% |
| Mathematical Optimality | No | Yes (D-Wave) |
| Guaranteed No Overlap | Heuristic | Mathematical |
| Multi-bin Optimization | Basic | Advanced |
| Algorithm Options | 11 | 13+ |

---

## ⚠️ Risk Assessment

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| SciPy solver doesn't scale | Medium | Medium | Limit to <50 items, fallback to heuristics |
| D-Wave cloud costs | Low | Low | SciPy solver is free alternative |
| Integration complexity | Medium | Medium | Adapter pattern isolates changes |
| Performance regression | Low | High | Comprehensive benchmarking |

### License Risks

| Repository | License | Commercial Use | Action |
|------------|---------|----------------|--------|
| py3dbp | MIT | ✅ OK | Continue using |
| Janet-19 | **None** | ⚠️ RISK | Concepts only, no code |
| D-Wave | Apache 2.0 | ✅ OK | Safe to integrate |

---

## 📅 Implementation Timeline

```
Week 1: D-Wave adapter foundation
├── Day 1-2: Dependencies & data structures
├── Day 3-4: CQM model builder
└── Day 5: SciPy solver integration

Week 2: D-Wave integration completion
├── Day 1-2: Result parsing & conversion
├── Day 3-4: API endpoint integration
└── Day 5: Unit tests

Week 3: Enhanced heuristics
├── Day 1-2: Pivot point selection
├── Day 3-4: Multi-criteria scoring
└── Day 5: Integration with existing engine

Week 4: Polish & optimization
├── Day 1-2: Smart algorithm selector
├── Day 3: Configuration system
├── Day 4: Benchmarking
└── Day 5: Documentation & release
```

---

## ✅ Acceptance Criteria

### Phase 1 Complete When:
- [ ] D-Wave adapter module created
- [ ] SciPy solver integrated and working
- [ ] API endpoint accepts algorithm parameter
- [ ] Unit tests pass for new algorithms
- [ ] Documentation updated

### Phase 2 Complete When:
- [ ] Enhanced pivot selection implemented
- [ ] Multi-criteria scoring working
- [ ] Benchmark shows improvement over baseline

### Phase 3 Complete When:
- [ ] Smart algorithm selector implemented
- [ ] All algorithms accessible via unified API
- [ ] Performance benchmarks documented
- [ ] User documentation complete

---

## 📚 References

1. **py3dbp**: Dube, Erick. "Optimizing Three-Dimensional Bin Packing Through Simulation" (2006)
2. **Janet-19**: Li, Xueping et al. "A genetic algorithm for the three-dimensional bin packing problem with heterogeneous bins" (2014)
3. **D-Wave**: Martello, Silvano et al. "The three-dimensional bin packing problem" Operations Research (2000)
4. **D-Wave CQM**: https://docs.dwavequantum.com/en/latest/concepts/models.html

---

## 🎯 Summary

| Decision | Recommendation |
|----------|----------------|
| **py3dbp** | ✅ Keep - reliable baseline |
| **Janet-19** | ⚠️ Concepts only - no license |
| **D-Wave** | ✅ **Integrate** - best quality, Apache license |
| **Priority** | D-Wave SciPy solver (free, local, optimal) |
| **Timeline** | 4 weeks |
| **Risk** | Low-Medium |

The D-Wave integration provides the highest value: mathematical optimality guarantees with a free local solver option, while maintaining the fast heuristics for everyday use.
