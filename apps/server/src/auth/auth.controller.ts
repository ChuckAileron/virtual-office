import { Body, Controller, Headers, HttpCode, HttpException, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() body: { username?: unknown; password?: unknown; appearance?: unknown } | undefined) {
    return this.auth.register(body?.username, body?.password, body?.appearance);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: { username?: unknown; password?: unknown } | undefined, @Req() req: Request) {
    return this.auth.login(body?.username, body?.password, req.ip ?? 'unknown');
  }

  @Post('password')
  @HttpCode(200)
  async changePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { currentPassword?: unknown; newPassword?: unknown } | undefined,
  ) {
    const token = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1];
    const user = await this.auth.userFromToken(token);
    if (!user) throw new HttpException('Inicia sesión para cambiar tu contraseña', HttpStatus.UNAUTHORIZED);
    await this.auth.changePassword(user, body?.currentPassword, body?.newPassword);
    return { ok: true };
  }
}
