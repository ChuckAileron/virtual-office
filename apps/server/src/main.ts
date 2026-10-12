import 'reflect-metadata';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { AppConfig, loadConfig } from './config';

export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.setGlobalPrefix('api');
  app.useBodyParser('json', { limit: '10kb' });
  if (config.trustProxy) app.set('trust proxy', true);
  app.disable('x-powered-by');

  const index = path.join(config.webDist, 'index.html');
  if (fs.existsSync(index)) {
    app.useStaticAssets(config.webDist);
    // Fallback SPA para rutas que no son API ni socket.io
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(index);
    });
  }
}

export async function createApp(config: AppConfig): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), { logger: ['error', 'warn', 'log'] });
  configureApp(app, config);
  return app;
}

async function bootstrap() {
  const config = loadConfig();
  const app = await createApp(config);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  console.log(`Oficina virtual escuchando en el puerto ${config.port}`);
  for (const ip of lanAddresses()) console.log(`  En tu red local: http://${ip}:${config.port}`);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
