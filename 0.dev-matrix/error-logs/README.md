# 📁 Error Logs Directory

> **Purpose:** Store debugging session logs and raw output  
> **Note:** Bug reports are tracked in `../issues.json`

---

## 📋 Directory Structure

```
error-logs/
├── README.md           # This file
└── [debug logs]        # Raw debug output files
```

## 🐛 Issue Tracking

Issues are tracked in JSON format for better tooling support:

| File | Purpose |
|------|---------|
| `../issues.json` | All bugs and issues |
| `../test-reports/*.json` | Detailed test results |

---

## 📋 Log Types

| Type | File Pattern | Purpose |
|------|--------------|---------|
| Debug | `debug_YYYY-MM-DD_HH-MM-SS.log` | Raw debug output |
| Server | `server_YYYY-MM-DD_HH-MM-SS.log` | Server runtime logs |
| Crash | `crash_YYYY-MM-DD_HH-MM-SS.log` | Crash dumps |

---

## 🔄 Adding New Issues

Add issues to `../issues.json` following this structure:

```json
{
  "id": "BUG-XXX",
  "severity": "critical|high|medium|low",
  "title": "Short description",
  "component": "affected-file.js",
  "status": "open|in-progress|resolved|wont-fix"
}
```

## 📊 Test Reports

Test reports use schema at `../test-reports/schema.json`

Naming convention: `YYYY-MM-DD-[type]-test.json`
