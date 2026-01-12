# 📊 Test Reports

> **Standardized JSON-based test reporting system**

## 📁 Directory Structure

```
test-reports/
├── README.md                        # This file
├── schema.json                      # JSON Schema for test reports
└── YYYY-MM-DD-[type]-test.json      # Individual test reports
```

## 📋 Report Types

| Type | Description | Trigger |
|------|-------------|---------|
| `unit` | Unit test results | `npm test` |
| `integration` | Integration test results | CI/CD |
| `e2e` | End-to-end test results | Full test run |
| `manual` | Manual testing session | AI/human tester |
| `regression` | Regression test results | Before release |
| `smoke` | Quick health checks | After deploy |

## 🔧 Schema

All reports follow `schema.json` which defines:

- **meta**: Report metadata (tester, time, environment)
- **summary**: Pass/fail statistics
- **phases**: Test phases with individual test cases
- **issues**: Discovered bugs and issues
- **metrics**: Coverage, performance, reliability

## 📝 Creating a Report

### Manual (AI Testers)

```json
{
  "$schema": "./schema.json",
  "meta": {
    "id": "TR-YYYY-MM-DD-NNN",
    "type": "manual",
    "tester": { "id": "AGENT-ID", "name": "AI Name" },
    "startTime": "ISO-8601",
    "endTime": "ISO-8601"
  },
  "summary": {
    "total": 100,
    "passed": 90,
    "failed": 5,
    "blocked": 5
  },
  "phases": [...],
  "issues": [...]
}
```

### Automated (Vitest)

```bash
npm test -- --reporter=json > test-reports/YYYY-MM-DD-unit-test.json
```

## 📈 Viewing Reports

Reports can be:
1. Viewed directly in VS Code (JSON formatting)
2. Parsed by tooling for dashboards
3. Compared across versions for regression analysis
4. Aggregated for metrics and trends

## 🔗 Related Files

- **Issues:** `../issues.json` - Bug tracking
- **Features:** `../features.json` - Feature status
- **Test Guide:** `../TEST.md` - Manual test procedures
