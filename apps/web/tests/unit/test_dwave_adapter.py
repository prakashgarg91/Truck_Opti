"""
Unit tests for D-Wave packing adapter
"""
import pytest
import sys
sys.path.insert(0, 'd:\\Github\\Truck_Opti\\apps\\web')


class TestDWaveAdapter:
    """Test D-Wave packing adapter"""

    def test_import_module(self):
        """Test that module can be imported"""
        try:
            from app.core.dwave_packing_adapter import (
                DWaveCase, DWaveBin, PackedItem, DWaveSciPySolver
            )
            assert True
        except ImportError as e:
            pytest.fail(f"Import failed: {e}")

    def test_dwave_case_creation(self):
        """Test DWaveCase dataclass"""
        from app.core.dwave_packing_adapter import DWaveCase

        case = DWaveCase(
            id=1,
            name="TestCase",
            length=10.0,
            width=20.0,
            height=30.0,
            weight=5.0,
            quantity=3
        )

        assert case.id == 1
        assert case.name == "TestCase"
        assert case.length == 10.0
        assert case.width == 20.0
        assert case.height == 30.0
        assert case.weight == 5.0
        assert case.quantity == 3

    def test_dwave_bin_creation(self):
        """Test DWaveBin dataclass"""
        from app.core.dwave_packing_adapter import DWaveBin

        bin_obj = DWaveBin(
            id=0,
            name="TestBin",
            length=100.0,
            width=100.0,
            height=100.0,
            max_weight=1000.0
        )

        assert bin_obj.id == 0
        assert bin_obj.name == "TestBin"
        assert bin_obj.length == 100.0

    def test_solver_basic_pack(self):
        """Test basic packing functionality"""
        from app.core.dwave_packing_adapter import DWaveCase, DWaveBin, DWaveSciPySolver

        solver = DWaveSciPySolver(time_limit=5.0)

        cases = [
            DWaveCase(0, "Small", 10, 10, 10, 1, 5),
            DWaveCase(1, "Medium", 20, 20, 20, 2, 3),
        ]

        bin_template = DWaveBin(0, "Truck", 100, 100, 100, 1000)

        result = solver.solve(cases, bin_template)

        assert result['success'] == True
        assert result['total_packed'] > 0
        assert 'placements' in result

    def test_format_conversion(self):
        """Test format conversion functions"""
        from app.core.dwave_packing_adapter import (
            convert_from_truckoptimum, convert_to_truckoptimum
        )

        trucks = [{'name': 'Test', 'length': 100, 'width': 100, 'height': 100, 'max_weight': 1000}]
        cartons = [{'name': 'Box', 'length': 10, 'width': 10, 'height': 10, 'weight': 1, 'quantity': 2}]

        bin_template, cases = convert_from_truckoptimum(trucks, cartons)

        assert bin_template.name == 'Test'
        assert len(cases) == 1
        assert cases[0].quantity == 2


class TestAdvancedPackerBridge:
    """Test the packer bridge"""

    def test_bridge_import(self):
        """Test bridge can be imported"""
        try:
            from app.core.advanced_packer_bridge import packer_bridge
            assert packer_bridge is not None
        except ImportError as e:
            pytest.fail(f"Import failed: {e}")

    def test_get_algorithms(self):
        """Test algorithm listing"""
        from app.core.advanced_packer_bridge import packer_bridge

        algorithms = packer_bridge.get_available_algorithms()

        assert 'py3dbp' in algorithms
        assert 'dwave_scipy' in algorithms

    def test_pack_py3dbp(self):
        """Test packing with py3dbp"""
        from app.core.advanced_packer_bridge import packer_bridge

        trucks = [{'name': 'Truck1', 'length': 100, 'width': 100, 'height': 100, 'max_weight': 1000}]
        cartons = [{'name': 'Box', 'length': 10, 'width': 10, 'height': 10, 'weight': 1, 'quantity': 5}]

        result = packer_bridge.pack('py3dbp', trucks, cartons)

        assert result.get('success', False) == True or 'error' not in result


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
