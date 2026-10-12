import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_CONFIG, AppConfig } from '../config';
import { closeMemory, openMemory, restoreMemory } from './memory-store';
import { DB, Queryable, Repository } from './repository';

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Queryable => {
        // Modo desarrollo sin Postgres: base en memoria persistida en un archivo.
        if (config.databaseUrl === 'memory') return openMemory(config.memoryFile);
        return new Pool({ connectionString: config.databaseUrl, max: 10 });
      },
    },
    {
      provide: Repository,
      inject: [DB],
      useFactory: async (db: Queryable) => {
        const repo = new Repository(db);
        await repo.migrate();
        restoreMemory();
        return repo;
      },
    },
  ],
  exports: [DB, Repository],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Queryable) {}

  async onApplicationShutdown() {
    closeMemory();
    await (this.db as Partial<Pool>).end?.();
  }
}
