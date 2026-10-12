import type { Appearance, ClientConfig, FloorSize, PublicRoom, SessionResponse } from '@vo/shared';

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string;
}

function errorMessage(data: unknown): string {
  const m = (data as { message?: unknown } | null)?.message;
  if (typeof m === 'string' && m) return m;
  if (Array.isArray(m) && m.length) return m.filter((x) => typeof x === 'string').join('. ');
  return 'Error inesperado';
}

async function request<T>(url: string, { method = 'GET', body, token }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiRequestError('No se pudo conectar con el servidor', 0);
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(errorMessage(data), res.status);
  return data as T;
}

export interface FloorOptions {
  offices: number | string;
  conference: boolean;
  boss: boolean;
}

export const register = (username: string, password: string, appearance: Appearance) =>
  request<SessionResponse>('/api/register', { method: 'POST', body: { username, password, appearance } });

export const login = (username: string, password: string) =>
  request<SessionResponse>('/api/login', { method: 'POST', body: { username, password } });

export const getLayoutSize = (o: FloorOptions) =>
  request<FloorSize>(`/api/layout?${new URLSearchParams({ offices: String(o.offices), conference: String(o.conference), boss: String(o.boss) })}`);

export const getRoom = (code: string) => request<PublicRoom>(`/api/rooms/${encodeURIComponent(code)}`);

export const createRoom = (name: string, o: FloorOptions, token: string) =>
  request<PublicRoom>('/api/rooms', { method: 'POST', body: { name, offices: Number(o.offices), conference: o.conference, boss: o.boss }, token });

export const getConfig = () => request<ClientConfig>('/api/config');
