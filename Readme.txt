================================================================================
                    INVENTARIO LITE - LOCAL SETUP GUIDE
================================================================================

This app was originally from Replit. It's a Node.js full-stack application
(React + Express + PostgreSQL).

FEATURES:
- Inventory management (CRUD)
- Image/photo attachments (upload and display)
- CSV export (download all inventory)
- CSV import (bulk add items from CSV file)
- Category suggestion when creating or editing items
- Overview dashboard with charts and activity log
- Authentication (login required to access the app)

--------------------------------------------------------------------------------
AVAILABLE COMMANDS (npm run)
--------------------------------------------------------------------------------

  npm run dev
      Start the server in development mode (tsx, hot reload).

  npm run build
      Build the app for production (output to dist/).

  npm run start
      Start the production server (requires prior npm run build).

  npm run check
      Run TypeScript compiler to check for type errors.

  npm run db:push
      Push the database schema (create/update tables). Run after schema changes.

  npm run create-user -- <username> <password> [role]
      Create a new user. role: admin | editor | viewer (default: viewer).
      Example: npm run create-user -- admin MyPassword123 editor

  npm run backup
      Backup PostgreSQL database and uploads folder to backups/.

  npm run backup:verify-restore
      Restore latest backup into temporary DB, run integrity checks, emit pass/fail.

  npm run integrity:scan
      Run read-only integrity scanner and generate scan/repair reports.

  npm run bulk-import-images -- <folder_path> [base_url]
      Bulk import images from a folder, matching by filename.
      Example: npm run bulk-import-images -- "Copia de Inventario" http://localhost:5000

  npm run convert-heic -- <folder_path> [--output <output_folder>]
      Convert HEIC/HEIF images to JPG. Example: npm run convert-heic -- "Copia de Inventario"

  npx tsx server/index.ts
      Alternative way to start the server (without npm run dev).

--------------------------------------------------------------------------------
AUTHENTICATION & USER MANAGEMENT
--------------------------------------------------------------------------------

The app requires login. You must create at least one user before you can access
the inventory.

CREATING THE FIRST USER (MASTER CREDENTIALS):

1. Complete Initial Setup (install deps, create .env, run db:push).

2. Create your first user (run in a terminal):
   
   npm run create-user -- admin YourSecurePassword123 editor
   
   Replace "admin" and "YourSecurePassword123" with your desired username and
   password. The password must be at least 6 characters.
   Optional 4th argument: role (admin | editor | viewer). Default: viewer.

3. Start the server and open http://localhost:5000. You will be redirected to
   the login page.

4. Sign in with the username and password you just created.

5. admin password123

ADDING ADDITIONAL USERS:

To add another user, run the same command with a different username:
   
   npm run create-user -- juan MyPassword456
   npm run create-user -- maria AnotherPassword789
   
   Each username must be unique. The script will report an error if the username
   already exists.

SECURITY NOTES:

- Passwords are stored as bcrypt hashes (never plain text).
- For production, set SESSION_SECRET in .env to a long random string.
- Roles: admin, editor, viewer. Viewers can only read and export; editors/admins can create, update, delete, and import.

--------------------------------------------------------------------------------
ROLES (ALREADY IMPLEMENTED)
--------------------------------------------------------------------------------

The app uses three roles: admin, editor, viewer.

- viewer: Read-only. Can view inventory and export (CSV, XLSX, PDF). Cannot access History.
- editor: Same as viewer, plus create, update, delete items, import CSV, add/remove images.
- admin: Same as editor (user management not yet implemented).

CHANGING A USER'S ROLE:

In PostgreSQL (psql or a DB client):
   UPDATE users SET role = 'editor' WHERE username = 'juan';
   UPDATE users SET role = 'viewer' WHERE username = 'maria';

When creating new users:
   npm run create-user -- juan password123 editor
   npm run create-user -- maria password456 viewer

--------------------------------------------------------------------------------
ADDING IMAGES TO ITEMS
--------------------------------------------------------------------------------

You can add images in two ways:

OPTION 1 – Through the app (one or many per item):

