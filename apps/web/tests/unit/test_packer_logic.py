"""
Unit tests for packer business logic.
Tests scoring, grading, improvement suggestions and related utility functions.
"""

import pytest
from app.packer import (
    calculate_performance_score,
    _get_score_formula,
    _get_improvement_suggestions,
    _calculate_item_sort_key,
    INDIAN_TRUCKS,
    INDIAN_CARTONS,
)


class TestCalculatePerformanceScore:
    """Tests for calculate_performance_score()."""

    def _make_result(self, volume_pct=80, weight_pct=70, packing_eff=85, valid=True):
        return {
            "calculation_metadata": {
                "volume_utilization_percentage": volume_pct,
                "weight_utilization_percentage": weight_pct,
                "packing_efficiency": packing_eff,
                "validation_passed": valid,
            }
        }

    # -- space optimization --------------------------------------------------

    def test_space_grade_a_at_max_inputs(self):
        # For "space" goal: weight capped at 50%, so raw max = 0.5*100+0.3*100+0.2*50 = 90 → "A"
        result = self._make_result(volume_pct=100, weight_pct=100, packing_eff=100)
        score_info = calculate_performance_score(result, "space")
        assert score_info["grade"] == "A"

    def test_space_grade_f_when_validation_fails(self):
        # raw_score with all-100 inputs for "space" = 90, 50% penalty → 45 → grade "F"
        result = self._make_result(volume_pct=100, weight_pct=100, packing_eff=100, valid=False)
        score_info = calculate_performance_score(result, "space")
        assert score_info["grade"] == "F"

    def test_space_score_zero_inputs(self):
        result = self._make_result(volume_pct=0, weight_pct=0, packing_eff=0)
        score_info = calculate_performance_score(result, "space")
        assert score_info["grade"] == "F"
        assert score_info["score"] == 0.0

    def test_space_score_breakdown_keys_present(self):
        result = self._make_result()
        score_info = calculate_performance_score(result, "space")
        assert "breakdown" in score_info
        assert "space_utilization_pct" in score_info["breakdown"]
        assert "weight_utilization_pct" in score_info["breakdown"]
        assert "packing_efficiency_pct" in score_info["breakdown"]
        assert "validation_passed" in score_info["breakdown"]

    # -- cost optimization ---------------------------------------------------

    def test_cost_goal_returns_valid_grade(self):
        result = self._make_result(volume_pct=90, weight_pct=90, packing_eff=90)
        score_info = calculate_performance_score(result, "cost")
        assert score_info["grade"] in ("A+", "A", "B+", "B", "C+", "C", "D", "F")

    def test_cost_formula_in_result(self):
        result = self._make_result()
        score_info = calculate_performance_score(result, "cost")
        assert "calculation_formula" in score_info

    # -- weight optimization -------------------------------------------------

    def test_weight_goal_returns_valid_score(self):
        result = self._make_result(volume_pct=50, weight_pct=95, packing_eff=80)
        score_info = calculate_performance_score(result, "weight")
        assert 0 <= score_info["score"] <= 100

    # -- balanced / min_trucks -----------------------------------------------

    def test_balanced_goal_returns_valid_score(self):
        result = self._make_result(volume_pct=70, weight_pct=70, packing_eff=70)
        score_info = calculate_performance_score(result, "min_trucks")
        # Equal weights: (70+70+70)/3 = 70 → grade C+
        assert score_info["grade"] == "C+"

    def test_optimization_goal_propagated(self):
        result = self._make_result()
        score_info = calculate_performance_score(result, "weight")
        assert score_info["optimization_goal"] == "weight"

    def test_improvement_suggestions_present(self):
        result = self._make_result(volume_pct=50, weight_pct=40, packing_eff=70)
        score_info = calculate_performance_score(result, "space")
        assert "improvement_suggestions" in score_info
        assert isinstance(score_info["improvement_suggestions"], list)
        assert len(score_info["improvement_suggestions"]) > 0


class TestGetScoreFormula:
    """Tests for _get_score_formula() helper."""

    def test_space_formula_returned(self):
        formula = _get_score_formula("space")
        assert "Space Utilization" in formula

    def test_cost_formula_returned(self):
        formula = _get_score_formula("cost")
        assert "Cost Efficiency" in formula

    def test_weight_formula_returned(self):
        formula = _get_score_formula("weight")
        assert "Weight Utilization" in formula

    def test_default_formula_returned(self):
        formula = _get_score_formula("balanced")
        assert "÷ 3" in formula or "3" in formula


class TestGetImprovementSuggestions:
    """Tests for _get_improvement_suggestions() helper."""

    def test_low_space_util_suggests_improvement(self):
        suggestions = _get_improvement_suggestions(0.5, 0.8, 0.8, "space")
        assert any("space" in s.lower() or "truck" in s.lower() for s in suggestions)

    def test_high_utilization_no_major_issue(self):
        suggestions = _get_improvement_suggestions(0.9, 0.9, 0.9, "space")
        assert suggestions == ["Optimization looks good - no major improvements needed"]

    def test_low_weight_util_suggests_improvement(self):
        suggestions = _get_improvement_suggestions(0.9, 0.3, 0.9, "space")
        assert any("weight" in s.lower() for s in suggestions)

    def test_goal_specific_weight_suggestion(self):
        suggestions = _get_improvement_suggestions(0.5, 0.5, 0.9, "weight")
        assert any("weight" in s.lower() or "capacity" in s.lower() for s in suggestions)


class TestCalculateItemSortKey:
    """Tests for cached _calculate_item_sort_key() helper."""

    def test_space_goal_sort_key(self):
        key = _calculate_item_sort_key("BoxA", 10.0, 5.0, 3, False, True, "space")
        # Should return tuple (not_stackable, -priority, -value)
        assert isinstance(key, tuple)
        assert key == (False, -3, -5.0)

    def test_weight_goal_sort_key(self):
        key = _calculate_item_sort_key("BoxB", 20.0, 5.0, 3, False, True, "weight")
        assert key == (-20.0,)

    def test_cost_goal_sort_key(self):
        key = _calculate_item_sort_key("BoxC", 10.0, 15.0, 3, False, True, "cost")
        assert key == (-15.0,)

    def test_default_goal_sort_key(self):
        key = _calculate_item_sort_key("BoxD", 10.0, 5.0, 2, False, True, "min_trucks")
        assert key == (-2, -5.0, -10.0)


class TestStaticData:
    """Tests for INDIAN_TRUCKS and INDIAN_CARTONS static datasets."""

    def test_indian_trucks_not_empty(self):
        assert len(INDIAN_TRUCKS) > 0

    def test_indian_truck_has_required_keys(self):
        for truck in INDIAN_TRUCKS:
            assert "name" in truck
            assert "length" in truck
            assert "width" in truck
            assert "height" in truck
            assert "max_weight" in truck

    def test_indian_truck_dimensions_positive(self):
        for truck in INDIAN_TRUCKS:
            assert truck["length"] > 0
            assert truck["width"] > 0
            assert truck["height"] > 0
            assert truck["max_weight"] > 0

    def test_indian_cartons_not_empty(self):
        assert len(INDIAN_CARTONS) > 0

    def test_indian_carton_has_required_keys(self):
        for carton in INDIAN_CARTONS:
            assert "type" in carton
            assert "length" in carton
            assert "width" in carton
            assert "height" in carton
            assert "weight" in carton

    def test_indian_carton_dimensions_positive(self):
        for carton in INDIAN_CARTONS:
            assert carton["length"] > 0
            assert carton["width"] > 0
            assert carton["height"] > 0
            assert carton["weight"] > 0
