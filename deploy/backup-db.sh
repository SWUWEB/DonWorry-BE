#!/usr/bin/env bash
set -Eeuo pipefail

readonly deploy_dir="${HOME}/donworry/deploy"
readonly backup_dir="${HOME}/donworry/backups"
readonly release_file="${deploy_dir}/.release.env"

mkdir -p "${backup_dir}"

timestamp="$(date +%Y%m%d-%H%M%S)"
readonly timestamp
readonly final_file="${backup_dir}/donworry-${timestamp}.sql.gz"
temporary_file="$(mktemp "${backup_dir}/.donworry-${timestamp}.XXXXXX.sql.gz")"
readonly temporary_file
trap 'rm -f "${temporary_file}"' EXIT

docker compose \
  --env-file "${deploy_dir}/.env" \
  --env-file "${release_file}" \
  --file "${deploy_dir}/compose.production.yml" \
  exec --no-TTY mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction "$MYSQL_DATABASE"' \
  | gzip > "${temporary_file}"

mv "${temporary_file}" "${final_file}"
trap - EXIT

find "${backup_dir}" -type f -name 'donworry-*.sql.gz' -mtime +7 -delete
