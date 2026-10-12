import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
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
}
