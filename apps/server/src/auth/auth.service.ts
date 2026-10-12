import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { Appearance, SessionResponse, sanitizeAppearance, validateCredentials } from '@vo/shared';
import { APP_CONFIG, AppConfig } from '../config';
import { Repository, UserRow } from '../db/repository';
import { createLimiter, hashPassword, verifyPassword } from './password';

const TOKEN_TTL = '7d';
const FAIL_MAX = 8;
const FAIL_WINDOW_MS = 10 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly limiter = createLimiter(FAIL_MAX, FAIL_WINDOW_MS);
  // iguala el tiempo de respuesta si el usuario no existe
  private readonly dummyHash: Promise<string> = hashPassword('dummy-password');

  constructor(
    @Inject(Repository) private readonly repo: Repository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async register(username: unknown, password: unknown, appearance: unknown): Promise<SessionResponse> {
    const error = validateCredentials(username, password);
    if (error) throw new HttpException(error, HttpStatus.BAD_REQUEST);
    const look = sanitizeAppearance(appearance);
    if (!look) throw new HttpException('Personaje inválido', HttpStatus.BAD_REQUEST);
    const user = await this.repo.createUser(username as string, await hashPassword(password as string), look);
    if (!user) throw new HttpException('Ese nombre de usuario ya existe', HttpStatus.CONFLICT);
    return this.session(user.id, user.username, user.appearance);
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
    return this.session(user.id, user.username, user.appearance);
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

  private session(id: number, username: string, appearance: Appearance): SessionResponse {
    const token = jwt.sign({ username }, this.config.jwtSecret, { algorithm: 'HS256', subject: String(id), expiresIn: TOKEN_TTL });
    return { token, user: { username, appearance } };
  }
}
