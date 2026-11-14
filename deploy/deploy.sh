#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$#" -ne 2 ]]; then
  echo "Usage: $0 <image> <production-url>" >&2
  exit 1
fi

readonly next_image="$1"
readonly production_url="${2%/}"
readonly deploy_dir="${HOME}/donworry/deploy"
readonly compose_file="${deploy_dir}/compose.production.yml"
readonly release_file="${deploy_dir}/.release.env"
readonly app_domain="${production_url#*://}"

if [[ ! -f "${deploy_dir}/.env" ]]; then
  echo "Missing production environment file: ${deploy_dir}/.env" >&2
  exit 1
fi

if [[ "${app_domain}" == */* ]]; then
  echo "PRODUCTION_URL must not include a path." >&2
  exit 1
fi

previous_image=""
if [[ -f "${release_file}" ]]; then
  previous_image="$(sed -n 's/^APP_IMAGE=//p' "${release_file}")"
fi

write_release_file() {
  local image="$1"
  printf 'APP_IMAGE=%s\nAPP_DOMAIN=%s\n' "${image}" "${app_domain}" > "${release_file}"
}

compose() {
  docker compose \
    --env-file "${deploy_dir}/.env" \
    --env-file "${release_file}" \
    --file "${compose_file}" \
    "$@"
}

rollback() {
  if [[ -z "${previous_image}" ]]; then
    echo "No previous image is available for rollback." >&2
    return
  fi

  echo "Deployment failed. Restoring ${previous_image}." >&2
  write_release_file "${previous_image}"
  compose up --detach --no-deps app
  compose up --detach --no-deps caddy
}

trap rollback ERR

write_release_file "${next_image}"
docker pull "${next_image}"
compose up --detach mysql
compose run --rm app npm run prisma:migrate:deploy
compose run --rm app npm run seed
compose up --detach --no-deps app

for attempt in {1..12}; do
  if compose exec --no-TTY app node -e \
    "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    compose up --detach --no-deps caddy
    trap - ERR
    docker image prune --force >/dev/null 2>&1 || true
    echo "Deployment completed successfully."
    exit 0
  fi

  echo "Application health check attempt ${attempt}/12 failed."
  sleep 5
done

echo "Application health check failed." >&2
exit 1
