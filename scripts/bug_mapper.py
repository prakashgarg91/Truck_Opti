#!/usr/bin/env python3
"""
Comprehensive Bug Mapper for TruckOpti
Scans codebase for common bugs, issues, and code quality problems
"""

import os
import re
import json
import subprocess
from pathlib import Path
from datetime import datetime
from collections import defaultdict
from typing import Dict, List, Tuple, Any

# Project root
ROOT = Path("d:/Github/Truck_Opti")
FRONTEND = ROOT / "frontend"
BACKEND = ROOT / "apps/web"

class BugMapper:
    def __init__(self):
        self.bugs = []
        self.stats = defaultdict(int)

    def add_bug(self, category: str, severity: str, file: str, line: int,
                message: str, code: str = "", fix_hint: str = ""):
        self.bugs.append({
            "category": category,
            "severity": severity,  # CRITICAL, HIGH, MEDIUM, LOW, INFO
            "file": file,
            "line": line,
            "message": message,
            "code": code[:100] if code else "",
            "fix_hint": fix_hint
        })
        self.stats[category] += 1

    def scan_typescript_issues(self):
        """Scan for TypeScript type issues"""
        print("🔍 Scanning TypeScript files...")

        # Common TypeScript issue patterns
        patterns = [
            (r"any\)", "Type Safety", "Using 'any' type - lose type safety"),
            (r"@ts-ignore", "TS Disable", "TypeScript checks disabled"),
            (r"@ts-nocheck", "TS Disable", "TypeScript checks disabled for file"),
            (r"as\s+\w+", "Type Assertion", "Type assertion - potential type mismatch"),
            (r"!:", "Non-null assertion", "Non-null assertion - may cause runtime errors"),
            (r"console\.(log|warn|error)\s*\(", "Console Usage", "Console statement - remove in prod"),
        ]

        for ts_file in FRONTEND.rglob("*.ts"):
            if "node_modules" in str(ts_file):
                continue
            try:
                content = ts_file.read_text(encoding='utf-8', errors='ignore')
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    for pattern, category, msg in patterns:
                        if re.search(pattern, line):
                            self.add_bug(
                                category, "LOW" if category != "Type Safety" else "MEDIUM",
                                str(ts_file.relative_to(ROOT)), i, msg, line.strip()
                            )
            except Exception:
                pass

    def scan_react_issues(self):
        """Scan for React-specific issues"""
        print("⚛️ Scanning React files...")

        patterns = [
            (r"setState\([^)]*\)[\s;]*\)", "React State", "setState with callback - check async"),
            (r"useEffect\([^)]*\)[\s\n]*\{[\s\n]*\}", "React Hooks", "Empty useEffect - may need deps"),
            (r"dangerouslySetInnerHTML", "Security", "dangerouslySetInnerHTML - XSS risk"),
            (r"innerHTML\s*=", "Security", "innerHTML assignment - XSS risk"),
            (r"eval\s*\(", "Security", "eval() usage - code injection risk"),
            (r"document\.write", "Deprecated", "document.write - deprecated"),
        ]

        for tsx_file in FRONTEND.rglob("*.tsx"):
            if "node_modules" in str(tsx_file):
                continue
            try:
                content = tsx_file.read_text(encoding='utf-8', errors='ignore')
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    for pattern, category, msg in patterns:
                        if re.search(pattern, line, re.IGNORECASE):
                            self.add_bug(
                                category, "HIGH" if "Security" in category else "MEDIUM",
                                str(tsx_file.relative_to(ROOT)), i, msg, line.strip()
                            )
            except Exception:
                pass

    def scan_python_issues(self):
        """Scan for Python-specific issues"""
        print("🐍 Scanning Python files...")

        # Skip venv and test files for main scan
        exclude_dirs = {'venv', '.venv', '__pycache__', 'tests', 'test_', '.venv'}

        patterns = [
            (r"except\s*:", "Bare Except", "Bare except clause - catches all exceptions"),
            (r"print\s*\(", "Print Statement", "print() - use logging instead"),
            (r"TODO|FIXME|XXX|HACK", "Todo Comment", "TODO/FIXME comment found"),
            (r"pass\s*$", "Empty Handler", "Empty exception handler - pass"),
            (r"os\.system\s*\(", "Shell Command", "os.system - shell injection risk"),
            (r"subprocess\.call\s*\([^,)]*\s+shell\s*=\s*True", "Shell Command", "subprocess with shell=True"),
            (r"sqlalchemy.*\.execute\s*\(", "SQL Injection", "Raw SQL - check for injection"),
            (r"\.format\s*\([^)]*\+", "String Format", "String concatenation in format"),
            (r"f['\"].*\{.*\}", "F-string Risk", "F-string with complex expressions"),
        ]

        for py_file in BACKEND.rglob("*.py"):
            # Skip test files and venv
            if any(ex in str(py_file) for ex in exclude_dirs):
                continue

            try:
                content = py_file.read_text(encoding='utf-8', errors='ignore')
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    # Skip comments
                    stripped = line.strip()
                    if stripped.startswith('#'):
                        continue

                    for pattern, category, msg in patterns:
                        if re.search(pattern, line, re.IGNORECASE):
                            self.add_bug(
                                category, "HIGH" if "Security" in category else "MEDIUM",
                                str(py_file.relative_to(ROOT)), i, msg, line.strip()
                            )
            except Exception:
                pass

    def scan_import_issues(self):
        """Scan for broken imports"""
        print("📦 Scanning imports...")

        # Check for common missing imports in React files
        react_files = list(FRONTEND.rglob("*.tsx"))
        for tsx_file in react_files:
            if "node_modules" in str(tsx_file):
                continue
            try:
                content = tsx_file.read_text(encoding='utf-8', errors='ignore')

                # Check for React imports
                if 'useState' in content or 'useEffect' in content:
                    if 'from \'react\'' not in content and 'from "react"' not in content:
                        if 'import React' not in content:
                            self.add_bug(
                                "Missing Import", "HIGH",
                                str(tsx_file.relative_to(ROOT)), 1,
                                "React hooks used but React not imported"
                            )
            except Exception:
                pass

    def scan_secrets(self):
        """Scan for potential secrets in code"""
        print("🔐 Scanning for secrets...")

        secret_patterns = [
            (r"api_key\s*=\s*['\"][^'\"]{8,}['\"]", "Hardcoded Secret", "API key hardcoded"),
            (r"secret_key\s*=\s*['\"][^'\"]{8,}['\"]", "Hardcoded Secret", "Secret key hardcoded"),
            (r"password\s*=\s*['\"][^'\"]{4,}['\"]", "Hardcoded Secret", "Password hardcoded"),
            (r"token\s*=\s*['\"][A-Za-z0-9_\-]{20,}['\"]", "Hardcoded Token", "Token hardcoded"),
            (r"sk_live_", "Stripe Secret", "Live Stripe key detected"),
            (r"AKIA[0-9A-Z]{16}", "AWS Key", "AWS access key detected"),
        ]

        for ext in ['*.ts', '*.tsx', '*.py', '*.js', '*.json']:
            for file in ROOT.rglob(ext):
                if any(x in str(file) for x in ['node_modules', '.venv', 'venv', 'dist', '.env']):
                    continue

                try:
                    content = file.read_text(encoding='utf-8', errors='ignore')
                    lines = content.split('\n')
                    for i, line in enumerate(lines, 1):
                        for pattern, category, msg in secret_patterns:
                            if re.search(pattern, line, re.IGNORECASE):
                                # Mask the secret
                                masked = re.sub(r"['\"][^'\"]{3,}[^'\"]{3}['\"]", "'***'", line)
                                self.add_bug(
                                    category, "CRITICAL",
                                    str(file.relative_to(ROOT)), i, msg, masked[:80]
                                )
                except Exception:
                    pass

    def run_typescript_check(self):
        """Run TypeScript compiler check"""
        print("📋 Running TypeScript check...")

        try:
            result = subprocess.run(
                ['npx', 'tsc', '--noEmit'],
                cwd=str(FRONTEND),
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode != 0:
                # Parse TypeScript errors
                for line in result.stdout.split('\n'):
                    if ': error TS' in line:
                        # Format: file.ts(line,col): error TSxxxx: message
                        match = re.match(r'(.+?)\((\d+),(\d+)\):\s+error\s+TS\d+:\s+(.+)', line)
                        if match:
                            file, line, col, msg = match.groups()
                            self.add_bug(
                                "TypeScript Error", "HIGH",
                                str(Path(file).relative_to(ROOT)), int(line),
                                msg
                            )
        except subprocess.TimeoutExpired:
            self.add_bug("TS Check Timeout", "INFO", "tsc", 0, "TypeScript check timed out")
        except Exception as e:
            self.add_bug("TS Check Failed", "INFO", "tsc", 0, str(e))

    def scan_memory_leaks(self):
        """Scan for potential memory leaks"""
        print("💾 Scanning for memory leak patterns...")

        patterns = [
            (r"addEventListener.*\n\s*{?\s*}", "Event Listener", "Empty event listener"),
            (r"setInterval\s*\([^)]*(?!\),)", "Timer Leak", "setInterval without clearInterval"),
            (r"useEffect[^}]*\{\s*return\s*\(\)\s*=>\s*\{\s*\}", "Cleanup Missing", "useEffect without cleanup"),
        ]

        for tsx_file in FRONTEND.rglob("*.tsx"):
            if "node_modules" in str(tsx_file):
                continue
            try:
                content = tsx_file.read_text(encoding='utf-8', errors='ignore')
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    for pattern, category, msg in patterns:
                        if re.search(pattern, line, re.DOTALL):
                            self.add_bug(
                                category, "MEDIUM",
                                str(tsx_file.relative_to(ROOT)), i, msg
                            )
            except Exception:
                pass

    def generate_report(self) -> Dict:
        """Generate comprehensive bug report"""
        print("\n" + "="*60)
        print("🐛 COMPREHENSIVE BUG MAPPER REPORT")
        print("="*60)

        # Sort by severity
        severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
        self.bugs.sort(key=lambda x: (severity_order.get(x['severity'], 5), x['file'], x['line']))

        # Summary
        print(f"\n📊 SUMMARY")
        print(f"   Total Issues: {len(self.bugs)}")
        for cat, count in sorted(self.stats.items(), key=lambda x: -x[1]):
            print(f"   • {cat}: {count}")

        severity_counts = defaultdict(int)
        for bug in self.bugs:
            severity_counts[bug['severity']] += 1

        print(f"\n📈 BY SEVERITY:")
        for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]:
            if severity_counts[sev]:
                print(f"   • {sev}: {severity_counts[sev]}")

        # File breakdown
        file_counts = defaultdict(int)
        for bug in self.bugs:
            file_counts[bug['file']] += 1

        print(f"\n📁 TOP FILES WITH ISSUES:")
        for file, count in sorted(file_counts.items(), key=lambda x: -x[1])[:10]:
            print(f"   • {file}: {count}")

        # Critical issues
        critical = [b for b in self.bugs if b['severity'] == 'CRITICAL']
        if critical:
            print(f"\n🚨 CRITICAL ISSUES ({len(critical)}):")
            for bug in critical[:5]:
                print(f"   [{bug['file']}:{bug['line']}] {bug['message']}")

        # High issues
        high = [b for b in self.bugs if b['severity'] == 'HIGH']
        if high:
            print(f"\n⚠️ HIGH PRIORITY ISSUES ({len(high)}):")
            for bug in high[:10]:
                print(f"   [{bug['file']}:{bug['line']}] {bug['message']}")

        return {
            "timestamp": datetime.now().isoformat(),
            "total_bugs": len(self.bugs),
            "by_category": dict(self.stats),
            "by_severity": dict(severity_counts),
            "bugs": self.bugs
        }

