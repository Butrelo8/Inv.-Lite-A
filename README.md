# Inventario Lite A

Local inventory management for small trusted teams for only using on a local environment with trusted people.

## What it does
- Inventory CRUD with search, filters, and pagination
- CSV import/export and XLSX/PDF exports
- Multiple images per inventory item
- Audit history (create/update/delete/import + user attribution)
- Authentication (cookie-based session) with roles:
  - `viewer`: read + export
  - `editor`: create/update/delete/import + manage attachments/
  - `admin`: full access + user/role management
- Employee documents (PDF/Word/etc.) with role-based access

## Privacy / security posture (LAN-first)
Uploads are treated as sensitive by default:
- Upload URLs are **not** publicly served as static files.
- Auth-gated routes serve:
  - inventory images (any authenticated user)
  - employee documents (`editor/admin`)
  - thumbnails (generated on-demand, auth required)

## Quick start (local)
1. `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL` + `SESSION_SECRET`
3. `npm run db:push`
4. Create first user:
   - `npm run create-user -- <username> <password> [role]`
5. Run:
   - `npm run dev`
6. Open: `http://localhost:5000`

## Notes
- The more detailed local setup steps are also in `Readme.txt`.

