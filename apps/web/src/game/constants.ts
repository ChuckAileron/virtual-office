export const TILE = 32;
export const SPRITE_SCALE = 2;
export const BUBBLE_MS = 5000;
export const ACTIVITY_THROTTLE_MS = 2000;
export const CHAT_LINES = 8;
/** Si una tecla de dirección se suelta antes de este tiempo, solo gira (no avanza). */
export const TAP_HOLD_MS = 140;
/**
 * Una dirección pulsada mientras ya hay otra mantenida tarda esto en tomar el
 * relevo: por debajo solo cuenta como toque y no interrumpe la marcha, así que no
 * se ve el doble giro al combinar teclas.
 */
export const TAKEOVER_HOLD_MS = 1000;
