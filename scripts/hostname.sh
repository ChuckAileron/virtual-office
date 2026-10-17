#!/bin/sh
# Registra el nombre local de la oficina virtual (oficina.lan por defecto) en el
# archivo /etc/hosts de este equipo, apuntando a la IP de LAN del servidor. Asi
# puedes abrir https://oficina.lan/ en lugar de https://<IP>/.
#
# Pensado para LOS EQUIPOS CLIENTE (Linux y macOS). El equipo servidor ya lo
# tiene registrado. Recuerda instalar la CA de Caddy (descargala de
# https://oficina.lan/ca.crt) para que el navegador no muestre el aviso.
#
# Uso:
#   sudo ./scripts/hostname.sh --ip 192.168.1.7
#   sudo ./scripts/hostname.sh --ip 192.168.1.7 --name oficina.lan
#   sudo ./scripts/hostname.sh --remove
#
# Si no indicas --ip, se lee LAN_IP de .env (cuando el script esta dentro del
# repositorio) o se te pide por consola. Se reejecuta con sudo si hace falta.
set -eu

NAME='oficina.lan'
IP=''
REMOVE=0

usage() {
  cat <<'EOF'
Uso: hostname.sh [opciones] [IP]

  -i, --ip <IP>      IP de LAN del servidor (obligatoria salvo con --remove).
  -n, --name <host>  Nombre a registrar (por defecto: oficina.lan).
  -r, --remove       Elimina la entrada del archivo hosts.
  -h, --help         Muestra esta ayuda.
EOF
}

# Reejecuta con sudo antes de leer argumentos, para no perderlos.
if [ "$(id -u)" -ne 0 ]; then
  echo 'Se necesitan permisos de administrador; usando sudo...' >&2
  if [ -x "$0" ]; then
    exec sudo -p 'Contrasena de administrador: ' "$0" "$@"
  else
    exec sudo -p 'Contrasena de administrador: ' sh "$0" "$@"
  fi
fi

while [ $# -gt 0 ]; do
  case "$1" in
    -i|--ip) IP=${2:-}; shift 2 ;;
    --ip=*) IP=${1#*=}; shift ;;
    -n|--name) NAME=${2:-}; shift 2 ;;
    --name=*) NAME=${1#*=}; shift ;;
    -r|--remove) REMOVE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "Opcion no reconocida: $1" >&2; usage; exit 1 ;;
    *) if [ -z "$IP" ]; then IP=$1; shift; else echo "Argumento de sobra: $1" >&2; usage; exit 1; fi ;;
  esac
done

# Lee LAN_IP de .env si el script vive dentro del repositorio.
if [ -z "$IP" ] && [ "$REMOVE" -eq 0 ]; then
  HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  if [ -f "$HERE/../.env" ]; then
    IP=$(grep -E '^LAN_IP=' "$HERE/../.env" | head -n1 | cut -d= -f2- | tr -d ' \r')
  fi
fi

# Pide la IP si sigue faltando.
if [ -z "$IP" ] && [ "$REMOVE" -eq 0 ]; then
  printf 'IP de LAN del servidor (por ejemplo 192.168.1.7): ' >&2
  read -r IP || true
fi

if [ "$REMOVE" -eq 0 ]; then
  case "$IP" in
    ''|*[!0-9.]*) echo "IP invalida: '$IP'. Ejemplo: 192.168.1.7" >&2; exit 1 ;;
  esac
  OLDIFS=$IFS; IFS='.'
  set -- $IP
  IFS=$OLDIFS
  if [ $# -ne 4 ]; then echo "IP invalida: '$IP'. Ejemplo: 192.168.1.7" >&2; exit 1; fi
  for octet in "$@"; do
    if [ -z "$octet" ] || [ "$octet" -gt 255 ] 2>/dev/null; then
      echo "IP invalida: '$IP'. Ejemplo: 192.168.1.7" >&2; exit 1
    fi
  done
  set --
fi

HOSTS=${HOSTS:-/etc/hosts}
if [ ! -w "$HOSTS" ]; then
  echo "No se puede escribir en $HOSTS" >&2
  exit 1
fi

cp -p "$HOSTS" "$HOSTS.bak" 2>/dev/null || true

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
# Quita cualquier linea previa que apunte a ese nombre (sin duplicados ni IP vieja).
grep -v -E "^[[:space:]]*[^[:space:]#]+[[:space:]]+$NAME[[:space:]]*$" "$HOSTS" > "$TMP" || true

if [ "$REMOVE" -eq 1 ]; then
  cat "$TMP" > "$HOSTS"
  echo "Eliminada la entrada '$NAME' de $HOSTS"
else
  printf '%s\t%s\n' "$IP" "$NAME" >> "$TMP"
  cat "$TMP" > "$HOSTS"
  echo "Anadida: $IP    $NAME    ($HOSTS)"
fi

# Limpia la cache de DNS (mejor esfuerzo segun el sistema).
case "$(uname -s)" in
  Darwin)
    dscacheutil -flushcache 2>/dev/null || true
    killall -HUP mDNSResponder 2>/dev/null || true
    ;;
  *)
    if command -v resolvectl >/dev/null 2>&1; then resolvectl flush-caches 2>/dev/null || true
    elif command -v systemd-resolve >/dev/null 2>&1; then systemd-resolve --flush-caches 2>/dev/null || true
    elif command -v nscd >/dev/null 2>&1; then nscd -i hosts 2>/dev/null || true
    fi
    ;;
esac

echo ''
echo "Listo: abre https://$NAME/ (instala la CA de Caddy desde https://$NAME/ca.crt si el navegador avisa)."
