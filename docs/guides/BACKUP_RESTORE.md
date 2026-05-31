# Backup & Restore — EduTutor.AI

Production-grade backup/restore procedure for Docker volumes that hold all
persistent data. Tested on macOS + Linux Docker engines.

---

## What gets backed up

| Volume | Contents | Critical? |
|---|---|---|
| `postgres_data` | User accounts, conversation history, KB metadata, podcast jobs | **YES** |
| `redis_data` | Session tokens, transient cache, rate-limit counters | nie striktne (regeneratable, ale session loss = users re-login) |
| `chroma_data` | Vector embeddings for Knowledge Base documents | **YES** (re-embedding 1000-doc KB takes ~10 min on CPU) |
| `hf_cache` | HuggingFace model downloads (Whisper, Piper, audio2lipsync) | NO (re-downloadable, ~3 GB) |

**NOT in volume backups** (handle separately):
- `.env` — secrets, copy to safe place manually
- Source code — git history is the canonical backup
- UE5 Blueprint packaged builds — regenerated from `Edutor*/` (gitignored)

---

## Quick start

```bash
# 1. Backup
./scripts/backup.sh

# Output structure:
# backups/20260515-173000/
# ├── manifest.json
# ├── postgres_data.tar.gz
# ├── redis_data.tar.gz
# ├── chroma_data.tar.gz
# └── hf_cache.tar.gz   (skip via SKIP_HF_CACHE=1)

# 2. Restore (on fresh machine or after disaster)
./scripts/restore.sh backups/20260515-173000
```

---

## Backup details

### Skipping hf_cache (recommended for routine backups)

`hf_cache` is 3-8 GB of re-downloadable model weights. Skip it for daily backups:

```bash
SKIP_HF_CACHE=1 ./scripts/backup.sh
```

Expected size without hf_cache: ~50-200 MB depending on KB document count.

### Custom backup location

```bash
BACKUP_DIR=/mnt/external-drive/edututor-backups ./scripts/backup.sh
```

### Verifying a backup

`manifest.json` contains SHA-256 of every archive. To verify integrity without
restoring:

```bash
cd backups/20260515-173000
jq -r '.volumes[] | "\(.sha256)  \(.file)"' manifest.json | shasum -a 256 -c
```

---

## Restore details

### Pre-restore checks

`restore.sh` performs these automatically:

1. Verify `manifest.json` exists
2. Verify ALL archive SHA-256 checksums match manifest
3. Confirm Docker daemon is reachable

If any check fails, restore aborts BEFORE touching any volumes.

### Atomic restore

`restore.sh` performs:

```
docker compose down                  # stop all services
docker volume rm <vol>               # remove existing volume (data loss!)
docker volume create <vol>           # fresh empty volume
docker run alpine tar xzf <archive>  # extract backup INTO new volume
```

### Auto-restart after restore

```bash
AUTO_RESTART=1 ./scripts/restore.sh backups/20260515-173000
```

Without `AUTO_RESTART=1`, run `docker compose up -d` manually after restore.

---

## Tested recovery targets

| Metric | Target | Measured |
|---|---|---|
| RTO (Recovery Time Objective) | < 5 min for small KB | ~2 min |
| RPO (Recovery Point Objective) | Last completed backup | Depends on schedule |
| Archive size | < 500 MB without hf_cache | Typical 50-200 MB |
| Verify time | < 30 s | ~5 s for 200 MB |

---

## Automation (cron / systemd)

### macOS / Linux cron — daily 3 AM backup, 14-day retention

```cron
0 3 * * * cd /path/to/edututor && SKIP_HF_CACHE=1 ./scripts/backup.sh >> /var/log/edututor-backup.log 2>&1
0 4 * * * find /path/to/edututor/backups -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
```

### Systemd timer — daily 3 AM

```ini
# /etc/systemd/system/edututor-backup.service
[Unit]
Description=EduTutor.AI volume backup
After=docker.service

[Service]
Type=oneshot
User=edututor
Environment=SKIP_HF_CACHE=1
WorkingDirectory=/opt/edututor
ExecStart=/opt/edututor/scripts/backup.sh

# /etc/systemd/system/edututor-backup.timer
[Unit]
Description=Run EduTutor backup daily

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable with `systemctl enable --now edututor-backup.timer`.

---

## Off-site backup (recommended)

After local backup, ship to off-site storage:

```bash
# rsync to remote server
rsync -av --delete backups/ user@backup-host:/srv/edututor-backups/

# AWS S3
aws s3 sync backups/ s3://edututor-backups/$(hostname)/ --storage-class STANDARD_IA

# rclone (Backblaze B2, Wasabi, etc.)
rclone sync backups/ b2:edututor-backups/$(hostname)/
```

---

## Disaster recovery walkthrough

**Scenario:** Production host disk failure, fresh Ubuntu install, last backup is
3 days old in S3.

```bash
# 1. Install Docker on fresh host
curl -fsSL https://get.docker.com | sh

# 2. Clone repo
git clone https://github.com/sorrywecann/edututor-ai.git
cd edututor-ai

# 3. Restore .env from password manager / secrets vault
cp ~/safe/edututor.env .env

# 4. Pull latest backup from S3
mkdir -p backups
aws s3 sync s3://edututor-backups/$(hostname)/ backups/

# 5. Find most recent backup
LATEST=$(ls -1dt backups/*/ | head -1)
echo "Restoring from $LATEST"

# 6. Restore + auto-restart
AUTO_RESTART=1 ./scripts/restore.sh "$LATEST"

# 7. Verify
curl -fsS http://localhost:8000/api/v1/health
./scripts/verify_release.sh
```

RTO target for this flow: **< 30 minutes** on a fresh host with Docker pre-installed.

---

## Limitations & caveats

- **Postgres consistency:** `tar` of a running postgres volume can include
  partially-written WAL. For mission-critical setups, run `docker compose stop`
  before backup, or use `pg_dump` for logical backup (not covered by this script).
- **Redis persistence:** Uses AOF (`--appendonly yes` in compose) so volume
  backup captures committed writes only.
- **Concurrent backup runs:** Don't run two `backup.sh` simultaneously — race
  on Docker volume locks. Cron + timer should serialize.
- **Cross-host restore:** Backup archives are portable across amd64 / arm64
  hosts. PostgreSQL data dir is endian-portable since PG 10.

---

**See also:**
- [`scripts/backup.sh`](../scripts/backup.sh) — backup script
- [`scripts/restore.sh`](../scripts/restore.sh) — restore script
- [`docs/output3/implementation-guide.md`](./output3/implementation-guide.md) — production deployment guide
