#!/usr/bin/env bash
set -Eeuo pipefail

readonly deploy_dir="${HOME}/donworry/deploy"
readonly backup_dir="${HOME}/donworry/backups"
readonly release_file="${deploy_dir}/.release.env"

mkdir -p "${backup_dir}"

docker compose \
  --env-file "${deploy_dir}/.env" \
  --env-file "${release_file}" \
  --file "${deploy_dir}/compose.production.yml" \
  exec --no-TTY mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction "$MYSQL_DATABASE"' \
  | gzip > "${backup_dir}/donworry-$(date +%Y%m%d-%H%M%S).sql.gz"

find "${backup_dir}" -type f -name 'donworry-*.sql.gz' -mtime +7 -delete
