# Backup layout and restore

## What `npm run backup` produces

Each run creates a directory under `BACKUP_DIR` (default: `backups/` at the **repository root**, not the shell’s current directory) named:

`inventario_<UTC-timestamp>/`

Typical contents:

| Path | Contents |
|------|----------|
| `database.dump` | PostgreSQL **custom format** (`pg_dump -F c`). **Not** a SQL text file. |
| `uploads/` | Copy of the app’s `uploads` folder from the machine where the script ran (images, documents, thumbnails as applicable). |

If compression succeeds, the whole folder is archived and the directory is removed, leaving e.g.:

- `inventario_<timestamp>.7z`, or  
- `inventario_<timestamp>.tar.gz`

**Inside that archive** you should still see the same structure: `inventario_<timestamp>/database.dump` and `inventario_<timestamp>/uploads/`.

Extract the archive before restoring.

---

## Restore the database

Use **`pg_restore`**, not `psql -f`, and not “execute SQL script” in DBeaver.

### 1. Extract (if compressed)

Unpack `.7z` or `.tar.gz` so you have a path to `database.dump`.

### 2. Target database

Use an **empty** database (or one you are allowed to overwrite). Example names assume database `inventario`.

### 3. CLI examples

**Local PostgreSQL** (adjust user/host/port):

```bash
pg_restore -h localhost -p 5432 -U inventario -d inventario --no-owner --no-acl database.dump
```

If objects already exist and you want a clean replace (destructive on that DB):

```bash
pg_restore -h localhost -p 5432 -U inventario -d inventario --clean --if-exists --no-owner --no-acl database.dump
```

**Docker** (replace `CONTAINER` with `docker ps` name, e.g. `inventariolitea-postgres-1`):

```bash
docker exec -i CONTAINER pg_restore -U inventario -d inventario --no-owner --no-acl < database.dump
```

Or copy `database.dump` into the container and run `pg_restore` there.

### 4. DBeaver

Use **Tools → Restore** (or your version’s backup restore wizard), choose format **Custom** / **tar** as appropriate, and select `database.dump`. Do not open the dump as a SQL editor.

### 5. Sanity check

```bash
pg_restore --list database.dump
```

If this fails, the file is corrupt, truncated, or not a custom-format dump.

---

## Restore files (`uploads/`)

1. Stop the app (or ensure it is not writing uploads).
2. Copy the backed-up `uploads/` folder over the app’s `uploads/` directory **for the environment you run** (host path vs Docker volume).

If the app runs in Docker with a named volume, copy into the volume (e.g. `docker cp` into a temporary container mounting that volume) rather than only into the repo folder on the host.

---

## Why DBeaver “backup” seemed to work but the script did not

- DBeaver often exports **plain SQL** or runs a wizard that uses the correct restore tool.
- This project’s `database.dump` is **binary custom format** and **requires `pg_restore`** (or DBeaver’s restore tool pointed at that file).

---

## Troubleshooting (Windows + Docker)

- **`POSTGRES_CONTAINER`** must be the **exact** name from `docker ps` (e.g. `inventariolitea-postgres-1`), not a generic name like `docker-postgres-1`.
- The backup script dumps to a **file inside the container** and uses **`docker cp`**, because on Docker Desktop for Windows, `pg_dump -f -` piped through `docker exec` can produce an **empty file** even when the database is fine.

## See also

- `script/backup.ts` — backup implementation and env vars (`POSTGRES_CONTAINER`, `DATABASE_URL`, `BACKUP_DIR`, etc.)
- `.env.example` — backup-related variables