1. Open the app in your browser (http://localhost:5000)
2. Click "Add Item" to create a new item, or click the pencil icon to edit one
3. In the "Images / Photos" section, click the file input
4. Select one or more image files (JPG, PNG, GIF, WebP)
5. Click "Save Item" (for new items) or "Save" (for edits)

You can add more images to an existing item by editing it and selecting
additional files. To remove an image, hover over it and click the trash icon.

OPTION 2 – Bulk import from a folder:

Use the bulk import script when you have many images in a folder and want to
match them to inventory items automatically by filename. See the section
below for full details.

--------------------------------------------------------------------------------
BULK IMAGE IMPORT SCRIPT
--------------------------------------------------------------------------------

Usage:

1. Start the server (in one terminal):
   npx tsx server/index.ts

2. Run the import (in another terminal):
   npm run bulk-import-images -- "Copia de Inventario"

   Or with full path and custom URL:
   npx tsx script/bulk-import-images.ts "e:\Cursor Projects\Inventario Lite A\Copia de Inventario" http://localhost:5000

Matching rules:
A file is matched to an item only if:
- Filename contains the item name (case-insensitive, accents ignored)
- Filename contains the serial number (if the item has one)

For items with multiple photos, it prefers the one without a numeric suffix
(e.g. Impresora Epson.heic over Impresora Epson 1.heic).

Supported formats:
- HEIC/HEIF – converted to JPEG before upload
- JPG, JPEG, PNG, GIF, WebP – uploaded as-is

Output:
The script reports:
- Number of images uploaded and which items they were matched to
- Items skipped (no match or upload error)
- Images that did not match any item

--------------------------------------------------------------------------------
CSV IMPORT FORMAT
--------------------------------------------------------------------------------

- Use the "Template" button to download a sample CSV with correct headers.
- Required columns: code, name (or codigo, nombre in Spanish)
- Optional: serial_number, size, units, condition, purchase_date, responsible, useful_life, category
- Supports both comma (,) and semicolon (;) as delimiter.
- Supports English and Spanish header names.

--------------------------------------------------------------------------------
CATEGORY SUGGESTION
--------------------------------------------------------------------------------

When adding or editing an item, the app suggests a category based on the item
name (and code). How it works:

1. Open the Add Item dialog or edit an existing item.
2. Type the item name in the "Name / Description" field (e.g. "Cámara GoPro
   H11", "Computadora HP", "HOBO data logger").
3. If the name matches known keywords, a suggestion chip appears next to the
   Category dropdown (with a sparkle icon).
4. Click the suggestion chip to apply that category instantly.
5. You can still choose any category manually from the dropdown.

Supported categories include: Cameras, Electronics, Drones, Diving Equipment,
Scientific Monitoring, Office Equipment, Water Sampling, Safety Equipment,
Lighting, Communication, Field Tools, and more. Keywords work in both English
and Spanish (e.g. cámara/camara, impresora, computadora).

To add or edit keyword mappings, edit: client/src/lib/category-suggest.ts

--------------------------------------------------------------------------------
PREREQUISITES
--------------------------------------------------------------------------------
- Node.js (v20 or newer)
- PostgreSQL (local installation or Docker)

--------------------------------------------------------------------------------
INITIAL SETUP (first time only)
--------------------------------------------------------------------------------

1. Install dependencies:
   
   npm install

2. Set up the database:
   
   - Create a PostgreSQL database (e.g. named "inventario")
   - Copy .env.example to .env and add your credentials:
   
   copy .env.example .env
   
   Then edit .env and set:
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/inventario

3. Push the database schema (creates the tables, including users and inventory):
   
   npm run db:push
   
   Note: DATABASE_URL is read from .env automatically.

4. Create your first user (required before you can log in):
   
   npm run create-user -- admin YourSecurePassword123
   
   See the "Authentication & User Management" section above for details.

--------------------------------------------------------------------------------
STARTING THE SERVER
--------------------------------------------------------------------------------

1. Open a terminal in the project folder.

2. Ensure .env exists with DATABASE_URL (see Initial Setup)

3. Run the server:
   
   npx tsx server/index.ts

4. Open your browser and go to:
   
   http://localhost:5000

--------------------------------------------------------------------------------
RUNNING WITH DOCKER (FULL STACK)
--------------------------------------------------------------------------------

You can run the app and PostgreSQL in containers using Docker Compose.

PREREQUISITES: Docker and Docker Compose installed.

1. Build and start:
   
   docker compose up -d --build

2. Apply the database schema (first time only):
   
   From the project folder, with the stack running, set DATABASE_URL to match
   the compose Postgres (user/password/db from docker-compose.yml), then run:
   
   set DATABASE_URL=postgresql://inventario:inventario@localhost:5432/inventario
   npm run db:push

   (On PowerShell use: $env:DATABASE_URL="postgresql://inventario:inventario@localhost:5432/inventario")

3. Create the first user:
   
   set DATABASE_URL=postgresql://inventario:inventario@localhost:5432/inventario
   npm run create-user -- admin YourPassword123 editor

4. Open http://localhost:5000 and sign in.

REQUIRED (Docker):
- Set `SESSION_SECRET=your-random-secret` before `docker compose up`
  (or add a `.env` file with `SESSION_SECRET=...`; docker-compose reads it).
- Stop:  docker compose down
- Persistence: uploads and the database are stored in Docker volumes (pgdata, uploads_data).

DBEAVER (or any PostgreSQL client) – connect to the same DB the app uses:
  With the stack running (docker compose up), from your PC use:
  Host:     localhost   (or 127.0.0.1)
  Port:     5432
  Database: inventario
  Username: inventario
  Password: inventario
  (JDBC URL: jdbc:postgresql://localhost:5432/inventario)

MAKING CHANGES – when to rebuild and restart:
  Any change to app code (server, client, shared) is only in the image after a rebuild.
  You do not need to recreate Postgres or volumes; rebuild and restart only the app:

  After changing code:
    docker compose up -d --build app

  After changing only env vars in docker-compose.yml or .env (no code change):
    docker compose up -d app

  Restart app without rebuilding (no code or env change):
    docker compose restart app

TAILSCALE FUNNEL (expose the app on the internet over HTTPS):
  The app listens on host port 5000. To expose it via Tailscale Funnel you can:

  Option A – Start app and Funnel in one command (recommended):
  Use the script so Funnel starts automatically when the app starts. No need to
  run "tailscale funnel 5000" by hand.
  - Windows (PowerShell; run as Administrator if Funnel fails):
      .\scripts\start-with-funnel.ps1
  - Linux/macOS:
      chmod +x scripts/start-with-funnel.sh
      ./scripts/start-with-funnel.sh
  The script runs  docker compose up -d  then  tailscale funnel --bg 5000.
  Requires Tailscale installed and logged in on the host.

  Option B – Tailscale on the host (manual funnel):
  1. Install and log in to Tailscale on your PC (https://tailscale.com/download).
  2. Start the stack:  docker compose up -d
  3. On Windows (PowerShell as Administrator):  tailscale funnel 5000
     On Linux/macOS:  sudo tailscale funnel 5000
  4. Tailscale will print a URL like  https://your-machine.your-tailnet.ts.net

  Option C – Tailscale in Docker (same host port):
  Run Tailscale in a container with access to the host network so it can proxy to
  localhost:5000. Example (one-off; replace YOUR_AUTHKEY with a key from the
  Tailscale admin console):
    docker run -d --name tailscale-funnel --network host
      -v tailscale-funnel-state:/var/lib/tailscale
      -e TS_AUTHKEY=YOUR_AUTHKEY
      -e TS_STATE_DIR=/var/lib/tailscale
      tailscale/tailscale:latest
  Then run inside the container (Funnel for port 5000):
    docker exec -it tailscale-funnel tailscale funnel --bg 5000
  (On Windows, --network host may not expose host localhost; prefer Option A or B.)

--------------------------------------------------------------------------------
ACCESSING FROM OTHER DEVICES (PHONE, TABLET, ETC.)
--------------------------------------------------------------------------------

The server binds to all network interfaces (0.0.0.0), so you can access the app
from any device on the same Wi‑Fi or local network.

1. Start the server (npx tsx server/index.ts).

2. Find your computer's local IP address:
   
   Windows (PowerShell):  ipconfig  → look for "IPv4 Address" under your Wi‑Fi adapter
   Mac/Linux:            ifconfig  or  ip addr  → look for inet (e.g. 192.168.1.100)

3. On your phone/tablet:
   - Connect to the same Wi‑Fi network as your computer.
   - Open the browser and go to:  http://YOUR_IP:5000
   - Example:  http://192.168.1.100:5000

4. If it doesn't connect:
   - Check Windows Firewall: allow Node.js or port 5000 for private networks.
   - Ensure both devices are on the same network (same router).

--------------------------------------------------------------------------------
STOPPING THE SERVER
--------------------------------------------------------------------------------

1. Click inside the terminal where the server is running.
2. Press Ctrl + C.

The server will stop and you will get your command prompt back.

--------------------------------------------------------------------------------
AUTOMATED BACKUP SYSTEM
--------------------------------------------------------------------------------

The backup script saves the PostgreSQL database and the uploads folder to a
timestamped folder. You can run it manually or schedule it.

RUNNING A BACKUP MANUALLY:

   npm run backup

This creates:  backups/inventario_YYYY-MM-DDTHH-mm-ss.7z  or  .tar.gz  (compressed)
  Contains: database.dump + uploads folder (unless BACKUP_SKIP_UPLOADS=true)
  Uses 7-Zip (.7z) when available for best compression; falls back to tar.gz.

POSTGRESQL IN DOCKER:

If PostgreSQL runs in a Docker container (most setups), add to .env:

   POSTGRES_CONTAINER=postgres

Use your actual container name. To find it:  docker ps  (check the NAMES column).
- docker run --name postgres:  use "postgres"
- docker-compose (see docker/):  usually "inventario-lite-a-postgres-1" or "docker_postgres_1"

CONFIGURATION (.env):

   POSTGRES_CONTAINER=postgres    (required for Docker; use name from docker ps)
   BACKUP_DIR=backups              (default: backups)
   BACKUP_RETENTION_DAYS=7         (auto-delete backups older than N days; 0 = keep all)
   BACKUP_COMPRESS=true             (compress to .7z or .tar.gz; install 7-Zip for best compression)
   BACKUP_SKIP_UPLOADS=true         (database only, ~few MB – biggest space saver)
   PG_DUMP_PATH=pg_dump           (only for local PostgreSQL, not Docker)

RESTORING FROM A BACKUP:

1. Extract (if compressed):
   
   .7z:  Use 7-Zip (right-click → Extract) or:  7z x backup.7z
   .tar.gz:  tar -xzf backup.tar.gz
   
   This creates inventario_YYYY-MM-DDTHH-mm-ss/ with database.dump and uploads/.

2. Restore the database (Docker):
   
   Replace POSTGRES_CONTAINER with your container name (docker ps → NAMES).
   Example for backup inventario_2026-02-26T18-53-40 (run from project root):
   
   docker cp backups\inventario_2026-02-26T18-53-40\database.dump POSTGRES_CONTAINER:/tmp/
   docker exec -it POSTGRES_CONTAINER pg_restore -U inventario -d inventario -c /tmp/database.dump
   
   (Use -U postgres if your DB user is postgres; use -U inventario for Inventario Lite compose.)
   
   Or with local PostgreSQL (run from project root):
   pg_restore -U postgres -d inventario -c backups\inventario_2026-02-26T18-53-40\database.dump

3. Restore uploads (if needed):
   
   Copy the contents of backups\inventario_2026-02-26T18-53-40\uploads into your
   project's uploads folder (or into the app container's /app/uploads if using Docker).

SCHEDULING (AUTOMATED BACKUPS AT 9:00 PM):

Backups are kept for 7 days by default (BACKUP_RETENTION_DAYS in .env).
To run the backup every night at 9:00 PM:

Windows – Task Scheduler:
1. Open Task Scheduler (search "Task Scheduler" in Start menu).
2. Click "Create Basic Task".
3. Name: "Inventario Backup". Click Next.
4. Trigger: Daily. Next.
5. Start: today, Recur every: 1 day. Next.
6. Action: Start a program. Next.
7. Program:  E:\Cursor Projects\Inventario Lite A\script\backup-scheduled.bat
   (Or browse to script/backup-scheduled.bat in your project)
8. Start in (optional): E:\Cursor Projects\Inventario Lite A
9. Finish.

To set the time to 9:00 PM:
- After creating, double-click the task → Triggers tab → Edit.
- Set "Start the task" to "On a schedule" → Daily.
- Set time to 21:00:00 (9:00 PM). OK.

Linux/Mac – cron (9:00 PM daily):
   crontab -e
   Add:  0 21 * * * cd /path/to/inventario && npm run backup

RESTORE VERIFICATION (RECOMMENDED DAILY):

Run after backup to prove recoverability (example: 10:00 PM if backup is 9:00 PM):

Windows – Task Scheduler:
1. Create a second task named "Inventario Restore Verify".
2. Program:  E:\Cursor Projects\Inventario Lite A\script\backup-restore-verify-scheduled.bat
3. Set daily trigger after backup.

Linux/Mac – cron (10:00 PM daily):
   0 22 * * * cd /path/to/inventario && npm run backup:verify-restore

DATA INTEGRITY SCAN (RECOMMENDED DAILY):

Run daily (for example 10:30 PM), after backup and restore verification windows.

Windows – Task Scheduler:
1. Create a task named "Inventario Integrity Scan".
2. Program:  E:\Cursor Projects\Inventario Lite A\script\integrity-scan-scheduled.bat
3. Set daily trigger.

Linux/Mac – cron (10:30 PM daily):
   30 22 * * * cd /path/to/inventario && npm run integrity:scan

Integrity scan output:
- JSON scan artifact: reports/integrity/integrity-scan-<timestamp>.json
- Read-only repair proposal: reports/integrity/repair-report-<timestamp>.md

--------------------------------------------------------------------------------
TROUBLESHOOTING
--------------------------------------------------------------------------------

- Port 5000 in use: Set a different port with $env:PORT = "3000" before starting.

- "DATABASE_URL must be set": Create a .env file (copy from .env.example) and add
  your DATABASE_URL with the correct PostgreSQL credentials.

- No PostgreSQL: You can run it with Docker:
  
  docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=YourPassword123 -e POSTGRES_DB=inventario postgres:16
  
  Then add to .env:
    DATABASE_URL=postgresql://postgres:YourPassword123@localhost:5432/inventario
    POSTGRES_CONTAINER=postgres

================================================================================
