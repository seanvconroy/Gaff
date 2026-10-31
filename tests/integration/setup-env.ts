// Integration tests run against the gaff_test database with local stand-ins for every provider.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://gaff:gaff@localhost:5432/gaff_test';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.AUTH_SECRET ??= 'test-secret-that-is-at-least-32-characters-long';
process.env.EMAIL_PROVIDER = 'dev';
process.env.SMS_PROVIDER = 'fake';
process.env.AI_PROVIDER = 'fake';
