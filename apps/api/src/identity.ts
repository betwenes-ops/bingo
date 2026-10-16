import type pg from 'pg';
import argon2 from 'argon2';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, encryptSeed, decryptSeed } from '@bingo/domain/rng';
import { AppError, transaction, type Tx } from './db';
import { audit, postLedger, moveBalance } from './wallet';
import type { Config } from './config';
export type Identity = {
  id: string;
  email: string;
  role: string;
  csrf_token: string;
  session_id: string;
  mfa_verified: boolean;
  email_verified: boolean;
};
export async function turnstile(config: Config, token: string | undefined, ip: string) {
  if (config.TURNSTILE_BYPASS === 'true' && config.NODE_ENV !== 'production') return;
  if (!token || !config.TURNSTILE_SECRET) throw new AppError('CAPTCHA_REQUIRED', 403);
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: config.TURNSTILE_SECRET, response: token, remoteip: ip }),
    signal: AbortSignal.timeout(5000),
  });
  const answer = (await result.json()) as { success?: boolean };
  if (!answer.success) throw new AppError('CAPTCHA_INVALID', 403);
}
export async function register(pool: pg.Pool, email: string, password: string, webUrl: string) {
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await transaction(pool, async (tx) => {
    const u = await tx.query<{ id: string }>(
      'INSERT INTO users(email,password_hash) VALUES(lower($1),$2) ON CONFLICT(email) DO NOTHING RETURNING id',
      [email, passwordHash],
    );
    if (!u.rowCount) return;
    const id = u.rows[0]!.id;
    const account = await tx.query<{ id: string }>(
      "INSERT INTO ledger_accounts(owner_id,kind) VALUES($1,'user') RETURNING id",
      [id],
    );
    await tx.query('INSERT INTO wallets(user_id,account_id) VALUES($1,$2)', [
      id,
      account.rows[0]!.id,
    ]);
    await tx.query('INSERT INTO responsible_gaming_limits(user_id) VALUES($1)', [id]);
    await tokenEmail(tx, id, email, 'verify', webUrl);
    await audit(tx, id, 'REGISTERED', id);
  });
  return { message: 'Se o endereço puder ser cadastrado, enviaremos um e-mail de confirmação.' };
}
async function tokenEmail(
  tx: Tx,
  id: string,
  email: string,
  purpose: 'verify' | 'reset',
  webUrl: string,
) {
  const token = randomBytes(32).toString('hex');
  await tx.query(
    "INSERT INTO identity_tokens(user_id,token_hash,purpose,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')",
    [id, hash(token), purpose],
  );
  const link = `${webUrl}/?${purpose}=${token}`;
  await tx.query('INSERT INTO email_outbox(recipient,subject,body) VALUES($1,$2,$3)', [
    email,
    purpose === 'verify' ? 'Confirme seu e-mail — Bingo Demo' : 'Recupere seu acesso — Bingo Demo',
    `Bingo Demonstração.\n\n${link}\n\nO link expira em 30 minutos. Créditos fictícios sem valor monetário.`,
  ]);
}
export async function verifyEmail(pool: pg.Pool, token: string) {
  return transaction(pool, async (tx) => {
    const result = await tx.query<{ user_id: string }>(
      "DELETE FROM identity_tokens WHERE token_hash=$1 AND purpose='verify' AND expires_at>now() RETURNING user_id",
      [hash(token)],
    );
    if (!result.rowCount) throw new AppError('TOKEN_INVALID', 400);
    const userId = result.rows[0]!.user_id;
    const changed = await tx.query(
      'UPDATE users SET email_verified=true WHERE id=$1 AND email_verified=false RETURNING id',
      [userId],
    );
    if (changed.rowCount) {
      const a = await tx.query<{ account_id: string }>(
        'SELECT account_id FROM wallets WHERE user_id=$1 FOR UPDATE',
        [userId],
      );
      const source = await tx.query<{ id: string }>(
        "SELECT id FROM ledger_accounts WHERE reference='demo-source'",
      );
      await postLedger(tx, 'DEMO_GRANT', userId, [
        { accountId: source.rows[0]!.id, amount: -100000n },
        { accountId: a.rows[0]!.account_id, amount: 100000n },
      ]);
      await moveBalance(tx, userId, 100000n);
      await audit(tx, userId, 'EMAIL_VERIFIED', userId);
    }
    return { verified: true };
  });
}
export async function recovery(pool: pg.Pool, email: string, webUrl: string) {
  await transaction(pool, async (tx) => {
    const u = await tx.query<{ id: string; email: string }>(
      'SELECT id,email FROM users WHERE email=lower($1)',
      [email],
    );
    if (u.rowCount) await tokenEmail(tx, u.rows[0]!.id, u.rows[0]!.email, 'reset', webUrl);
  });
  return { message: 'Se a conta existir, enviaremos as instruções.' };
}
export async function resetPassword(pool: pg.Pool, token: string, password: string) {
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await transaction(pool, async (tx) => {
    const t = await tx.query<{ user_id: string }>(
      "DELETE FROM identity_tokens WHERE token_hash=$1 AND purpose='reset' AND expires_at>now() RETURNING user_id",
      [hash(token)],
    );
    if (!t.rowCount) throw new AppError('TOKEN_INVALID');
    const id = t.rows[0]!.user_id;
    await tx.query('UPDATE users SET password_hash=$2 WHERE id=$1', [id, passwordHash]);
    await tx.query('DELETE FROM user_sessions WHERE user_id=$1', [id]);
    await tx.query("DELETE FROM identity_tokens WHERE user_id=$1 AND purpose='reset'", [id]);
    await audit(tx, id, 'PASSWORD_RESET', id);
  });
  return { reset: true };
}
export function totpCode(secretHex: string, counter: bigint): string {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', Buffer.from(secretHex, 'hex')).update(b).digest();
  const offset = digest[digest.length - 1]! & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
export async function verifyTotp(tx: Tx, userId: string, key: string, code: string) {
  const row = await tx.query<{ secret_encrypted: string; last_counter: string }>(
    'SELECT secret_encrypted,last_counter FROM mfa_credentials WHERE user_id=$1 FOR UPDATE',
    [userId],
  );
  if (!row.rowCount) throw new AppError('MFA_NOT_CONFIGURED', 403);
  const credential = row.rows[0]!;
  const secret = decryptSeed(credential.secret_encrypted, key);
  const now = BigInt(Math.floor(Date.now() / 30000));
  for (const counter of [now - 1n, now, now + 1n]) {
    const expected = totpCode(secret, counter);
    if (
      counter > BigInt(credential.last_counter) &&
      code.length === 6 &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(code))
    ) {
      await tx.query('UPDATE mfa_credentials SET last_counter=$2 WHERE user_id=$1', [
        userId,
        counter.toString(),
      ]);
      return;
    }
  }
  throw new AppError('MFA_INVALID', 403);
}
export async function login(
  pool: pg.Pool,
  email: string,
  password: string,
  key: string,
  code?: string,
) {
  const u = await pool.query<{
    id: string;
    password_hash: string;
    blocked: boolean;
    email_verified: boolean;
  }>('SELECT * FROM users WHERE email=lower($1)', [email]);
  const user = u.rows[0];
  // An actual Argon2 operation also runs for unknown addresses.
  const valid = user
    ? await argon2.verify(user.password_hash, password)
    : await argon2
        .hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 })
        .then(() => false);
  if (!user || !valid || user.blocked) throw new AppError('INVALID_CREDENTIALS', 401);
  if (!user.email_verified) throw new AppError('EMAIL_NOT_VERIFIED', 403);
  return transaction(pool, async (tx) => {
    const mfa = await tx.query<{ enabled: boolean }>(
      'SELECT enabled FROM mfa_credentials WHERE user_id=$1',
      [user.id],
    );
    const enabled = mfa.rows[0]?.enabled === true;
    if (enabled) {
      if (!code) throw new AppError('MFA_REQUIRED', 403);
      await verifyTotp(tx, user.id, key, code);
    }
    const token = randomBytes(32).toString('hex'),
      csrf = randomBytes(32).toString('hex');
    await tx.query(
      "INSERT INTO user_sessions(user_id,token_hash,csrf_token,mfa_verified,expires_at) VALUES($1,$2,$3,$4,now()+interval '12 hours')",
      [user.id, hash(token), csrf, enabled],
    );
    await audit(tx, user.id, 'LOGIN', user.id);
    return { token, csrf };
  });
}
export async function authenticate(pool: pg.Pool, token: string | undefined): Promise<Identity> {
  if (!token) throw new AppError('UNAUTHENTICATED', 401);
  const r = await pool.query<Identity>(
    'SELECT u.id,u.email,u.role,u.email_verified,s.csrf_token,s.id AS session_id,s.mfa_verified FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.blocked=false',
    [hash(token)],
  );
  if (!r.rowCount) throw new AppError('UNAUTHENTICATED', 401);
  return r.rows[0]!;
}
export function base32(hex: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0,
    value = 0,
    result = '';
  for (const byte of Buffer.from(hex, 'hex')) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
export async function setupMfa(pool: pg.Pool, user: Identity, key: string) {
  return transaction(pool, async (tx) => {
    await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
    const old = await tx.query<{ enabled: boolean }>(
      'SELECT enabled FROM mfa_credentials WHERE user_id=$1',
      [user.id],
    );
    if (old.rows[0]?.enabled) throw new AppError('MFA_ALREADY_ENABLED', 409);
    const secret = randomBytes(20).toString('hex');
    await tx.query(
      'INSERT INTO mfa_credentials(user_id,secret_encrypted) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET secret_encrypted=$2,last_counter=-1',
      [user.id, encryptSeed(secret, key)],
    );
    const encoded = base32(secret);
    return {
      secret: encoded,
      uri: `otpauth://totp/Bingo:${encodeURIComponent(user.email)}?secret=${encoded}&issuer=Bingo&algorithm=SHA1&digits=6&period=30`,
    };
  });
}
