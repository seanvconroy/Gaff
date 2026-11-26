import { spawn } from 'node:child_process';
import { e2eEnv } from '../../playwright.config';
import e2eSetup from '../e2e/global-setup';

/**
 * The deck's run starts as an end-to-end run does (a fresh database, the place index, the
 * register, the real worker), then seeds the test copy's made-up homes (`pnpm db:seed`), so the
 * search a renter meets has other homes in it.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const teardown = await e2eSetup();
  const seed = spawn('pnpm', ['db:seed'], {
    env: { ...process.env, ...e2eEnv },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  await new Promise<void>((resolve, reject) => {
    seed.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`The seed failed (${code})`)),
    );
  });
  return teardown;
}
