#!/bin/sh
# Implementacion compartida por hostname-linux.sh y hostname-macos.command.
set -eu

NAME='oficina.lan'
IP=''
REMOVE=0

usage() {
  cat <<'EOF'
Uso: hostname-unix.sh --ip <IP-servidor> [opciones]

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

if [ "$REMOVE" -eq 0 ]; then
  CA_TMP=$(mktemp)
  trap 'rm -f "$TMP" "$CA_TMP"' EXIT
  # La omision de validacion TLS solo se usa para descargar inicialmente la CA.
  curl -kfsS "https://$NAME/ca.crt" -o "$CA_TMP"
  case "$(uname -s)" in
    Darwin)
      security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CA_TMP"
      ;;
    Linux)
      if command -v update-ca-certificates >/dev/null 2>&1; then
        mkdir -p /usr/local/share/ca-certificates
        install -m 0644 "$CA_TMP" /usr/local/share/ca-certificates/oficina-virtual.crt
        update-ca-certificates
      elif command -v update-ca-trust >/dev/null 2>&1; then
        mkdir -p /etc/pki/ca-trust/source/anchors
        install -m 0644 "$CA_TMP" /etc/pki/ca-trust/source/anchors/oficina-virtual.crt
        update-ca-trust extract
      else
        echo 'No se encontro herramienta de certificados (update-ca-certificates/update-ca-trust).' >&2
        exit 1
      fi
      ;;
  esac
  echo 'CA de Caddy descargada e instalada como raiz de confianza.'
  echo "Listo: abre https://$NAME/"
fi
