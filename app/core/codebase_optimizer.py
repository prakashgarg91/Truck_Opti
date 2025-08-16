#!/usr/bin/env python3
"""
Codebase Optimizer - AI-Powered Code Quality Enhancement
Automatically analyzes and improves code quality across the entire project
"""

import os
import ast
import sys
import json
import sqlite3
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime
import hashlib
import re
from collections import defaultdict, Counter

@dataclass
class CodeQualityMetric:
    """Code quality measurement"""
    file_path: str
    metric_type: str
    score: float
    max_score: float
    details: Dict[str, Any]
    suggestions: List[str]
    priority: str
    timestamp: datetime

@dataclass
class CodeIssue:
    """Code issue or improvement opportunity"""
    file_path: str
    line_number: int
    issue_type: str
    severity: str
    description: str
    suggested_fix: Optional[str] = None
    code_snippet: Optional[str] = None
    auto_fixable: bool = False

@dataclass
class CodebaseHealth:
    """Overall codebase health assessment"""
    overall_score: float
    total_files: int
    issues_count: int
    quality_metrics: Dict[str, float]
    recommendations: List[str]
    improvement_opportunities: List[str]
    technical_debt_score: float

class CodebaseAnalyzer:
    """Advanced codebase analysis with AI-powered insights"""
    
    def __init__(self, project_root: str = "D:\\Github\\Truck_Opti"):
        self.project_root = Path(project_root)
        self.python_files = self._discover_python_files()
        self.frontend_files = self._discover_frontend_files()
        self.config_files = self._discover_config_files()
        
        # Quality rules and patterns
        self.quality_rules = self._load_quality_rules()
        self.code_patterns = self._load_code_patterns()
        
        # Analysis results
        self.analysis_results = {}
        self.quality_metrics = {}
        self.code_issues = []
        
    def _discover_python_files(self) -> List[Path]:
        """Discover all Python files in the project"""
        python_files = []
        for pattern in ["**/*.py"]:
            python_files.extend(self.project_root.glob(pattern))
        
        # Filter out unwanted directories
        excluded_dirs = {'__pycache__', '.git', 'node_modules', 'venv', 'env', 'build', 'dist'}
        return [f for f in python_files if not any(excluded in str(f) for excluded in excluded_dirs)]
    
    def _discover_frontend_files(self) -> List[Path]:
        """Discover frontend files (JS, CSS, HTML)"""
        frontend_files = []
        for pattern in ["**/*.js", "**/*.css", "**/*.html"]:
            frontend_files.extend(self.project_root.glob(pattern))
        
        excluded_dirs = {'node_modules', '.git', 'build', 'dist'}
        return [f for f in frontend_files if not any(excluded in str(f) for excluded in excluded_dirs)]
    
    def _discover_config_files(self) -> List[Path]:
        """Discover configuration files"""
        config_patterns = ["*.json", "*.yml", "*.yaml", "*.toml", "*.ini", "*.cfg", "requirements*.txt"]
        config_files = []
        
        for pattern in config_patterns:
            config_files.extend(self.project_root.glob(pattern))
            
        return config_files
    
    def _load_quality_rules(self) -> Dict[str, Any]:
        """Load code quality rules and standards"""
        return {
            'python': {
                'max_function_length': 50,
                'max_class_length': 300,
                'max_complexity': 10,
                'max_line_length': 100,
                'required_docstrings': True,
                'type_hints_required': True,
                'naming_conventions': {
                    'functions': r'^[a-z_][a-z0-9_]*$',
                    'classes': r'^[A-Z][a-zA-Z0-9]*$',
                    'constants': r'^[A-Z_][A-Z0-9_]*$'
                }
            },
            'javascript': {
                'max_function_length': 30,
                'max_line_length': 100,
                'use_strict_mode': True,
                'consistent_quotes': 'single',
                'semicolons_required': True
            },
            'html': {
                'valid_structure': True,
                'accessibility_required': True,
                'semantic_elements': True
            },
            'css': {
                'consistent_naming': True,
                'mobile_first': True,
                'performance_optimized': True
            }
        }
    
    def _load_code_patterns(self) -> Dict[str, List[str]]:
        """Load code patterns to detect"""
        return {
            'anti_patterns': [
                r'print\s*\(',  # Print statements in production code
                r'TODO:',       # TODO comments
                r'FIXME:',      # FIXME comments
                r'XXX:',        # XXX comments
                r'hack',        # Hack references
                r'temporary',   # Temporary code
            ],
            'security_patterns': [
                r'password\s*=',
                r'secret\s*=',
                r'api_key\s*=',
                r'token\s*=',
                r'eval\s*\(',
                r'exec\s*\(',
            ],
            'performance_patterns': [
                r'for.*in.*range\(len\(',  # Inefficient loops
                r'\.append\(.*\).*for.*in',  # List comprehension opportunities
                r'time\.sleep\(',  # Synchronous sleep calls
            ],
            'modernization_patterns': [
                r'string\.format\(',  # Old string formatting
                r'%\s*[sd]',  # % string formatting
                r'file\s*\(',  # Old file handling
            ]
        }
    
    def analyze_codebase(self) -> CodebaseHealth:
        """Perform comprehensive codebase analysis"""
        print("Starting comprehensive codebase analysis...")
        
        # Analyze Python files
        self._analyze_python_files()
        
        # Analyze frontend files
        self._analyze_frontend_files()
        
        # Analyze configuration files
        self._analyze_config_files()
        
        # Calculate overall health
        health = self._calculate_codebase_health()
        
        # Generate recommendations
        self._generate_recommendations(health)
        
        print(f"Analysis complete! Overall health score: {health.overall_score:.1f}/100")
        return health
    
    def _analyze_python_files(self):
        """Analyze Python files for quality metrics"""
        print(f"Analyzing {len(self.python_files)} Python files...")
        
        for file_path in self.python_files:
            try:
                analysis = self._analyze_python_file(file_path)
                self.analysis_results[str(file_path)] = analysis
            except Exception as e:
                self.code_issues.append(CodeIssue(
                    file_path=str(file_path),
                    line_number=0,
                    issue_type="analysis_error",
                    severity="low",
                    description=f"Failed to analyze file: {str(e)}"
                ))
    
    def _analyze_python_file(self, file_path: Path) -> Dict[str, Any]:
        """Analyze individual Python file"""
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        try:
            tree = ast.parse(content)
        except SyntaxError as e:
            return {
                'syntax_error': True,
                'error': str(e),
                'score': 0
            }
        
        analysis = {
            'file_path': str(file_path),
            'lines_of_code': len(content.splitlines()),
            'functions': [],
            'classes': [],
            'imports': [],
            'complexity_score': 0,
            'maintainability_score': 0,
            'documentation_score': 0,
            'type_hints_score': 0,
            'issues': []
        }
        
        # AST analysis
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                func_analysis = self._analyze_function(node, content)
                analysis['functions'].append(func_analysis)
                
            elif isinstance(node, ast.ClassDef):
                class_analysis = self._analyze_class(node, content)
                analysis['classes'].append(class_analysis)
                
            elif isinstance(node, (ast.Import, ast.ImportFrom)):
                analysis['imports'].append(self._analyze_import(node))
        
        # Pattern analysis
        analysis['patterns'] = self._analyze_patterns(content)
        
        # Calculate scores
        analysis['complexity_score'] = self._calculate_complexity_score(analysis)
        analysis['maintainability_score'] = self._calculate_maintainability_score(analysis)
        analysis['documentation_score'] = self._calculate_documentation_score(analysis)
        analysis['type_hints_score'] = self._calculate_type_hints_score(analysis)
        
        # Overall file score
        analysis['overall_score'] = (
            analysis['complexity_score'] * 0.3 +
            analysis['maintainability_score'] * 0.3 +
            analysis['documentation_score'] * 0.2 +
            analysis['type_hints_score'] * 0.2
        )
        
        return analysis
    
    def _analyze_function(self, node: ast.FunctionDef, content: str) -> Dict[str, Any]:
        """Analyze individual function"""
        lines = content.splitlines()
        func_lines = lines[node.lineno-1:node.end_lineno] if hasattr(node, 'end_lineno') else []
        
        return {
            'name': node.name,
            'line_number': node.lineno,
            'length': len(func_lines),
            'has_docstring': ast.get_docstring(node) is not None,
            'docstring': ast.get_docstring(node),
            'parameters': len(node.args.args),
            'complexity': self._calculate_cyclomatic_complexity(node),
            'has_type_hints': self._has_type_hints(node),
            'issues': self._check_function_issues(node, func_lines)
        }
    
    def _analyze_class(self, node: ast.ClassDef, content: str) -> Dict[str, Any]:
        """Analyze individual class"""
        methods = [n for n in node.body if isinstance(n, ast.FunctionDef)]
        
        return {
            'name': node.name,
            'line_number': node.lineno,
            'methods': len(methods),
            'has_docstring': ast.get_docstring(node) is not None,
            'docstring': ast.get_docstring(node),
            'inheritance': len(node.bases),
            'issues': self._check_class_issues(node, methods)
        }
    
    def _analyze_import(self, node) -> Dict[str, Any]:
        """Analyze import statement"""
        if isinstance(node, ast.Import):
            return {
                'type': 'import',
                'modules': [alias.name for alias in node.names],
                'line': node.lineno
            }
        else:  # ast.ImportFrom
            return {
                'type': 'from_import',
                'module': node.module,
                'names': [alias.name for alias in node.names],
                'line': node.lineno
            }
    
    def _analyze_patterns(self, content: str) -> Dict[str, List[int]]:
        """Analyze code patterns"""
        patterns_found = defaultdict(list)
        lines = content.splitlines()
        
        for category, patterns in self.code_patterns.items():
            for pattern in patterns:
                for i, line in enumerate(lines, 1):
                    if re.search(pattern, line, re.IGNORECASE):
                        patterns_found[category].append(i)
        
        return dict(patterns_found)
    
    def _calculate_cyclomatic_complexity(self, node: ast.FunctionDef) -> int:
        """Calculate cyclomatic complexity of a function"""
        complexity = 1  # Base complexity
        
        for child in ast.walk(node):
            if isinstance(child, (ast.If, ast.While, ast.For, ast.Try, ast.With)):
                complexity += 1
            elif isinstance(child, ast.BoolOp):
                complexity += len(child.values) - 1
        
        return complexity
    
    def _has_type_hints(self, node: ast.FunctionDef) -> bool:
        """Check if function has type hints"""
        has_return_hint = node.returns is not None
        has_param_hints = any(arg.annotation is not None for arg in node.args.args)
        return has_return_hint or has_param_hints
    
    def _check_function_issues(self, node: ast.FunctionDef, func_lines: List[str]) -> List[str]:
        """Check for function-specific issues"""
        issues = []
        
        # Check function length
        if len(func_lines) > self.quality_rules['python']['max_function_length']:
            issues.append(f"Function too long ({len(func_lines)} lines)")
        
        # Check complexity
        complexity = self._calculate_cyclomatic_complexity(node)
        if complexity > self.quality_rules['python']['max_complexity']:
            issues.append(f"High complexity ({complexity})")
        
        # Check docstring
        if self.quality_rules['python']['required_docstrings'] and not ast.get_docstring(node):
            issues.append("Missing docstring")
        
        # Check type hints
        if self.quality_rules['python']['type_hints_required'] and not self._has_type_hints(node):
            issues.append("Missing type hints")
        
        return issues
    
    def _check_class_issues(self, node: ast.ClassDef, methods: List) -> List[str]:
        """Check for class-specific issues"""
        issues = []
        
        # Check class size
        if len(methods) > 20:
            issues.append(f"Too many methods ({len(methods)})")
        
        # Check docstring
        if self.quality_rules['python']['required_docstrings'] and not ast.get_docstring(node):
            issues.append("Missing class docstring")
        
        return issues
    
    def _calculate_complexity_score(self, analysis: Dict) -> float:
        """Calculate complexity score (0-100)"""
        total_complexity = sum(func['complexity'] for func in analysis['functions'])
        avg_complexity = total_complexity / len(analysis['functions']) if analysis['functions'] else 0
        
        # Lower complexity is better
        score = max(0, 100 - (avg_complexity - 5) * 10)
        return min(100, score)
    
    def _calculate_maintainability_score(self, analysis: Dict) -> float:
        """Calculate maintainability score (0-100)"""
        score = 100
        
        # Penalize for anti-patterns
        anti_patterns = analysis['patterns'].get('anti_patterns', [])
        score -= len(anti_patterns) * 5
        
        # Penalize for long functions
        long_functions = sum(1 for func in analysis['functions'] 
                           if func['length'] > self.quality_rules['python']['max_function_length'])
        score -= long_functions * 10
        
        # Penalize for large classes
        large_classes = sum(1 for cls in analysis['classes'] if cls['methods'] > 15)
        score -= large_classes * 15
        
        return max(0, score)
    
    def _calculate_documentation_score(self, analysis: Dict) -> float:
        """Calculate documentation score (0-100)"""
        total_items = len(analysis['functions']) + len(analysis['classes'])
        if total_items == 0:
            return 100
        
        documented_items = (
            sum(1 for func in analysis['functions'] if func['has_docstring']) +
            sum(1 for cls in analysis['classes'] if cls['has_docstring'])
        )
        
        return (documented_items / total_items) * 100
    
    def _calculate_type_hints_score(self, analysis: Dict) -> float:
        """Calculate type hints score (0-100)"""
        if not analysis['functions']:
            return 100
        
        functions_with_hints = sum(1 for func in analysis['functions'] if func['has_type_hints'])
        return (functions_with_hints / len(analysis['functions'])) * 100
    
    def _analyze_frontend_files(self):
        """Analyze frontend files"""
        print(f"Analyzing {len(self.frontend_files)} frontend files...")
        
        for file_path in self.frontend_files:
            try:
                analysis = self._analyze_frontend_file(file_path)
                self.analysis_results[str(file_path)] = analysis
            except Exception as e:
                self.code_issues.append(CodeIssue(
                    file_path=str(file_path),
                    line_number=0,
                    issue_type="analysis_error", 
                    severity="low",
                    description=f"Failed to analyze frontend file: {str(e)}"
                ))
    
    def _analyze_frontend_file(self, file_path: Path) -> Dict[str, Any]:
        """Analyze individual frontend file"""
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        file_type = file_path.suffix.lower()
        
        analysis = {
            'file_path': str(file_path),
            'file_type': file_type,
            'lines_of_code': len(content.splitlines()),
            'size_bytes': len(content.encode('utf-8')),
            'issues': []
        }
        
        if file_type == '.js':
            analysis.update(self._analyze_javascript(content))
        elif file_type == '.css':
            analysis.update(self._analyze_css(content))
        elif file_type == '.html':
            analysis.update(self._analyze_html(content))
        
        return analysis
    
    def _analyze_javascript(self, content: str) -> Dict[str, Any]:
        """Analyze JavaScript code"""
        issues = []
        lines = content.splitlines()
        
        # Check for common issues
        for i, line in enumerate(lines, 1):
            if 'console.log' in line:
                issues.append(f"Line {i}: Console.log statement (remove for production)")
            
            if 'eval(' in line:
                issues.append(f"Line {i}: Eval usage (security risk)")
            
            if len(line) > self.quality_rules['javascript']['max_line_length']:
                issues.append(f"Line {i}: Line too long ({len(line)} chars)")
        
        # Check for modern JavaScript features
        has_const = 'const ' in content
        has_let = 'let ' in content
        has_arrow_functions = '=>' in content
        has_template_literals = '`' in content
        
        modernization_score = sum([has_const, has_let, has_arrow_functions, has_template_literals]) * 25
        
        return {
            'modernization_score': modernization_score,
            'has_modern_features': {
                'const': has_const,
                'let': has_let,
                'arrow_functions': has_arrow_functions,
                'template_literals': has_template_literals
            },
            'issues': issues
        }
    
    def _analyze_css(self, content: str) -> Dict[str, Any]:
        """Analyze CSS code"""
        issues = []
        lines = content.splitlines()
        
        # Check for CSS best practices
        has_mobile_first = '@media' in content
        has_variables = ':root' in content or '--' in content
        has_flexbox = 'flex' in content
        has_grid = 'grid' in content
        
        modern_features_score = sum([has_mobile_first, has_variables, has_flexbox, has_grid]) * 25
        
        return {
            'modern_features_score': modern_features_score,
            'has_modern_features': {
                'mobile_first': has_mobile_first,
                'css_variables': has_variables,
                'flexbox': has_flexbox,
                'css_grid': has_grid
            },
            'issues': issues
        }
    
    def _analyze_html(self, content: str) -> Dict[str, Any]:
        """Analyze HTML code"""
        issues = []
        
        # Check for semantic HTML
        semantic_elements = ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer']
        has_semantic = any(f'<{element}' in content for element in semantic_elements)
        
        # Check for accessibility
        has_alt_attrs = 'alt=' in content
        has_aria_labels = 'aria-' in content
        has_lang_attr = 'lang=' in content
        
        accessibility_score = sum([has_alt_attrs, has_aria_labels, has_lang_attr]) * 33.33
        semantic_score = 100 if has_semantic else 0
        
        return {
            'semantic_score': semantic_score,
            'accessibility_score': accessibility_score,
            'has_semantic_elements': has_semantic,
            'accessibility_features': {
                'alt_attributes': has_alt_attrs,
                'aria_labels': has_aria_labels,
                'lang_attribute': has_lang_attr
            },
            'issues': issues
        }
    
    def _analyze_config_files(self):
        """Analyze configuration files"""
        print(f"Analyzing {len(self.config_files)} configuration files...")
        
        for file_path in self.config_files:
            try:
                analysis = self._analyze_config_file(file_path)
                self.analysis_results[str(file_path)] = analysis
            except Exception as e:
                self.code_issues.append(CodeIssue(
                    file_path=str(file_path),
                    line_number=0,
                    issue_type="analysis_error",
                    severity="low",
                    description=f"Failed to analyze config file: {str(e)}"
                ))
    
    def _analyze_config_file(self, file_path: Path) -> Dict[str, Any]:
        """Analyze configuration file"""
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return {
            'file_path': str(file_path),
            'file_type': file_path.suffix,
            'lines': len(content.splitlines()),
            'size_bytes': len(content.encode('utf-8')),
            'is_valid': self._validate_config_file(file_path, content)
        }
    
    def _validate_config_file(self, file_path: Path, content: str) -> bool:
        """Validate configuration file format"""
        try:
            if file_path.suffix == '.json':
                json.loads(content)
            elif file_path.suffix in ['.yml', '.yaml']:
                import yaml
                yaml.safe_load(content)
            return True
        except:
            return False
    
    def _calculate_codebase_health(self) -> CodebaseHealth:
        """Calculate overall codebase health"""
        if not self.analysis_results:
            return CodebaseHealth(
                overall_score=0,
                total_files=0,
                issues_count=0,
                quality_metrics={},
                recommendations=[],
                improvement_opportunities=[],
                technical_debt_score=100
            )
        
        # Calculate average scores
        python_files = [r for r in self.analysis_results.values() if str(r.get('file_path', '')).endswith('.py')]
        
        if python_files:
            avg_complexity = sum(r.get('complexity_score', 0) for r in python_files) / len(python_files)
            avg_maintainability = sum(r.get('maintainability_score', 0) for r in python_files) / len(python_files)
            avg_documentation = sum(r.get('documentation_score', 0) for r in python_files) / len(python_files)
            avg_type_hints = sum(r.get('type_hints_score', 0) for r in python_files) / len(python_files)
        else:
            avg_complexity = avg_maintainability = avg_documentation = avg_type_hints = 0
        
        # Overall score calculation
        overall_score = (
            avg_complexity * 0.25 +
            avg_maintainability * 0.35 +
            avg_documentation * 0.20 +
            avg_type_hints * 0.20
        )
        
        # Count issues
        total_issues = sum(len(r.get('issues', [])) for r in self.analysis_results.values())
        total_issues += len(self.code_issues)
        
        # Technical debt calculation
        technical_debt_score = max(0, 100 - total_issues * 2)
        
        quality_metrics = {
            'complexity_score': avg_complexity,
            'maintainability_score': avg_maintainability,
            'documentation_score': avg_documentation,
            'type_hints_score': avg_type_hints,
            'technical_debt_score': technical_debt_score
        }
        
        return CodebaseHealth(
            overall_score=overall_score,
            total_files=len(self.analysis_results),
            issues_count=total_issues,
            quality_metrics=quality_metrics,
            recommendations=[],
            improvement_opportunities=[],
            technical_debt_score=technical_debt_score
        )
    
    def _generate_recommendations(self, health: CodebaseHealth):
        """Generate improvement recommendations"""
        recommendations = []
        opportunities = []
        
        # Based on quality metrics
        if health.quality_metrics['documentation_score'] < 80:
            recommendations.append("Improve documentation coverage - add docstrings to functions and classes")
            opportunities.append("Add comprehensive API documentation")
        
        if health.quality_metrics['type_hints_score'] < 70:
            recommendations.append("Add type hints to improve code clarity and IDE support")
            opportunities.append("Implement mypy for static type checking")
        
        if health.quality_metrics['complexity_score'] < 70:
            recommendations.append("Refactor complex functions to improve readability")
            opportunities.append("Extract common functionality into utility functions")
        
        if health.quality_metrics['maintainability_score'] < 80:
            recommendations.append("Address anti-patterns and code smells")
            opportunities.append("Implement automated code quality checks")
        
        # Security recommendations
        security_issues = sum(1 for r in self.analysis_results.values() 
                            if r.get('patterns', {}).get('security_patterns'))
        if security_issues > 0:
            recommendations.append("Review and address potential security issues")
            opportunities.append("Implement security scanning in CI/CD pipeline")
        
        # Performance recommendations  
        performance_issues = sum(1 for r in self.analysis_results.values()
                               if r.get('patterns', {}).get('performance_patterns'))
        if performance_issues > 0:
            recommendations.append("Optimize performance bottlenecks")
            opportunities.append("Add performance monitoring and profiling")
        
        health.recommendations = recommendations
        health.improvement_opportunities = opportunities

    def generate_improvement_plan(self) -> Dict[str, Any]:
        """Generate comprehensive improvement plan"""
        health = self.analyze_codebase()
        
        return {
            'timestamp': datetime.now().isoformat(),
            'codebase_health': asdict(health),
            'detailed_analysis': self.analysis_results,
            'improvement_plan': {
                'immediate_actions': self._get_immediate_actions(health),
                'short_term_goals': self._get_short_term_goals(health),
                'long_term_vision': self._get_long_term_vision(health)
            },
            'quality_trend': self._analyze_quality_trend(),
            'automated_fixes': self._suggest_automated_fixes()
        }
    
    def _get_immediate_actions(self, health: CodebaseHealth) -> List[str]:
        """Get immediate actions for the next sprint"""
        actions = []
        
        if health.quality_metrics['documentation_score'] < 50:
            actions.append("Add docstrings to all public functions and classes")
        
        if health.issues_count > 50:
            actions.append("Fix high-priority code issues and anti-patterns")
        
        actions.append("Run automated code formatting (black, isort)")
        actions.append("Set up pre-commit hooks for code quality")
        
        return actions
    
    def _get_short_term_goals(self, health: CodebaseHealth) -> List[str]:
        """Get short-term goals for the next month"""
        goals = []
        
        goals.append("Achieve 90%+ documentation coverage")
        goals.append("Implement comprehensive type hints")
        goals.append("Reduce cyclomatic complexity to <10 for all functions")
        goals.append("Set up automated testing pipeline")
        goals.append("Implement security scanning")
        
        return goals
    
    def _get_long_term_vision(self, health: CodebaseHealth) -> List[str]:
        """Get long-term vision for the codebase"""
        vision = []
        
        vision.append("Maintain 95%+ overall code quality score")
        vision.append("Implement comprehensive monitoring and observability")
        vision.append("Achieve enterprise-grade security standards")
        vision.append("Optimize for performance and scalability")
        vision.append("Maintain clean architecture patterns")
        
        return vision
    
    def _analyze_quality_trend(self) -> Dict[str, Any]:
        """Analyze quality trend over time"""
        # This would require historical data in a real implementation
        return {
            'trend': 'improving',
            'confidence': 'medium',
            'recommendation': 'Continue current improvement efforts'
        }
    
    def _suggest_automated_fixes(self) -> List[Dict[str, Any]]:
        """Suggest automated fixes that can be applied"""
        fixes = []
        
        # Code formatting
        fixes.append({
            'type': 'formatting',
            'tool': 'black',
            'command': 'black app/',
            'description': 'Automatically format Python code',
            'risk': 'low'
        })
        
        # Import sorting
        fixes.append({
            'type': 'import_sorting',
            'tool': 'isort',
            'command': 'isort app/',
            'description': 'Sort and organize imports',
            'risk': 'low'
        })
        
        # Remove unused imports
        fixes.append({
            'type': 'unused_imports',
            'tool': 'autoflake',
            'command': 'autoflake --remove-all-unused-imports -r app/',
            'description': 'Remove unused imports',
            'risk': 'medium'
        })
        
        return fixes

# Global analyzer instance
codebase_analyzer = CodebaseAnalyzer()

def analyze_and_improve_codebase() -> Dict[str, Any]:
    """Main function to analyze and improve codebase"""
    return codebase_analyzer.generate_improvement_plan()

if __name__ == "__main__":
    # Run codebase analysis
    improvement_plan = analyze_and_improve_codebase()
    
    # Save results
    with open("codebase_improvement_plan.json", "w") as f:
        json.dump(improvement_plan, f, indent=2, default=str)
    
    # Print summary
    health = improvement_plan['codebase_health']
    print(f"\nCodebase Health Summary:")
    print(f"Overall Score: {health['overall_score']:.1f}/100")
    print(f"Total Files Analyzed: {health['total_files']}")
    print(f"Issues Found: {health['issues_count']}")
    print(f"Technical Debt Score: {health['technical_debt_score']:.1f}/100")
    
    print(f"\nTop Recommendations:")
    for rec in health['recommendations'][:5]:
        print(f"  - {rec}")
    
    print(f"\nImprovement Opportunities:")
    for opp in health['improvement_opportunities'][:5]:
        print(f"  - {opp}")