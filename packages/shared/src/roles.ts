import type { Role } from './types';

/** Roles válidos, en orden de mayor a menor privilegio. */
export const ROLES: readonly Role[] = ['admin', 'boss', 'member'];

/** Etiqueta en español de cada rol, para la interfaz. */
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  boss: 'Jefe',
  member: 'Miembro',
};

export function isRole(value: unknown): value is Role {
  return value === 'admin' || value === 'boss' || value === 'member';
}

/** Normaliza un valor desconocido a un rol; si no es válido, devuelve 'member'. */
export function asRole(value: unknown): Role {
  return isRole(value) ? value : 'member';
}

/** Solo el jefe y el administrador pueden convocar a todo el equipo a la sala de reuniones. */
export function canConvene(role: Role): boolean {
  return role === 'admin' || role === 'boss';
}