def main():
    mapper = BugMapper()

    # Run all scans
    mapper.scan_typescript_issues()
    mapper.scan_react_issues()
    mapper.scan_python_issues()
    mapper.scan_import_issues()
    mapper.scan_secrets()
    mapper.scan_memory_leaks()

    # Run TypeScript check (can be slow)
    mapper.run_typescript_check()

    # Generate report
    report = mapper.generate_report()

    # Save JSON report
    report_file = ROOT / "logs" / "bug_mapper_report.json"
    report_file.parent.mkdir(exist_ok=True)
    report_file.write_text(json.dumps(report, indent=2))
    print(f"\n📄 Full report saved to: {report_file}")

    # Print top issues
    print("\n" + "="*60)
    print("🎯 TOP ACTIONABLE ISSUES")
    print("="*60)

    actionable = [b for b in mapper.bugs if b['severity'] in ['CRITICAL', 'HIGH']]
    for i, bug in enumerate(actionable[:15], 1):
        print(f"\n{i}. [{bug['severity']}] {bug['file']}:{bug['line']}")
        print(f"   {bug['message']}")
        if bug['code']:
            print(f"   Code: {bug['code'][:60]}...")

    return len(actionable)

if __name__ == "__main__":
    issues = main()
    print(f"\n✅ Bug mapping complete! Found {issues} critical/high issues.")
