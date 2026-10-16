import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
const app = process.argv[2];
if (!['web', 'admin'].includes(app)) throw Error('Expected web or admin');
const root = new URL(`../apps/${app}/`, import.meta.url);
const require = createRequire(new URL('package.json', root));
const port = process.env.PORT ?? (app === 'web' ? '3000' : '3001');
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw Error('Invalid PORT');
const child = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'start', '--hostname', '0.0.0.0', '--port', port],
  { cwd: fileURLToPath(root), env: process.env, stdio: 'inherit' },
);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('error', () => {
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
