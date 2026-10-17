#!/bin/sh
# Configurador reconocible para macOS (tambien se puede ejecutar desde Terminal).
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec sh "$HERE/hostname-unix.sh" "$@"
