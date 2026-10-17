import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig environment mode', () => {
  it('uses local DATABASE_URL when ENVIRONMENT is LOCAL case-insensitively', () => {
    const config = loadConfig({ ENVIRONMENT: 'lOcAl', DATABASE_URL: 'postgresql://local/db', JWT_SECRET: 'test' });
    expect(config.environment).toBe('local');
    expect(config.databaseUrl).toBe('postgresql://local/db');
  });

  it('builds the cloud URL from database credentials and defaults to SSL', () => {
    const config = loadConfig({
      ENVIRONMENT: 'production',
      DATABASE_HOST: 'db.example.test',
      DATABASE_NAME: 'office',
      DATABASE_USERNAME: 'user@example',
      DATABASE_PASSWORD: 'p@ss:word',
      JWT_SECRET: 'test',
    });
    const url = new URL(config.databaseUrl);
    expect(config.environment).toBe('cloud');
    expect(url.hostname).toBe('db.example.test');
    expect(url.username).toBe('user%40example');
    expect(url.password).toBe('p%40ss%3Aword');
    expect(url.searchParams.get('sslmode')).toBe('require');
  });

  it('requires username and password for cloud environments', () => {
    expect(() => loadConfig({ ENVIRONMENT: 'RAILWAY' })).toThrow('DATABASE_USERNAME y DATABASE_PASSWORD');
  });
});
