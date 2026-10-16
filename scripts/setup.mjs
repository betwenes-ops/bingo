import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!existsSync('.env')) {
  writeFileSync(
    '.env',
    readFileSync('.env.example', 'utf8').replace(
      'GENERATE_WITH_NODE_CRYPTO_32_BYTES_HEX',
      randomBytes(32).toString('hex'),
    ),
    { mode: 0o600 },
  );
  console.log('Local environment generated. Do not use local defaults for a public deployment.');
} else {
  console.log('Existing .env preserved.');
}
