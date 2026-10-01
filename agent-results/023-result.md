# TO-133 Result — Make local backup restoration safe and complete

**Verdict: PASS** (ready for GPT-6 review; not DONE, not deployed)
**Date:** 2026-10-01 · **Worker:** GLM-5.3 Flash (TO133) · **Branch:** `main` @ `55b82790` + 1 commit

## What was wrong (confirmed in source before change)

1. **Encrypted restore was structurally broken.** `encryptBytes`/`backupNow` write salt(16)||IV(12)||ciphertext (`frontend/src/lib/backup.ts:70-78` old), but old `restoreNow` passed the complete stored blob to `decryptBytes`, which treated bytes 0-12 as IV, and pulled the salt from local `sync_meta` (`drive.salt`) instead of the blob (`frontend/src/lib/backup.ts:196-202` old, `backup.ts:80-85` old). Password-protected restore could never succeed and depended on device-local metadata.
2. **Restore could erase local data.** `importSnapshot` ran `TRUNCATE trucks, cartons, agency_profiles, sync_meta` and then inserted rows with no transaction (`frontend/src/lib/backup.ts:92` old) — any mid-import failure (bad row, constraint violation) left the database truncated.
3. **Export/schema drift.** `localDb.ts` MIGRATION_V2 added `google_sub`/`email` to `agency_profiles` (`frontend/src/lib/localDb.ts:11-14`), but the export column list omitted them (`frontend/src/lib/backup.ts:34` old) — Google linkage was silently dropped from backups.

## What was built (all inside allowed scope: backup.ts, backup.test.ts, driveClient.ts)

