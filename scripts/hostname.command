#!/bin/sh
# Atajo para macOS: ejecuta scripts/hostname.sh (te pedira la IP del servidor).
#
#   - Doble clic en Finder, o
#   - en Terminal: chmod +x scripts/hostname.command && ./scripts/hostname.command --ip 192.168.1.7
#
# Requiere permiso de ejecucion: chmod +x scripts/hostname.command
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec sh "$HERE/hostname.sh" "$@"
