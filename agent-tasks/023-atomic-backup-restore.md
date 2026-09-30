# TO-133 — Make local backup restoration safe and complete

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** READY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** None. Use fake Drive transports and an isolated in-memory PGlite database.

## Goal and evidence

encryptBytes writes salt||IV||ciphertext; helper tests pass enc.slice(16) to decryptBytes, but restoreNow passes the complete stored buffer and relies on salt in local metadata. importSnapshot truncates before inserts without a transaction; Google linkage fields added to local schema are absent from the export column list.

## Allowed scope

frontend/src/lib/backup.ts; frontend/src/lib/backup.test.ts; frontend/src/lib/driveClient.ts; frontend/src/lib/localDb.ts only for schema/export alignment; backup UI call sites only where format migration requires it.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Create regression tests first for encrypted backupNow -> restoreNow, restore after loss of local metadata, corrupted snapshot and partial insertion failure. Define a self-contained versioned backup envelope carrying salt/IV/format/integrity metadata and a documented legacy-read path. Authenticate/decrypt and validate every table, column and row before destructive import. Import within a transaction; any failure leaves original local data intact. Verify downloaded bytes against integrity metadata and align exported fields with the current local schema, including Google linkage. Exclude raw provider credentials from snapshots. Clearly distinguish device backup from cloud production backup; do not claim Drive's preflight revision check is an atomic compare-and-swap.

## Required checks

Encrypted/plain roundtrip, wrong password, truncated ciphertext, tampered data, unsupported version, malformed row, forced mid-import failure, fresh-device restore, schema migration, missing/revoked Drive token and stale revision. Assert pre-existing DB hash unchanged after every failure. Run backup/localApi tests, full unit suite and build.

## Acceptance

Restore reliably recovers all supported local data and cannot erase it on invalid input or partial failure.

## Handoff

Write agent-results/023-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
