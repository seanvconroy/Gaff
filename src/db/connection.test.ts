import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { poolConfig } from './connection';

/** What node-postgres will actually use, after it has read the connection string. */
const effective = (config: pg.PoolConfig) =>
  (new pg.Client(config) as unknown as { connectionParameters: { ssl: unknown; host: string } })
    .connectionParameters;

const supabase =
  'postgresql://gaff.abcdefghijklmnop:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

describe('ADR-0014: connecting to the database', () => {
  it('connects to a local database without TLS', () => {
    const config = poolConfig('postgres://gaff:gaff@localhost:5432/gaff_dev');
    expect(effective(config).ssl).toBe(false);
  });

  it('always encrypts the connection to Supabase, even if the URL says nothing', () => {
    expect(effective(poolConfig(supabase)).ssl).toEqual({ rejectUnauthorized: false });
    expect(effective(poolConfig(`${supabase}?sslmode=require`)).ssl).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("checks Supabase's certificate when its CA certificate is given", () => {
    const ca = '-----BEGIN CERTIFICATE-----\\nMIIB\\n-----END CERTIFICATE-----';
    expect(effective(poolConfig(`${supabase}?sslmode=require`, ca)).ssl).toEqual({
      ca: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
      rejectUnauthorized: true,
    });
  });

  it('keeps the rest of the address as it was', () => {
    const config = poolConfig(`${supabase}?sslmode=require&application_name=gaff`);
    expect(config.connectionString).toBe(`${supabase}?application_name=gaff`);
    expect(effective(config).host).toBe('aws-1-eu-west-1.pooler.supabase.com');
  });
});
