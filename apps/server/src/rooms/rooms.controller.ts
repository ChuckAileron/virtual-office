import { Body, Controller, Get, Headers, HttpException, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { computeFloorSize } from '@vo/shared';
import { AuthService } from '../auth/auth.service';
import { RoomsService } from './rooms.service';

const cleanText = (s: unknown, max: number) =>
  String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

@Controller()
export class RoomsController {
  constructor(
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get('layout')
  layout(@Query() query: Record<string, unknown>) {
    return computeFloorSize(query);
  }

  // Consulta por código de invitación; no existe listado público de salas.
  @Get('rooms/:code')
  room(@Param('code') code: string) {
    const room = this.rooms.find(code);
    if (!room) throw new HttpException('Código de invitación inválido', HttpStatus.NOT_FOUND);
    return this.rooms.toPublic(room);
  }

  @Post('rooms')
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { name?: unknown; offices?: unknown; conference?: unknown; boss?: unknown } | undefined,
  ) {
    const token = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1];
    if (!(await this.auth.userFromToken(token))) {
      throw new HttpException('Inicia sesión para crear un espacio de trabajo', HttpStatus.UNAUTHORIZED);
    }
    const name = cleanText(body?.name, 32);
    if (!name) throw new HttpException('El nombre del espacio de trabajo es obligatorio', HttpStatus.BAD_REQUEST);
    const room = await this.rooms.create(name, { offices: body?.offices, conference: body?.conference, boss: body?.boss });
    return this.rooms.toPublic(room);
  }
}
