# CHANGELOG

All notable changes to this project will be documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- **Inventory page analytics (toggleable):** collapsible KPIs and charts on `/inventory` (`InventoryAnalytics`, shared `inventory-aggregates`), preference stored in `localStorage` (`inventory-analytics-open`).
- **Assignment / handover workflow:** `inventory_assignments` table (`migrations/add-inventory-assignments.sql`), APIs `POST /api/inventory/:id/assign`, `POST /api/inventory/:id/return`, `GET /api/inventory/:id/assignments`; history types `ASSIGN`, `RETURN`, `TRANSFER`; inventory list includes `activeAssignmentItemIds`; Dashboard assign/return actions and “Asignado” badge; assignment timeline in item view; client hooks `use-assignments.ts`.
- **Backup / restore runbook:** `docs/BACKUP-RESTORE.md` (archive layout, `pg_restore` vs SQL, uploads).
- **Operations Health Dashboard:** `ops_events` table (see `migrations/add-ops-events.sql`), KPI/event taxonomy (`shared/ops-health.ts`), server instrumentation for auth, API 4xx/5xx and slow requests, import/history/thumbnail and backup script outcomes, APIs `GET /api/ops-health/summary` and `GET /api/ops-health/events` (editor/admin), and client page `/ops-health`.
- Private uploads serving (auth-gated endpoints) for inventory images and employee documents.
- Role-based access for employee documents (`editor/admin`).
- Auth-gated thumbnail serving with on-demand generation.
- Shared notes section with role-based access (`viewer` read-only, `editor/admin` manage).

### Changed
- **Dashboard / Resumen UI:** shared `KpiCard` (corner accent blob, theme colors), EcoOcéano-style refresh on Overview and toggleable inventory analytics (`rounded-2xl` cards, donut pies with legend, softer borders and spacing); analytics panel wrapper on `/inventory` updated to match.
- `npm run backup` defaults `BACKUP_DIR` to `<repository>/backups` and reads `uploads/` from the repo root (not the shell cwd); optional `BACKUP_DIR` is resolved relative to the repo when not absolute.
- **Backup (Docker on Windows):** `pg_dump` no longer streams to stdout (empty output on Docker Desktop); dumps to a temp file in the container and `docker cp`s it out. `PGPASSWORD` is passed without embedding in `-e`. Ops events insert skips missing `ops_events` table (`42P01`).
- Uploads handling no longer uses a public `/uploads` static directory.
- Attachment deletion is now scoped to the parent item resource.
- Shared notes are now managed per inventory item from the create/edit article dialogs (viewer read-only; editor/admin can manage).
- Major: Viewers can now open a read-only item view from the inventory overview to see the item description/notes (within role limitations).

### Fixed
- Prevent cross-item attachment deletion by ensuring `attachmentId` belongs to `:id`.
- Removed silent swallowing of history/audit side-effect failures in the paths we touched (now logs with context).

---

## [1.3] - 2026-03-18

### Changed
- Privacy hardening: uploads are private and served only after authentication.
- Attachment integrity fix.

