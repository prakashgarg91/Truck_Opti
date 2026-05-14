# Runtime Error Loop

Purpose: make runtime-error capture and runtime-error resolution explicit, repo-local, and truthful in Truck_Opti.

## Commands

```powershell
powershell -ExecutionPolicy Bypass -File .\runtime-error-loop.ps1 -Mode latest
powershell -ExecutionPolicy Bypass -File .\runtime-error-loop.ps1 -Mode capture
powershell -ExecutionPolicy Bypass -File .\runtime-error-loop.ps1 -Mode resolve
```

## Latest

`-Mode latest` is the status readout. It does not invent commands and it does not claim coverage the repo does not have.

Today this repo reports:

- capture: `npm run track-errors`
- resolve: `npm run test:hidden-errors`

`latest` also prints the newest runtime/error artifacts it can actually find so the next fix slice starts from concrete evidence instead of guesswork.

## Capture

Capture preference order:

1. `npm run track-errors`
2. `npm run start`
3. `npm run dev`
4. local Python entrypoints: `launcher.py`, `main.py`, `app.py`, `manage.py`

Truck_Opti now exposes both a capture wrapper and a frontend dev wrapper.

- `npm run track-errors` captures the existing `npm run start` runtime output to an ignored log under `logs/autonomous/`.
- `npm run dev` delegates to `frontend` Vite development mode.

## Resolve

Resolve preference order:

1. `npm run test:hidden-errors`
2. `powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\launch-check.ps1`
3. `npm test`
4. `python -m pytest`

Truck_Opti now exposes both a targeted hidden-error lane and a simpler test fallback.

- `npm run test:hidden-errors` runs the repo's deep error scan, glue check, and frontend unit tests, and writes `0.dev-matrix/test-reports/hidden-error-latest.json`.
- `npm test` delegates to `cd frontend && npm run test:unit`.
- `powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\launch-check.ps1` remains the heavier repo-local resolve fallback and still delegates to `scripts/launch-readiness.ps1`.

## Repo-Aware Command Detection Policy

- Prefer the first real local command in the ordered list above.
- If a higher-priority command does not exist in this repo, fall through to the next real command.
- If neither capture nor resolve exists yet, report the gap explicitly instead of masking it with a guessed command.
- Treat generic newest-log output as a clue, not as proof that the log belongs to the current Truck_Opti runtime failure.

## Artifacts

- `logs/autonomous/local-bot-*.log` when available
- newest `logs/*.log` when available
- `0.dev-matrix/error-logs/*.log` when available
- `0.dev-matrix/test-reports/hidden-error-latest.json` from `npm run test:hidden-errors`
- `0.dev-matrix/test-reports/launch-check-status.json` when available

## Local Resolution Loop

1. Run `powershell -ExecutionPolicy Bypass -File .\runtime-error-loop.ps1 -Mode latest`.
2. If the newest generic log is unrelated noise, move straight to `-Mode capture`.
3. Reproduce with the detected capture command and copy the exact error text forward.
4. Fix only the local seam identified by that runtime evidence.
5. Run `powershell -ExecutionPolicy Bypass -File .\runtime-error-loop.ps1 -Mode resolve` immediately after the fix.
6. Record the exact runtime proof path in `0.dev-matrix/AI-HANDOFF.md` when the issue matters to the next session.