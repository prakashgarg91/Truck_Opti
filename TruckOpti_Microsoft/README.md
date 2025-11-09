# TruckOpti Microsoft - Advanced Truck Optimization System

TruckOpti Microsoft is an advanced truck optimization system designed for Windows with multi-core processor utilization. The system provides sophisticated 3D bin packing algorithms for optimal truck load planning.

## Features

- **Multi-Core Processing**: Leverages Windows multi-core processors for enhanced performance
- **Advanced 3D Algorithms**: 9 state-of-the-art 3D bin packing algorithms
- **Real-time Optimization**: Live truck and carton management
- **Batch Processing**: Bulk upload and processing capabilities
- **Microsoft Integration**: Windows-native application with enterprise features

## Architecture

The system follows a modular architecture with clear separation of concerns:

```
TruckOpti_Microsoft/
├── core/                          # Core business logic
│   ├── algorithms/                # 3D packing algorithms
│   ├── models/                    # Data models (Truck, Carton, PackedCarton)
│   ├── optimization/              # Optimization engine with LAFF algorithm
│   └── microsoft/                 # Microsoft-specific optimizations
├── web/                          # Flask web interface
├── utils/                       # Utility functions
├── tests/                       # Organized test structure
├── config/                      # Configuration files
├── docs/                        # Documentation
└── build/                       # Build configurations
```

## Quick Start

```bash
cd TruckOpti_Microsoft
python -m web.app
```

Open your browser to `http://localhost:5000` to access the web interface.

## Algorithm Performance

The system includes multiple advanced 3D bin packing algorithms:
- Skyline Bottom Left
- Advanced LAFF (Largest Area Fit First) with RANSAC optimization
- Genetic Algorithm
- First Fit Decreasing
- Best Fit Decreasing
- Physics-based stability
- Enhanced Extreme Points (2024)
- Dynamic Spatial Corner Fitness
- Hybrid Skyline Domain Search
- Waste Space Priority Sorting

## Microsoft Windows Integration

- Multi-threaded processing using ThreadPoolExecutor
- Optimized for Windows memory management
- Native Windows error handling
- Enterprise-grade logging and monitoring