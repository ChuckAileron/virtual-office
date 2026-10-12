import { Inject, Injectable } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';
import type { VoiceTokenResult } from '@vo/shared';
import { APP_CONFIG, AppConfig } from '../config';

@Injectable()
export class VoiceService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get enabled(): boolean {
    return !!(this.config.livekit.apiKey && this.config.livekit.apiSecret);
  }

  async createToken(roomCode: string, identity: string, name: string): Promise<VoiceTokenResult> {
    if (!this.enabled) return { ok: false, error: 'Voz no configurada' };
    const at = new AccessToken(this.config.livekit.apiKey, this.config.livekit.apiSecret, {
      identity,
      name,
      ttl: '6h',
    });
    at.addGrant({ roomJoin: true, room: `floor-${roomCode}`, canPublish: true, canSubscribe: true });
    return { ok: true, token: await at.toJwt(), url: this.config.livekit.publicUrl };
  }
}
