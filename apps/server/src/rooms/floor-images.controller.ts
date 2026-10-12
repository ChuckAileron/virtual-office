import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BadRequestException, Controller, Headers, Inject, Post, UnauthorizedException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { APP_CONFIG, AppConfig } from '../config';
import { AuthService } from '../auth/auth.service';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_SIDE = 4096;
const MAX_IMAGE_PIXELS = 16_000_000;

interface UploadedImage {
  mimetype: string;
  buffer: Buffer;
}

function dimensions(buffer: Buffer, mime: string): { width: number; height: number; extension: 'png' | 'jpg' } | null {
  if (mime === 'image/png') {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), extension: 'png' };
  }
  if (mime !== 'image/jpeg' || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset++; continue; }
    while (buffer[offset] === 0xff) offset++;
    const marker = buffer[offset++];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) return null;
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5), extension: 'jpg' };
    }
    offset += length;
  }
  return null;
}

@Controller('floor-images')
export class FloorImagesController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  async upload(
    @Headers('authorization') authorization: string | undefined,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<{ imageUrl: string }> {
    const token = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1];
    if (!(await this.auth.userFromToken(token))) throw new UnauthorizedException('Inicia sesión para subir una imagen');
    if (!file?.buffer) throw new BadRequestException('Selecciona una imagen PNG o JPEG');

    const image = dimensions(file.buffer, file.mimetype);
    if (!image || image.width < 1 || image.height < 1
      || image.width > MAX_IMAGE_SIDE || image.height > MAX_IMAGE_SIDE
      || image.width * image.height > MAX_IMAGE_PIXELS) {
      throw new BadRequestException('Imagen inválida o demasiado grande (máximo 4096×4096 píxeles)');
    }

    const filename = `${randomUUID()}.${image.extension}`;
    await fs.mkdir(this.config.uploadsDir, { recursive: true });
    await fs.writeFile(path.join(this.config.uploadsDir, filename), file.buffer, { flag: 'wx' });
    return { imageUrl: `/api/floor-images/${filename}` };
  }
}
