# Fleet lessons for truck-opti

Generated 2026-11-06T15:38:30.394Z from 3 job outcomes. Appended to every brief on the next compile.

## zcode-test: 0/3 landed, 0 first-pass, about 4 min per job
- 3x "DEAD" was NOT a worker failure: the worker finished, but job.json stayed RUNNING until `collect`, so the loop declared the job dead after timeout+10 min (fixed 2026-11-07 by collecting finished jobs; see fleet_collect_sidecar.py).
- LESSON: none from DEAD. Real gate failures to avoid: unused locals in test files fail `tsc --noEmit` (TS6133): remove unused variables and imports before finishing.
