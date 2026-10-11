import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const executable = process.argv[2];
if (!executable) throw new Error('Usage: node tests/desktop-smoke.mjs <executable>');
const directory = mkdtempSync(join(tmpdir(), 'jsonl-smoke-'));
const fixture = join(directory, 'smoke.jsonl');
writeFileSync(fixture, '{"message":"desktop launch smoke"}\n');
const child = spawn(resolve(executable), [fixture], { stdio: 'inherit' });
let failure;
let exited = false;
const closed = new Promise((done) => {
  child.once('error', (error) => {
    failure = error;
  });
  child.once('close', (code, signal) => {
    exited = true;
    failure ??= new Error(`Desktop exited: ${code ?? signal}`);
    done();
  });
});
try {
  await Promise.race([closed, setTimeout(10000)]);
  if (exited || failure) throw failure;
  console.log('Desktop process survived startup with a JSONL file argument.');
} finally {
  child.kill('SIGTERM');
  await Promise.race([closed, setTimeout(3000)]);
  if (!exited) {
    child.kill('SIGKILL');
    await closed;
  }
  rmSync(directory, { recursive: true, force: true });
}
