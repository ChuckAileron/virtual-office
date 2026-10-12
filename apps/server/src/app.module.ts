import { DynamicModule, Global, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { APP_CONFIG, AppConfig } from './config';
import { DatabaseModule } from './db/database.module';
import { GameGateway } from './realtime/game.gateway';
import { VoiceService } from './realtime/voice.service';
import { RoomsModule } from './rooms/rooms.module';

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return { module: ConfigModule, providers: [{ provide: APP_CONFIG, useValue: config }], exports: [APP_CONFIG] };
  }
}

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(config), DatabaseModule, AuthModule, RoomsModule],
      controllers: [AppController],
      providers: [GameGateway, VoiceService],
    };
  }
}
