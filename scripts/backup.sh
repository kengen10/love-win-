#!/usr/bin/env bash
# SQLite backup wrapper. See DEPLOY.md for cron and retention instructions.
set -euo pipefail
APP="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP"
umask 077
node scripts/backup.js
# Retention is manual so custom BACKUP_DIR locations are never deleted by mistake.
