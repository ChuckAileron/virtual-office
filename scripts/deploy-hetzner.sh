#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

exec docker compose -f docker-compose.yml -f docker-compose.hetzner.yml up -d --build
