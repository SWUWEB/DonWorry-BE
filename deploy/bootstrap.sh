#!/usr/bin/env bash
set -Eeuo pipefail

readonly runtime_user="${SUDO_USER:-${USER}}"
runtime_home="$(getent passwd "${runtime_user}" | cut -d: -f6)"
readonly runtime_home

if ! command -v docker >/dev/null 2>&1; then
  curl --fail --silent --show-error --location https://get.docker.com | sudo sh
fi

sudo usermod --append --groups docker "${runtime_user}"
sudo install -d -o "${runtime_user}" -g "${runtime_user}" \
  "${runtime_home}/donworry"
sudo install -d -o "${runtime_user}" -g "${runtime_user}" \
  "${runtime_home}/donworry/deploy" "${runtime_home}/donworry/backups"

cron_entry="15 3 * * * ${runtime_home}/donworry/deploy/backup-db.sh >> ${runtime_home}/donworry/backups/backup.log 2>&1"
(
  sudo -u "${runtime_user}" crontab -l 2>/dev/null \
    | grep -v 'donworry/deploy/backup-db.sh' || true
  echo "${cron_entry}"
) | sudo -u "${runtime_user}" crontab -

echo "Bootstrap completed. Sign out and back in before running Docker without sudo."
