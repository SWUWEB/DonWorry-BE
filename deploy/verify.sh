#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$#" -ne 1 ]]; then
  echo "Usage: $0 <production-url>" >&2
  exit 1
fi

readonly deploy_dir="${HOME}/donworry/deploy"
readonly production_url="${1%/}"

compose() {
  docker compose \
    --env-file "${deploy_dir}/.env" \
    --env-file "${deploy_dir}/.release.env" \
    --file "${deploy_dir}/compose.production.yml" \
    "$@"
}

question_count="$(compose exec --no-TTY mysql sh -c \
  'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -Nse \
  "SELECT COUNT(*) FROM intervention_questions WHERE is_active = 1;" \
  "$MYSQL_DATABASE"')"

echo "Active intervention questions: ${question_count}"
if [[ "${question_count}" != "3" ]]; then
  echo "Expected 3 active intervention questions." >&2
  exit 1
fi

"${deploy_dir}/backup-db.sh"
latest_backup="$(find "${HOME}/donworry/backups" -maxdepth 1 -type f \
  -name 'donworry-*.sql.gz' -printf '%f\n' | sort | tail -n 1)"
echo "Latest backup: ${latest_backup}"

health_url="${production_url}/health"
for attempt in {1..12}; do
  status="$(curl --silent --show-error --output /dev/null \
    --write-out '%{http_code}' --connect-timeout 5 --max-time 15 \
    "${health_url}")" || status="000"

  if [[ "${status}" == "200" ]]; then
    echo "HTTPS health check: HTTP 200"
    exit 0
  fi

  echo "HTTPS health check attempt ${attempt}/12: HTTP ${status}"
  sleep 5
done

echo "HTTPS health check failed." >&2
exit 1
