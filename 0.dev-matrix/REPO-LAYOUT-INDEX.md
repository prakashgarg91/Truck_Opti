# Repo Layout Index

Purpose: create a machine-readable file binding map so orphan docs, isolated scripts, and layout drift are visible before they turn into maintenance debt.

## Standard Entry

From a repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\repo-layout-index.ps1
```

## Outputs

- `graphify-out/repo-layout-index.json`
- `graphify-out/REPO_LAYOUT.md`
- `graphify-out/repo-layout-map.html`

## What It Detects

- directory and file inventory
- path references across code, config, and docs
- unlinked documents
- orphan documents with no inbound references
- isolated scripts or config files with no detected relationships

## How To Use It

Run it:

1. before major refactors
2. before launch or release prep
3. after long documentation or audit-heavy sprints
4. when you suspect the repo has stale or orphaned files

## Operating Rule

The layout index is not a vanity report. Every real gap hint should become one of:

- archive the file
- explicitly keep the file and link it from a canonical surface
- create a task to reconcile or remove it

## Relationship To Other Tools

- Roo bridge finds the likely owning surface.
- Graphify explains architecture and communities.
- code-review-graph gives precise blast radius.
- Repo Layout Index proves whether files are still connected at all.