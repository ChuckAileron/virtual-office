import type { UserInfo } from '@vo/shared';
import { asRole } from '@vo/shared';

export interface StoredSession {
  token: string;
  user: UserInfo;
}
export interface SavedRoom {
  code: string;
  name: string;
}

const SESSION_KEY = 'vo.session';
const ROOMS_KEY = 'vo.rooms';
export const MAX_SAVED_ROOMS = 20;

export function loadSession(): StoredSession | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Partial<StoredSession> | null;
    if (!raw || typeof raw.token !== 'string' || !raw.user || typeof raw.user.username !== 'string') return null;
    // Las sesiones guardadas antes de existir los roles no traen `role`.
    return { token: raw.token, user: { ...raw.user, role: asRole(raw.user.role) } };
  } catch {
    return null;
  }
}

export function saveSession(s: StoredSession | null): void {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

export function loadRooms(): SavedRoom[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(ROOMS_KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter((r): r is SavedRoom => !!r && typeof r.code === 'string' && typeof r.name === 'string')
      : [];
  } catch {
    return [];
  }
}

export function upsertRoom(rooms: SavedRoom[], room: SavedRoom): SavedRoom[] {
  const next = [room, ...rooms.filter((r) => r.code !== room.code)].slice(0, MAX_SAVED_ROOMS);
  localStorage.setItem(ROOMS_KEY, JSON.stringify(next));
  return next;
}

export function removeRoom(rooms: SavedRoom[], code: string): SavedRoom[] {
  const next = rooms.filter((r) => r.code !== code);
  localStorage.setItem(ROOMS_KEY, JSON.stringify(next));
  return next;
}
