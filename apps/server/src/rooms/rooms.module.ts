import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomsController } from './rooms.controller';
import { FloorImagesController } from './floor-images.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [AuthModule],
  controllers: [RoomsController, FloorImagesController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
