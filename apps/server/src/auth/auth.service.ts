import { HttpException, HttpStatus, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { Appearance, DEFAULT_APPEARANCE, Role, SessionResponse, sanitizeAppearance, validateCredentials, validatePassword } from '@vo/shared';
import { APP_CONFIG, AppConfig } from '../config';
import { Repository, UserRow } from '../db/repository';
import { createLimiter, hashPassword, verifyPassword } from './password';

const TOKEN_TTL = '7d';
const FAIL_MAX = 8;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
/** Credenciales de la cuenta de administrador creada en el primer arranque (debe cambiarse). */
export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD = 'admin';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly limiter = createLimiter(FAIL_MAX, FAIL_WINDOW_MS);
  // iguala el tiempo de respuesta si el usuario no existe
  private readonly dummyHash: Promise<string> = hashPassword('dummy-password');

  constructor(
    @Inject(Repository) private readonly repo: Repository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Crea la cuenta de administrador por defecto si todavía no existe. */
  async onModuleInit(): Promise<void> {
    const existing = await this.repo.getUserByName(DEFAULT_ADMIN_USERNAME);
    if (existing) {
      if (existing.role !== 'admin') await this.repo.updateRole(existing.id, 'admin');
      return;
    }
    await this.repo.createUser(
      DEFAULT_ADMIN_USERNAME,
      await hashPassword(DEFAULT_ADMIN_PASSWORD),
      DEFAULT_APPEARANCE,
      'admin',
    );
  }

  async register(username: unknown, password: unknown, appearance: unknown): Promise<SessionResponse> {
    const error = validateCredentials(username, password);
    if (error) throw new HttpException(error, HttpStatus.BAD_REQUEST);
    const look = sanitizeAppearance(appearance);
    if (!look) throw new HttpException('Personaje inválido', HttpStatus.BAD_REQUEST);
    const user = await this.repo.createUser(username as string, await hashPassword(password as string), look);
    if (!user) throw new HttpException('Ese nombre de usuario ya existe', HttpStatus.CONFLICT);
    return this.session(user.id, user.username, user.appearance, user.role);
  }

  async login(username: unknown, password: unknown, ip: string): Promise<SessionResponse> {
    if (typeof username !== 'string' || typeof password !== 'string') {
      throw new HttpException('Ingresa usuario y contraseña', HttpStatus.BAD_REQUEST);
    }
    const key = `${ip}|${username.toLowerCase()}`;
    if (this.limiter.blocked(key)) {
      throw new HttpException('Demasiados intentos fallidos. Intenta más tarde', HttpStatus.TOO_MANY_REQUESTS);
    }
    const user = await this.repo.getUserByName(username);
    const ok = await verifyPassword(password, user ? user.password : await this.dummyHash);
    if (!user || !ok) {
      this.limiter.fail(key);
      throw new HttpException('Usuario o contraseña incorrectos', HttpStatus.UNAUTHORIZED);
    }
    this.limiter.reset(key);
    return this.session(user.id, user.username, user.appearance, user.role);
  }

  /** Cambia la contraseña del usuario autenticado tras verificar la actual. */
  async changePassword(user: UserRow, current: unknown, next: unknown): Promise<void> {
    if (typeof current !== 'string' || !(await verifyPassword(current, user.password))) {
      throw new HttpException('La contraseña actual no es correcta', HttpStatus.UNAUTHORIZED);
    }
    const error = validatePassword(next);
    if (error) throw new HttpException(error, HttpStatus.BAD_REQUEST);
    await this.repo.updatePassword(user.id, await hashPassword(next as string));
  }

  /** Cuentas con su rol, para el panel de administración. */
  listUsers(): Promise<Array<{ username: string; role: Role }>> {
    return this.repo.listUsers();
  }

  /** Asigna el rol de jefe (o lo retira) a una cuenta. */
  async assignRole(username: string, role: Role): Promise<{ id: number; username: string; role: Role }> {
    const target = await this.repo.getUserByName(username);
    if (!target) throw new HttpException('No existe ese usuario', HttpStatus.NOT_FOUND);
    if (target.role === 'admin') throw new HttpException('No puedes cambiar el rol de un administrador', HttpStatus.FORBIDDEN);
    await this.repo.updateRole(target.id, role);
    return { id: target.id, username: target.username, role };
  }

  /** Devuelve el usuario dueño del token o null si es inválido/expiró o el usuario ya no existe. */
  async userFromToken(token: unknown): Promise<UserRow | null> {
    if (typeof token !== 'string' || !token) return null;
    try {
      const payload = jwt.verify(token, this.config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      const id = Number(payload.sub);
      return Number.isInteger(id) ? await this.repo.getUserById(id) : null;
    } catch {
      return null;
    }
  }

  private session(id: number, username: string, appearance: Appearance, role: Role): SessionResponse {
    const token = jwt.sign({ username }, this.config.jwtSecret, { algorithm: 'HS256', subject: String(id), expiresIn: TOKEN_TTL });
    return { token, user: { username, appearance, role } };
  }
}
