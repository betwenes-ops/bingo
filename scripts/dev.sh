#!/usr/bin/env sh
set -eu
node scripts/setup.mjs
docker compose up --build "$@"
