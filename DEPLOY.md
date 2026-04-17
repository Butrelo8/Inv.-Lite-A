# Deploy: Inventario Lite A (Local / LAN)

This repo is intended for main local use (your network / LAN). It is still useful to document a repeatable deploy checklist.

---

## 1) Local start (single machine)

1. Install dependencies:
   - `npm install`
2. Configure environment:
   - Copy `.env.example` to `.env`
   - Set `DATABASE_URL`
   - Set `SESSION_SECRET` (must be a long random string)
3. Push schema to PostgreSQL:
   - `npm run db:push`
4. Create your first user:
   - `npm run create-user -- <username> <password> [role]`
5. Start the server:
   - `npm run dev`
6. Open the app:
   - `http://localhost:5000`

---

## 2) Access from other devices on the LAN

The server listens on `host: "0.0.0.0"` (port controlled by `PORT`, default `5000`), so it should be reachable from the same network.

1. Start the server (`npm run dev` or `npm run start`)
2. On each device, open:
   - `http://<YOUR_LAN_IP>:5000`
3. If blocked, allow inbound traffic for port `5000` in Windows Firewall for the private network profile.

---

## 3) Docker (optional)

If you use Docker Compose, start the stack and then run `npm run db:push` with `DATABASE_URL` pointing at the same database.

After changing application code:
- `docker compose up -d --build app`

Responsiva DOCX template in Docker:
- Set `RESPONSIVA_TEMPLATE_PATH=/app/src/templates/responsiva_template.docx` in `app.environment`.
- Mount template directory read-only in `app.volumes`:
  - `./client/src/templates:/app/src/templates:ro`
- Verify file exists in container:
  - `docker compose exec app ls -la /app/src/templates`

---

## 4) Post-deploy verification checklist

- Login works
- Inventory CRUD works for `editor/admin`
- Viewer can view inventory + export endpoints
- Employee documents are accessible only for `editor/admin`
- Private upload URLs return `401/403` when not authenticated

### Privacy check runbook (LAN)
1. Pick one authenticated inventory image and one employee document, then record the upload URLs (image URL `/uploads/<filename>`, document URL `/uploads/documents/<filename>`, thumbnail URL derived from the image URL by replacing `/uploads/` with `/uploads/thumbs/` and the extension with `.webp`).
2. Logged out (no auth cookies): open the 3 URLs in browser tabs and expect `401` (or `403`) for all of them.
3. Logged in as `viewer`: expect the image URL `200`, the thumbnail URL `200`, and the employee document URL `403`.
4. Logged in as `editor/admin`: expect the image URL `200`, the thumbnail URL `200`, and the employee document URL `200`.

