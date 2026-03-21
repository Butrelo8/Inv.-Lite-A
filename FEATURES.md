# Inventario Lite – Features

This document lists all features of the application. It is updated whenever new functionality is added.

---

## Original Features (base app)

### Inventory management
- **CRUD operations** – Create, read, update, delete items
- **Item fields** – Code, name, serial number, size, units, condition, purchase date, responsible person, useful life, category
- **Status badges** – Visual indicators for item condition (New, Excellent, Good, Fair, Poor, Damaged)
- **Multiple images per item** – Support for several attachments per inventory entry

### Search & filters
- **Smart search** – Search by name, code, category, or supplier (suggestion dropdown)
- **Filters** – Category, responsible person
- **Date presets** – This year, last year, last 6 months
- **Clear filters** – Reset all filters at once

### Import & export
- **CSV export** – Download all inventory as CSV
- **Excel export** – Download as XLSX
- **PDF export** – Download as PDF
- **CSV import** – Bulk add items from CSV (English/Spanish headers)
- **Template download** – Sample CSV with correct column headers

### Add/Edit form
- **Category suggestion** – Keyword-based suggestions from item name and code (Sparkles button)
- **Predefined categories** – Cameras, Electronics, Diving Equipment, Scientific Monitoring, Office Equipment, etc.
- **Form validation** – Zod-based validation with inline error messages

### Images & photos
- **Gallery upload** – Choose one or many files (JPG, PNG, GIF, WebP)
- **Camera capture** – Take photo directly when using HTTPS
- **Multiple images per item** – Add and remove images on add/edit
- **Image viewer** – Preview images, navigate between them
- **Bulk image import script** – Match images from a folder to items by filename (includes HEIC → JPG conversion)

### Dashboard & overview
- **Overview page** – Charts by category, responsible person, and condition
- **History** – Full audit trail of create, update, delete, import actions (product, user, quantity, etc.)
- **Inventory table** – Sortable list with in-line edit/delete actions

### UI & layout
- **Light/dark mode** – Theme toggle (system, light, dark)
- **Responsive layout** – Mobile and desktop support
- **App layout** – Sidebar navigation (Overview, Inventory, History)
- **404 page** – Custom not-found page

### Technical stack

- **Runtime** – Node.js
- **Backend** – Express (Node.js web framework)
- **Frontend** – React 18, Vite, TypeScript
- **Database** – PostgreSQL with Drizzle ORM, `pg` driver
- **State** – TanStack Query (React Query) for server state
- **Forms** – React Hook Form, Zod validation
- **UI components** – Radix UI primitives, Tailwind CSS, Lucide icons
- **Auth** – Passport.js (local strategy), bcryptjs, express-session
- **Routing** – Wouter (client-side routing)
- **Charts** – Recharts
- **File handling** – Multer (uploads), PapaParse (CSV), ExcelJS (XLSX), PDFKit (PDF)

---

## Features Added (project updates)

### Code auto-assignment *(added)*
- **Server-side algorithm** – PREFIX + number pattern (e.g. MD00001, CB00001)
- **Category + name mapping** – Derives prefix from item type (MD, CB, CF, CP, etc.)
- **Non-cascading reuse** – Same-type items share the same code
- **Suggest-code API** – `GET /api/inventory/suggest-code?category=&name=`
- **Live code updates** – Code field updates when name or category changes
- **Auto-assign on create** – Empty code on create triggers auto-assignment
- **CSV import support** – Rows with name but no code get auto-assigned code
- **Configurable prefix rules** – `server/code-generator.ts`

### Complete History *(added)*
- **Audit table** – `inventory_history` with: id, product_id, company_id, transaction_type, quantity, user_id, created_at, remarks
- **Companies table** – Optional; link transactions to companies
- **Transaction types** – CREATE, UPDATE, ADJUSTMENT, DELETE, IMPORT
- **History page** – Full table at `/history` with product code, name, company, type, quantity, user, date, remarks
- **Auto-logging** – Every create, update, delete, import records to history with user ID

### Authentication *(added)*
- **Login** – Username/password sign-in page
- **Session** – Cookie-based session (7 days, MemoryStore)
- **Protected routes** – Inventory, History, Overview require login
- **Logout** – Sign out from header
- **Passwords** – Stored as bcrypt hashes, never plain text
- **First user** – Run `npm run create-user -- <username> <password> [role]`
- **Role-based access** – Roles: admin, editor, viewer. Viewers: read + export only (no History access). Editors/admins: create, update, delete, import, history

