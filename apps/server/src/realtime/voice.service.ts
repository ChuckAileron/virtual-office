import { Inject, Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { VoiceTokenResult } from '@vo/shared';
import { APP_CONFIG, AppConfig } from '../config';
import { JanusService, VIDEO_ROOM_PLUGIN } from './janus.service';

@Injectable()
export class VoiceService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(JanusService) private readonly janus: JanusService,
  ) {}

  get enabled(): boolean {
    return true;
  }

  async createToken(roomCode: string, identity: string, _name: string): Promise<VoiceTokenResult> {
    // Janus VideoRoom usa un entero de 64 bits como id de sala. SHA-256 evita
    // colisiones triviales entre códigos de espacios distintos.
    const roomSecret = this.config.janus.roomSecret;
    const digest = createHmac('sha256', roomSecret).update(roomCode).digest();
    const room = digest.readUInt32BE(0) + 100_000;
    const derive = (label: string) => createHmac('sha256', roomSecret).update(`${label}:${roomCode}`).digest('hex');
    const pin = derive('pin').slice(0, 24);
    if (!this.janus.enabled) return { ok: true, room, pin, url: this.config.janus.publicUrl, identity };
    // El servidor es el único que puede crear la sala (admin_key) y el único que
    // conoce el secreto de la sala; el cliente solo recibe PIN y token firmado.
    await this.janus.ensureRoom(room, pin, derive('secret').slice(0, 24));
    return {
      ok: true,
      room,
      pin,
      url: this.config.janus.publicUrl,
      identity,
      token: this.janus.mintToken([VIDEO_ROOM_PLUGIN]),
    };
  }
}
