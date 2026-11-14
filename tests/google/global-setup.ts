import { spawn } from 'node:child_process';
import { e2eEnv } from '../../playwright.config';
import e2eSetup from '../e2e/global-setup';

/**
 * M136: the journeys' fresh database and worker, then the test copy's made-up homes, each with
 * its own point (M125), so Google's map has pins to show.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const teardown = await e2eSetup();
  try {
    await seed();
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}

function seed(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['db:seed'], {
      env: { ...process.env, ...e2eEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', reject);
    child.on('exit', (code) => {
      // The seed reports counts only. Every home must be live for the map to have its pins.
      const report = output.match(/Seed: (\{.*\})/)?.[1];
      const homes = report
        ? (JSON.parse(report) as { homes: { listed: number; existing: number } }).homes
        : null;
      if (code === 0 && homes && homes.listed + homes.existing > 0) resolve();
      else
        reject(new Error(`The seed didn't list its homes (exit ${code}): ${output.slice(-600)}`));
    });
  });
}
