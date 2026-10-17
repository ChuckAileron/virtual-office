FROM ladamalina/janus-gateway:v1.4.1

# Railway publica el puerto HTTP de este servicio y permite WebSocket Upgrade
# sobre el mismo dominio. 8088 queda disponible solo para llamadas internas;
# 8188 es el transporte WebSocket que consume el navegador.
EXPOSE 8088 8188

ENTRYPOINT ["/bin/sh", "-c"]
CMD ["set -eu; : \"${JANUS_AUTH_SECRET:?Define JANUS_AUTH_SECRET en Railway}\"; : \"${JANUS_ADMIN_KEY:?Define JANUS_ADMIN_KEY en Railway}\"; printf 'general: {\\n\\tadmin_key = \\\"%s\\\"\\n}\\n' \"$JANUS_ADMIN_KEY\" > /var/janus/janus/etc/janus/janus.plugin.videoroom.jcfg; exec /var/janus/janus/bin/janus -r 20000-20100 -A --token-auth-secret=\"$JANUS_AUTH_SECRET\""]
