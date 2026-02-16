#!/usr/bin/env python3
"""
Enhanced Comprehensive Bug Mapper for TruckOpti
Includes: Security, Performance, Database, API, UI, and Runtime issues
"""

import os
import re
import json
import subprocess
from pathlib import Path
from datetime import datetime
from collections import defaultdict
from typing import Dict, List, Tuple, Any

ROOT = Path("d:/Github/Truck_Opti")
FRONTEND = ROOT / "frontend"
BACKEND = ROOT / "apps/web"

class EnhancedBugMapper:
    def __init__(self):
        self.bugs = []
        self.stats = defaultdict(int)
        self.stats_by_file = defaultdict(lambda: defaultdict(int))

    def add_bug(self, category: str, severity: str, file: str, line: int,
                message: str, code: str = "", fix_hint: str = ""):
        self.bugs.append({
            "category": category,
            "severity": severity,
            "file": file,
            "line": line,
            "message": message,
            "code": code[:100] if code else "",
            "fix_hint": fix_hint
        })
        self.stats[category] += 1
        self.stats_by_file[file][category] += 1

    def scan_security(self):
        """Security vulnerabilities"""
        print("🔐 Scanning security issues...")

        patterns = [
            (r"eval\s*\(", "Security", "CRITICAL", "eval() - code injection risk"),
            (r"exec\s*\(", "Security", "CRITICAL", "exec() - code injection risk"),
            (r"os\.system\s*\(", "Security", "HIGH", "os.system - shell injection"),
            (r"subprocess\.\w+\([^)]*shell\s*=\s*True", "Security", "HIGH", "subprocess shell=True"),
            (r"pickle\.loads\s*\(", "Security", "HIGH", "pickle deserialization risk"),
            (r"yaml\.load\s*\([^)]*(?!Loader=yaml\.SafeLoader)", "Security", "HIGH", "unsafe YAML load"),
            (r"password\s*=\s*['\"][^'\"]{4,}['\"]", "Hardcoded Secret", "CRITICAL", "hardcoded password"),
            (r"api_key\s*=\s*['\"][a-zA-Z0-9_\-]{20,}['\"]", "Hardcoded Secret", "CRITICAL", "hardcoded API key"),
            (r"secret_key\s*=\s*['\"][^'\"]{8,}['\"]", "Hardcoded Secret", "CRITICAL", "hardcoded secret"),
            (r"jwt_secret\s*=\s*['\"][^'\"]{8,}['\"]", "Hardcoded Secret", "CRITICAL", "hardcoded JWT secret"),
            (r"smtp_password", "Hardcoded Secret", "CRITICAL", "SMTP password hardcoded"),
            (r"stripe.*secret", "Hardcoded Secret", "CRITICAL", "Stripe secret in code"),
            (r"AKIA[0-9A-Z]{16}", "AWS Key", "CRITICAL", "AWS access key detected"),
            (r"xlsx.*openpyxl.*read_only", "File Security", "MEDIUM", "Excel read-only mode"),
        ]

        for ext in ['*.py', '*.ts', '*.tsx', '*.js']:
            for file in ROOT.rglob(ext):
                if any(x in str(file) for x in ['node_modules', '.venv', 'venv', 'dist', '__pycache__']):
                    continue
                try:
                    content = file.read_text(encoding='utf-8', errors='ignore')
                    lines = content.split('\n')
                    for i, line in enumerate(lines, 1):
                        if line.strip().startswith('#'):
                            continue
                        for pattern, cat, sev, msg in patterns:
                            if re.search(pattern, line, re.IGNORECASE):
                                # Mask secrets
                                masked = re.sub(r"['\"][^'\"]{3,}[^'\"]{3}['\"]", "'***'", line)[:80]
                                self.add_bug(cat, sev, str(file.relative_to(ROOT)), i, msg, masked)
                except:
                    pass

    def scan_async_issues(self):
        """Async/await issues"""
        print("⏰ Scanning async issues...")

        patterns = [
            (r"async\s+def\s+\w+\s*\([^)]*\)\s*(?!.*await)", "Missing Await", "MEDIUM", "async function without await"),
            (r"await\s+.*\n.*\.then\s*\(", "Promise Chain", "LOW", "mixing await with .then()"),
            (r"setTimeout.*\n.*async\s+function", "Async Timeout", "MEDIUM", "async in setTimeout without clear"),
        ]

        for file in BACKEND.rglob("*.py"):
            if any(x in str(file) for x in ['venv', '.venv', '__pycache__', 'test']):
                continue
            try:
                content = file.read_text(encoding='utf-8', errors='ignore')
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    for pattern, cat, sev, msg in patterns:
                        if re.search(pattern, line):
                            self.add_bug(cat, sev, str(file.relative_to(ROOT)), i, msg, line.strip())
            except:
                pass

    def scan_database_issues(self):
        """Database query issues"""
        print("🗄️ Scanning database issues...")

        patterns = [
            (r"\.query\s*\([^)]*\%s[^)]*\+", "SQL Injection", "CRITICAL", "potential SQL injection"),
            (r"\.execute\s*\(\s*['\"].*\%", "SQL Injection", "CRITICAL", "string formatting in SQL"),
            (r"session\.commit\s*\(\s*\)", "Transaction", "HIGH", "commit without error handling"),
            (r"for\s+\w+\s+in\s+session\.query", "N+1 Query", "MEDIUM", "potential N+1 query"),
            (r"\.all\(\).*for\s+", "Memory Issue", "MEDIUM", "loading all records into memory"),
            (r"SELECT\s+\*\s+FROM", "Query Optimization", "LOW", "using SELECT *"),
        ]

        for file in BACKEND.rglob("*.py"):
            if any(x in str(file) for x in ['venv', '__pycache__', 'test']):
                continue
            try:
                content = file.read_text(encoding='utf-8', errors='ignore')
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    for pattern, cat, sev, msg in patterns:
                        if re.search(pattern, line, re.IGNORECASE):
                            self.add_bug(cat, sev, str(file.relative_to(ROOT)), i, msg, line.strip()[:80])
            except:
                pass

    def scan_performance(self):
        """Performance issues"""
        print("⚡ Scanning performance issues...")

        patterns = [
            (r"for\s+\w+\s+in\s+.*:\s*for\s+\w+\s+in", "Nested Loop", "MEDIUM", "nested loops - O(n²)"),
            (r"\.append\s*\(\s*\)\s*in\s+loop", "List Append", "LOW", "repeated append in loop"),
            (r"re\.compile\s*\(\s*['\"][^'\"]+['\"]\s*\)", "Regex Compile", "MEDIUM", "regex compiled in loop"),
            (r"json\.loads\s*\(\s*[^)]+\)\s*in\s+loop", "JSON Parse", "MEDIUM", "JSON parse in loop"),
            (r"len\s*\(\s*list\([^)]*\)\s*\)", "Length Check", "LOW", "len(list()) instead of list"),
        ]

        for ext in ['*.py', '*.ts', '*.tsx']:
            for file in (list(FRONTEND.rglob(ext)) + list(BACKEND.rglob(ext))):
                if "node_modules" in str(file):
                    continue
                try:
                    content = file.read_text(encoding='utf-8', errors='ignore')
                    lines = content.split('\n')
                    for i, line in enumerate(lines, 1):
                        for pattern, cat, sev, msg in patterns:
                            if re.search(pattern, line, re.IGNORECASE):
                                self.add_bug(cat, sev, str(file.relative_to(ROOT)), i, msg, line.strip())
                except:
                    pass

    def scan_memory_leaks(self):
        """Memory leak patterns"""
        print("💾 Scanning memory leaks...")

        patterns = [
            (r"addEventListener\s*\([^,]+,\s*(?!\s*function)", "Event Listener", "MEDIUM", "event listener without cleanup"),
            (r"setInterval\s*\([^)]*(?!\s*,)", "Timer Leak", "MEDIUM", "setInterval without clearInterval"),
            (r"window\.\w+\s*=\s*function", "Global Variable", "MEDIUM", "assigning to window object"),
            (r"localStorage\.setItem", "Storage", "LOW", "localStorage usage"),
            (r"sessionStorage", "Storage", "LOW", "sessionStorage usage"),
        ]

        for tsx_file in FRONTEND.rglob("*.tsx"):
            if "node_modules" in str(tsx_file):
                continue
            try:
                content = tsx_file.read_text(encoding='utf-8', errors='ignore')
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    for pattern, cat, sev, msg in patterns:
                        if re.search(pattern, line, re.IGNORECASE):
                            self.add_bug(cat, sev, str(tsx_file.relative_to(ROOT)), i, msg, line.strip())
            except:
                pass

    def scan_react_issues(self):
        """React-specific issues"""
        print("⚛️ Scanning React issues...")

        patterns = [
            (r"useEffect\s*\([^)]*\)\s*,\s*\[\s*\]", "React Hooks", "MEDIUM", "useEffect with empty deps"),
            (r"set[State]+\s*\([^)]+\s*\+\s*[^)]+\)", "React State", "MEDIUM", "setState with direct update"),
            (r"dangerouslySetInnerHTML", "XSS", "HIGH", "dangerouslySetInnerHTML - XSS risk"),
            (r"innerHTML\s*=", "XSS", "HIGH", "innerHTML assignment - XSS risk"),
            (r"key\s*=\s*\{[^}]*index[^}]*\}", "React Key", "MEDIUM", "using index as key"),
            (r"React\.memo\s*\(\s*\w+\s*\)", "Memo", "LOW", "React.memo without comparison"),
            (r"componentDidUpdate", "Lifecycle", "MEDIUM", "legacy componentDidUpdate"),
        ]

        for tsx_file in FRONTEND.rglob("*.tsx"):
            if "node_modules" in str(tsx_file):
                continue
            try:
                content = tsx_file.read_text(encoding='utf-8', errors='ignore')
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    for pattern, cat, sev, msg in patterns:
                        if re.search(pattern, line, re.IGNORECASE):
                            self.add_bug(cat, sev, str(tsx_file.relative_to(ROOT)), i, msg, line.strip())
            except:
                pass

    def scan_api_issues(self):
        """API/Backend issues"""
        print("🌐 Scanning API issues...")

        patterns = [
            (r"@app\.route.*methods=\[.*'GET'.*'POST'", "HTTP Method", "MEDIUM", "allowing both GET and POST"),
            (r"return\s+jsonify\s*\(\s*\)", "API Response", "MEDIUM", "empty jsonify response"),
            (r"@app\.errorhandler.*\s+def\s+\w+", "Error Handler", "MEDIUM", "error handler without logging"),
            (r"request\.args\.get\s*\([^)]*\)\s*(?!\s*or\s)", "Request Param", "MEDIUM", "unchecked request param"),
            (r"CORS.*allow_origins\s*=\s*\[\s*['\*\"]", "CORS", "HIGH", "CORS wildcard allowed"),
        ]

        for file in BACKEND.rglob("*.py"):
            if any(x in str(file) for x in ['venv', '__pycache__']):
                continue
            try:
                content = file.read_text(encoding='utf-8', errors='ignore')
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    for pattern, cat, sev, msg in patterns:
                        if re.search(pattern, line, re.IGNORECASE):
                            self.add_bug(cat, sev, str(file.relative_to(ROOT)), i, msg, line.strip())
            except:
                pass

    def scan_error_handling(self):
        """Error handling issues"""
        print("⚠️ Scanning error handling...")

        patterns = [
            (r"except\s*:\s*$", "Bare Except", "HIGH", "bare except clause"),
            (r"except\s+\w+\s*:\s+pass", "Empty Except", "MEDIUM", "empty exception handler"),
            (r"try:.*finally:", "Try Finally", "LOW", "try-finally without except"),
            (r"raise\s+Exception\s*\(\s*['\"]", "Raise Exception", "LOW", "raising generic Exception"),
            (r"assert\s+", "Assert Usage", "LOW", "assert in production code"),
        ]

        for file in BACKEND.rglob("*.py"):
            if any(x in str(file) for x in ['venv', '__pycache__']):
                continue
            try:
                content = file.read_text(encoding='utf-8', errors='ignore')
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    if line.strip().startswith('#'):
                        continue
                    for pattern, cat, sev, msg in patterns:
                        if re.search(pattern, line):
                            self.add_bug(cat, sev, str(file.relative_to(ROOT)), i, msg, line.strip()[:60])
            except:
                pass

    def scan_typescript_types(self):
        """TypeScript type issues"""
        print("🔷 Scanning TypeScript issues...")

        patterns = [
            (r":\s*any\b", "Type Safety", "MEDIUM", "using 'any' type"),
            (r"as\s+\w+", "Type Assertion", "LOW", "type assertion"),
            (r"!:", "Non-null", "MEDIUM", "non-null assertion operator"),
            (r"@ts-ignore", "TS Disable", "LOW", "TypeScript ignore"),
            (r"@ts-nocheck", "TS Disable", "LOW", "TypeScript nocheck"),
        ]

        for ts_file in FRONTEND.rglob("*.ts"):
            if "node_modules" in str(ts_file):
                continue
            try:
                content = ts_file.read_text(encoding='utf-8', errors='ignore')
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    for pattern, cat, sev, msg in patterns:
                        if re.search(pattern, line):
                            self.add_bug(cat, sev, str(ts_file.relative_to(ROOT)), i, msg, line.strip()[:60])
            except:
                pass

    def scan_logging(self):
        """Logging issues"""
        print("📝 Scanning logging issues...")

        patterns = [
            (r"print\s*\([^)]+\)", "Print Statement", "LOW", "print instead of logging"),
            (r"console\.log\s*\(", "Console Log", "LOW", "console.log in code"),
            (r"logger\.(debug|info)\s*\(", "Logging", "INFO", "debug/info log"),
            (r"logger\.(warning|error)\s*\(", "Logging", "INFO", "warning/error log"),
        ]

        for ext in ['*.py', '*.ts', '*.tsx']:
            for file in (list(FRONTEND.rglob(ext)) + list(BACKEND.rglob(ext))):
                if "node_modules" in str(file):
                    continue
                try:
                    content = file.read_text(encoding='utf-8', errors='ignore')
                    lines = content.split('\n')
                    for i, line in enumerate(lines, 1):
                        for pattern, cat, sev, msg in patterns:
                            if re.search(pattern, line):
                                self.add_bug(cat, sev, str(file.relative_to(ROOT)), i, msg, line.strip()[:60])
                except:
                    pass

    def scan_deprecated(self):
        """Deprecated patterns"""
        print("🗑️ Scanning deprecated patterns...")

        patterns = [
            (r"document\.write", "Deprecated", "HIGH", "document.write deprecated"),
            (r"React\.createClass", "Deprecated React", "HIGH", "React.createClass deprecated"),
            (r"componentWillMount", "Deprecated Lifecycle", "HIGH", "componentWillMount deprecated"),
            (r"componentWillReceiveProps", "Deprecated Lifecycle", "HIGH", "componentWillReceiveProps deprecated"),
            (r"import\s+\*\s+as\s+\w+\s+from\s+['\"]uuid['\"]", "Import", "LOW", "importing uuid *"),
            (r"from\s+urllib2\s+import", "Python 2", "HIGH", "urllib2 is Python 2"),
        ]

        for ext in ['*.py', '*.ts', '*.tsx', '*.js']:
            for file in ROOT.rglob(ext):
                if any(x in str(file) for x in ['node_modules', '.venv', 'venv']):
                    continue
                try:
                    content = file.read_text(encoding='utf-8', errors='ignore')
                    lines = content.split('\n')
                    for i, line in enumerate(lines, 1):
                        for pattern, cat, sev, msg in patterns:
                            if re.search(pattern, line, re.IGNORECASE):
                                self.add_bug(cat, sev, str(file.relative_to(ROOT)), i, msg, line.strip()[:60])
                except:
                    pass

    def generate_report(self):
        """Generate comprehensive report"""
        severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
        self.bugs.sort(key=lambda x: (severity_order.get(x['severity'], 5), x['file'], x['line']))

        print("\n" + "="*70)
        print("🐛 ENHANCED BUG MAPPER REPORT")
        print("="*70)

        # Summary
        print(f"\n📊 TOTAL ISSUES: {len(self.bugs)}")
        print("\n📈 BY SEVERITY:")
        sev_counts = defaultdict(int)
        for b in self.bugs:
            sev_counts[b['severity']] += 1
        for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]:
            if sev_counts[sev]:
                print(f"   {sev}: {sev_counts[sev]}")

        print("\n📊 BY CATEGORY:")
        for cat, count in sorted(self.stats.items(), key=lambda x: -x[1]):
            print(f"   {cat}: {count}")

        # Top files
        print("\n📁 TOP 15 PROBLEMATIC FILES:")
        file_scores = {}
        for file, cats in self.stats_by_file.items():
            score = cats.get("CRITICAL", 0)*10 + cats.get("HIGH", 0)*5 + cats.get("MEDIUM", 0)
            file_scores[file] = score
        for file, score in sorted(file_scores.items(), key=lambda x: -x[1])[:15]:
            cats = self.stats_by_file[file]
            print(f"   {file}: {score} pts {dict(cats)}")

        # Critical issues
        critical = [b for b in self.bugs if b['severity'] == 'CRITICAL']
        if critical:
            print(f"\n🚨 CRITICAL ISSUES ({len(critical)}):")
            for b in critical[:10]:
                print(f"   [{b['file']}:{b['line']}] {b['message']}")
                if b['code']:
                    print(f"      → {b['code'][:50]}")

        # High issues
        high = [b for b in self.bugs if b['severity'] == 'HIGH']
        if high:
            print(f"\n⚠️ HIGH PRIORITY ISSUES ({len(high)}):")
            for b in high[:10]:
                print(f"   [{b['file']}:{b['line']}] {b['message']}")

        return {
            "timestamp": datetime.now().isoformat(),
            "total": len(self.bugs),
            "by_severity": dict(sev_counts),
            "by_category": dict(self.stats),
            "bugs": self.bugs
        }

def main():
    mapper = EnhancedBugMapper()

    # Run all scans
    mapper.scan_security()
    mapper.scan_async_issues()
    mapper.scan_database_issues()
    mapper.scan_performance()
    mapper.scan_memory_leaks()
    mapper.scan_react_issues()
    mapper.scan_api_issues()
    mapper.scan_error_handling()
    mapper.scan_typescript_types()
    mapper.scan_logging()
    mapper.scan_deprecated()

    # Generate report
    report = mapper.generate_report()

    # Save JSON
    report_file = ROOT / "logs" / "enhanced_bug_report.json"
    report_file.parent.mkdir(exist_ok=True)
    report_file.write_text(json.dumps(report, indent=2))
    print(f"\n📄 Full report: {report_file}")

    return len([b for b in mapper.bugs if b['severity'] in ['CRITICAL', 'HIGH']])

if __name__ == "__main__":
    issues = main()
    print(f"\n✅ Scan complete! Found {issues} critical/high issues.")