### Mobile & accessibility *(added)*
- **Select dropdown mobile fix** – Category and Condition dropdowns display correctly inside the Add/Edit dialog on mobile (z-index and stacking context)
- **Keyboard focus visibility** – Clear focus rings for Tab navigation, including dark mode
- **Camera error handling** – User-friendly message when camera is unavailable (e.g. over HTTP instead of HTTPS)

### Companies (Empresa) *(added)*
- **Companies table** – Used on items: optional `company_id` for “who owns/uses the equipment”
- **Empresas page** – CRUD at `/companies` (editor/admin): list, add, edit, delete companies
- **Inventory** – Company filter dropdown, “Empresa” column (sortable, toggleable), included in CSV/XLSX/PDF exports
- **Inventory form** – Optional “Empresa” dropdown (create/edit) with “Sin asignar”
- **History** – Create/update/delete/import records store item’s `companyId` on history entries
- **Import** – CSV columns `company_id`, `empresa`, `company` map to `companyId`

### QR codes & printable labels *(added)*
- **Per-item label** – QR icon on each inventory row opens a dialog with QR + code + name
- **QR payload** – Encodes JSON: `id`, `code`, `name` for scanning and lookup
- **Print** – “Imprimir etiqueta” opens a print-sized label (e.g. 70×25 mm) in a new window for physical inventory
- **Dependency** – `qrcode` package for client-side QR generation

### Pagination *(added)*
- **Inventory list** – Server-side pagination: `limit` (default 50, max 500), `offset`; API returns `{ items, total }`
- **History list** – Same idea: `limit` (default 100), `offset`; API returns `{ entries, total }`
- **Dashboard** – Pagination bar under table: “X–Y de Z”, Anterior / Siguiente, “Pág. N de M”; page resets when filters change
- **History page** – Same pagination controls; default 100 entries per page
- **Overview** – Requests up to 5000 items for charts/summary; total count from API

### Notes / observations *(added)*
- **Item field** – Optional `notes` (text) on `inventory_items` for internal comments, maintenance, etc.
- **Form** – “Observaciones / Notas” textarea in add/edit (full width)
- **Exports** – Notes included in CSV, XLSX, and PDF exports
- **Import** – CSV columns `notes`, `observaciones`, `observacion`, `comentarios`, `comment` map to `notes`

### Session / inactivity *(added)*
- **Auto-logout** – Session expires after 5 hours of inactivity (rolling: each request updates `lastActivity`)
- **Cookie** – `maxAge` set to 5 hours to align with inactivity window
- **API response** – When expired: 401 with `{ message: "Sesión expirada" }` for API routes
- **Client** – Global fetch handling: on 401 “Sesión expirada”, clear auth and redirect to `/login?expired=1`
- **Login page** – Shows “Sesión expirada. Inicia sesión de nuevo.” when `?expired=1`

### Users list (admin only) *(added)*
- **Users page** – At `/users`, visible only to admins (nav tab “Usuarios” with UserCog icon)
- **List** – Username, role (Administrador / Editor / Visor), date created; current user marked “(tú)”
- **Change role** – Dropdown per row to set admin / editor / viewer; PATCH `/api/users/:id/role`
- **Create users** – Still via `npm run create-user`; this page is for listing and changing roles only

---

## Update history (patch notes)

A detailed record of changes made to the application over time.

---

### v1.3 – Companies, QR labels, pagination, notes, session timeout, users list *(current)*

**Companies (Empresa)**

- Companies table used on items; optional company filter and “Empresa” column in inventory; CRUD at `/companies` (Empresas) for editor/admin; company in form, exports, and history; CSV import supports `company_id` / `empresa`.

**QR codes & printable labels**

- Per-item QR/label dialog (QR + code + name); “Imprimir etiqueta” for a print-sized label; `qrcode` package; helps with physical inventory checks.

**Pagination**

- Inventory: server-side pagination (default 50 per page, `{ items, total }`); Dashboard pagination bar (Anterior/Siguiente, “X–Y de Z”). History: same pattern (default 100 per page) with pagination bar. Overview uses a larger limit for charts.

**Notes / observations**

- Optional `notes` on inventory items; “Observaciones / Notas” in add/edit form; included in CSV, XLSX, PDF exports and CSV import.

**Session / inactivity**

- Auto-logout after 5 hours of inactivity (rolling); 401 “Sesión expirada” for API; client redirects to `/login?expired=1` and shows “Sesión expirada. Inicia sesión de nuevo.”

**Users list (admin only)**

- `/users` page (admin only): list users (username, role, created), change role via dropdown; complements `create-user` script.

