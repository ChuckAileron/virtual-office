#!/bin/sh
# Configurador reconocible para Linux; la implementacion compartida instala hosts y CA.
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec sh "$HERE/hostname-unix.sh" "$@"
