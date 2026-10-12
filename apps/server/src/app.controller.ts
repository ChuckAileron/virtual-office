import { Controller, Get, Inject } from '@nestjs/common';
import type { ClientConfig } from '@vo/shared';
import { APP_CONFIG, AppConfig } from './config';

@Controller()
export class AppController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Get('config')
  clientConfig(): ClientConfig {
    return { livekitUrl: this.config.livekit.publicUrl };
  }
}