---

### v1.2 – Spanish localization

**UI translation**

- **App layout** – Nav tabs: Overview → Resumen, Inventory → Inventario, History → Historial. Log out, theme toggle, and accessibility labels translated.
- **Login** – Username/Password labels, validation messages, "Sign in" → "Iniciar sesión".
- **Dashboard** – All buttons, filters, table headers, dialogs, toasts, and empty states in Spanish.
- **Inventory form** – All labels (Código, Nombre, Categoría, Condición, Unidades, etc.), placeholders, and buttons (Tomar foto, Elegir de galería, Guardar artículo, Cancelar).
- **Overview** – Cards, chart titles, descriptions, and "No data to display" → "Sin datos para mostrar".
- **History** – Page title, table headers, transaction labels (Creado, Actualizado, Eliminado, Importado, etc.), empty state.
- **404 page** – "Page Not Found" → "Página no encontrada", "Return to Home" → "Volver al inicio".
- **Status badge** – Condition labels: New → Nuevo, Excellent → Excelente, Good → Bueno, Fair → Regular, Poor → Pobre, Damaged → Dañado, Unknown → Desconocido.
- **Search bar** – Placeholder, suggestion types (Categoría, Código, Nombre, Responsable), "Searching…" → "Buscando…", "No matches" → "Sin coincidencias".
- **Camera dialog** – Title "Take a photo" → "Tomar una foto", "Capture photo" → "Capturar foto", error messages translated.
- **Document language** – `index.html` `lang` set to `"es"` for better accessibility.

**Category & condition display (DB → UI)**

- **Translation layer** – New `client/src/lib/category-translate.ts` with `categoryToDisplay()` and `conditionToDisplay()`.
- **Database unchanged** – Categories and conditions remain in English in PostgreSQL; translation applied only in the UI.
- **Form dropdowns** – Show Spanish labels while storing English values.
- **Charts** – Overview charts show Spanish category and condition names.
- **Custom categories** – Untranslated names pass through unchanged.

**Technical stack documentation**

- **Stack section** – Expanded with Runtime, Forms, UI components, Auth, Routing, Charts, and file handling.

---

### v1.1 – Code auto-assignment & UX improvements

**Code auto-assignment**

- **Server-side algorithm** – PREFIX + number pattern (e.g. MD00001, CB00001).
- **Category + name mapping** – Prefix derived from item type (MD, CB, CF, CP, etc.) in `server/code-generator.ts`.
- **Non-cascading reuse** – Same-type items can share the same code.
- **Suggest-code API** – `GET /api/inventory/suggest-code?category=&name=`.
- **Live code updates** – Code field updates as name or category changes in the form.
- **Auto-assign on create** – Empty code on create triggers auto-assignment.
- **CSV import** – Rows with name but no code receive auto-assigned codes.

**Mobile & accessibility**

- **Select dropdown fix** – Category and Condition dropdowns display correctly on mobile inside the Add/Edit dialog (z-index and stacking context).
- **Keyboard focus** – Clear focus rings for Tab navigation, including dark mode.
- **Camera error handling** – User-friendly message when camera is unavailable (e.g. over HTTP instead of HTTPS).

---

### v1.0 – Complete history & authentication

**Audit history**

- **Audit table** – `inventory_history` with product_id, company_id, transaction_type, quantity, user_id, created_at, remarks.
- **History page** – `/history` with full table (product code, name, company, type, quantity, user, date, remarks).
- **Auto-logging** – Create, update, delete, and import actions logged with user ID.
- **Transaction types** – CREATE, UPDATE, ADJUSTMENT, DELETE, IMPORT.

**Authentication**

- **Login** – Username/password sign-in page.
- **Session** – Cookie-based session (7 days, MemoryStore).
- **Protected routes** – Inventory, History, Overview require login.
- **Logout** – Sign out from header.
- **Passwords** – Stored as bcrypt hashes; run `npm run create-user -- <username> <password>` for first user.

---

### v0.9 – Base inventory app

**Core features**

- CRUD operations, item fields (code, name, serial number, size, units, condition, purchase date, responsible, useful life, category).
- Smart search, filters (category, responsible), date presets.
- CSV/XLSX/PDF export, CSV import, template download.
- Category suggestion (keyword-based), predefined categories.
- Gallery upload, camera capture, multiple images per item, image viewer.
- Overview with charts, inventory table, light/dark mode, responsive layout, 404 page.

---

*Last updated: v1.3 – Companies, QR labels, pagination, notes, session timeout, users list. Update this file whenever adding new features.*