- **Self-contained versioned envelope (v2).** Stored bytes are now JSON: `{format:'truckopti-backup', envelopeVersion:1, createdAt, cipher:{algorithm,kdf{PBKDF2/SHA-256/50000},salt,iv}|null, integrity:{algorithm:'sha256',payloadSha256}, payload|ciphertext}`. Salt/IV/KDF/integrity travel inside the bytes — no local metadata needed. Plain backups embed the payload; encrypted backups embed base64 AES-GCM ciphertext over the payload bytes.
- **Documented legacy read paths.** (a) Pre-envelope plain snapshot JSON (`{version, tables}`, no integrity metadata — documented limitation) is validated and imported; (b) pre-envelope encrypted binary (salt||IV||ct, the old `encryptBytes` framing) is decrypted with the salt taken from the blob header — this fixes bug 1 for old backups too.
- **Auth + integrity before any destructive import.** `decodeEnvelope` decrypts (AES-GCM authentication) and verifies `payloadSha256` of the payload bytes; `restoreNow` additionally cross-checks the payload hash against Drive-stored `appProperties.snapshotHash` when present. Only then does `importSnapshot` run.
- **Full snapshot validation.** `validateSnapshot` rejects: unsupported versions (supports 1 and 2 only), unknown tables, unknown/invalid columns (columns must be a subset of the current schema — legacy smaller snapshots migrate, unknown columns fail closed), malformed rows (arity), non-scalar values, and NULLs in NOT NULL columns. Empty table maps are rejected.
- **Atomic import.** `importSnapshot` now runs TRUNCATE + all INSERTs inside `db.transaction(...)` (PGlite `transaction<T>` API, `node_modules/@electric-sql/pglite/dist/pglite-BdeXTuy6.d.ts:914`). Any failure rolls back; original data survives byte-identical.
- **Schema/export alignment.** `agency_profiles` export list now includes `google_sub`, `email`; export snapshot version is 2. `decryptBytes(password, blob)` now consumes the complete salt||IV||ct framing (single canonical contract; helper test updated to match).
- **Fresh-device restore.** `driveClient.findBackupFile()` (Drive `files.list` by name `truckopti-agency.db`, `frontend/src/lib/driveClient.ts:69-77`) plus `restoreNow({fileId})` override: restore works after total local metadata loss (`opts.fileId ?? sync_meta ?? Drive search`).
- **Credential exclusion.** `sync_meta` export drops keys matching `/(token|secret|password|credential|api[_-]?key)/i` (defense in depth; the Drive token itself lives in localStorage, never the DB). Ordinary metadata (fileId, rev, lastHash…) is still exported and restored.
- **Honest scoping comments.** `backup.ts` header states this is the DEVICE backup path (local PGlite → user's own Drive), NOT the hosted Supabase production backup, and that Drive's revision check is a preflight comparison, NOT an atomic compare-and-swap (`driveClient.ts:3-4` already said the same).
- `localDb.ts` needed **no change** — the schema already had the linkage columns; the misalignment was the export list. `BackupSection.tsx` needed **no change** — its consumed report shape (`tables`/`storedBytes`/`conflict`) is unchanged.

## Changed files

- `frontend/src/lib/backup.ts` (rewritten: envelope, validation, transactional import, legacy paths)
- `frontend/src/lib/backup.test.ts` (rewritten + extended: 4 → 18 tests)
- `frontend/src/lib/driveClient.ts` (+ `findBackupFile`)

## Red/green regression evidence

- **RED** (new tests against unchanged implementation): `npx vitest run src/lib/backup.test.ts` in `frontend/` → **11 failed | 7 passed (18)**. Failures were exactly the briefed defects: encrypted `backupNow→restoreNow` (wrong framing), metadata-loss restore ("No backup found on this device yet"), wrong-password/truncated/tampered/unsupported-version/malformed-row/mid-import cases (no validation, no transaction), Google linkage missing from export, legacy binary blob unrestoreable, credential row present in snapshot.
- **GREEN** (same tests after implementation): **18/18 passed** (see verification).
- The mid-import-failure test is the atomicity proof: a snapshot whose `trucks` rows contain a duplicate primary key passes row validation, fails at the DB INSERT inside the transaction, and the pre-existing four-table hash is asserted byte-identical afterwards. Without the transaction this test wipes the database (red behavior).

## Verification (all run in `D:\Github\Truck_Opti\frontend`, this session)

| Check | Command | Exit | Result | Evidence class |
|---|---|---|---|---|
| Red regression run | `npx vitest run src/lib/backup.test.ts` | 1 | 11 failed / 7 passed (pre-fix, expected) | mock Drive transport + in-memory PGlite (`memory://`) |
| Focused backup+localApi | `npx vitest run src/lib/backup.test.ts src/services/localApi.test.ts` | 0 | 25/25 passed (backup 18, localApi 7) | mock / local in-memory DB |
| Full unit suite | `npx vitest run` | 0 | 453/453 passed, 28 files | mock / local in-memory DB |
| Typecheck | `npx tsc` | 0 | no errors | local |
| Build | `npm run build` (tsc && vite build) | 0 | built in 10.73s, PWA 85 precache entries | local |
| Lint | `npm run lint` | 0 | 0 errors / 26 warnings (baseline unchanged per TASKS.md 2026-09-30 log) | local |

Required-check coverage mapping (all with pre-existing-DB-hash-unchanged assertions via `dbHash()` over all four tables):
encrypted roundtrip ✓ (restore after full `sync_meta` wipe — no salt metadata), plain roundtrip ✓ (kept), wrong password ✓ (envelope + legacy blob), truncated ciphertext ✓, tampered data ✓ (stale integrity hash), unsupported version ✓ (v99), malformed row ✓ (arity), forced mid-import failure ✓ (duplicate PK → rollback), fresh-device restore ✓ (metadata loss + Drive name search), schema migration ✓ (legacy v1 columns import; v2 Google linkage round-trips), missing token ✓ (no token/transport), revoked token ✓ (HTTP 401), stale revision ✓ (kept pre-existing conflict test), credential exclusion ✓.

## Evidence level and limits

- **All evidence is mock/local**: fake in-process Drive transports and the in-memory PGlite engine (`memory://`, same Postgres/WASM code path as production IndexedDB-backed use). No real Google Drive account, no hosted Supabase, no staging/production run.
- **Not verified live:** real Drive `files.list`/multipart behavior against Google endpoints, IndexedDB persistence across browser restarts, and browser UI flows. These need a browser/owner environment and are covered by the existing UI contract unchanged.

## Unresolved risks / recommendations for review

1. PBKDF2 iteration count remains 50000 (legacy-compatible). The envelope now carries KDF metadata, so a future task can raise iterations for new backups without breaking old reads.
2. A stale local `drive.fileId` whose Drive file was deleted makes `backupNow` fail with `drive upload 404` (pre-existing behavior preserved — readHead 404 → null → PATCH 404). A "recreate file on 404" policy would be a small follow-up if desired.
3. Legacy plain snapshots carry no integrity metadata (cannot be added retroactively); they are still validated before import.

## Owner gates

None new for this task. All work is local code+tests. Production/owner-gated surfaces (hosted Supabase recovery, real Drive account verification, deployments) remain governed by the standing gates in TASKS.md.

## Git state

- Branch `main`, 1 new commit on top of `55b82790` (not pushed — owner-gated per policy).
- Staged/committed: `frontend/src/lib/backup.ts`, `frontend/src/lib/backup.test.ts`, `frontend/src/lib/driveClient.ts`, `TASKS.md` (TO-133 row only), `agent-results/023-result.md`.
- Pre-existing untracked items preserved untouched: `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/`.
- 13 historical AI Work Factory worktrees remain parked for TO-140 (unchanged).

## Next recommendation

GPT-6 review of the envelope format and legacy-read contract (especially: legacy plain snapshots accepted without integrity metadata), then TO-134 (customer cloud business journey) or TO-136 (admin authority/RLS proof) per the TASKS.md ordering.
