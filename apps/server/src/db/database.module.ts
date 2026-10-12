import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_CONFIG, AppConfig } from '../config';
import { DB, Queryable, Repository } from './repository';

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Queryable => {
        if (config.databaseUrl === 'memory') {
          // Solo desarrollo: base en memoria (se pierde al reiniciar)
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { newDb } = require('pg-mem');
          return new (newDb().adapters.createPg().Pool)();
        }
        return new Pool({ connectionString: config.databaseUrl, max: 10 });
      },
    },
    {
      provide: Repository,
      inject: [DB],
      useFactory: async (db: Queryable) => {
        const repo = new Repository(db);
        await repo.migrate();
        return repo;
      },
    },
  ],
  exports: [DB, Repository],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Queryable) {}

  async onApplicationShutdown() {
    await (this.db as Partial<Pool>).end?.();
  }
}
