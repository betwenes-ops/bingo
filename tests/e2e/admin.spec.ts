import { test, expect, type Page } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { database, transaction } from '../../apps/api/src/db';
import { register, verifyEmail, totpCode } from '../../apps/api/src/identity';
import { audit } from '../../apps/api/src/wallet';
import { encryptSeed, decryptSeed } from '../../packages/domain/src/rng';

test('admin com MFA publica recorrência e exige uma segunda pessoa no financeiro', async ({
  page,
  browser,
}) => {
  test.skip(!process.env.E2E_DATABASE_URL, 'Requires isolated PostgreSQL and API');
  test.setTimeout(120000);
  const { pool } = database(process.env.E2E_DATABASE_URL!);
  const password = 'E2E-admin-password-1234',
    key = process.env.SEED_ENCRYPTION_KEY!,
    origin = 'http://localhost:3001';
  async function person() {
    const email = `admin-e2e-${randomUUID()}@example.test`;
    await register(pool, email, password, 'http://localhost:3000');
    const message = (
      await pool.query(
        'SELECT body FROM email_outbox WHERE recipient=$1 ORDER BY created_at DESC LIMIT 1',
        [email],
      )
    ).rows[0].body as string;
    await verifyEmail(pool, /verify=([a-f0-9]{64})/.exec(message)![1]!);
    const id = (await pool.query('SELECT id FROM users WHERE email=$1', [email])).rows[0]
      .id as string;
    await transaction(pool, async (tx) => {
      await tx.query("UPDATE users SET role='superadmin' WHERE id=$1", [id]);
      await audit(tx, id, 'E2E_ADMIN_FIXTURE', id);
    });
    return { id, email };
  }
  async function signIn(p: Page, email: string, code?: string) {
    await p.goto(origin);
    await p.getByRole('button', { name: 'Entrar', exact: true }).click();
    await p.getByLabel('E-mail', { exact: true }).fill(email);
    await p.getByLabel('Senha', { exact: false }).fill(password);
    if (code) await p.getByLabel('Código do autenticador').fill(code);
    await p.getByRole('dialog').getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(p.getByRole('dialog')).toHaveCount(0);
  }
  const other = await browser.newContext();
  try {
    const a = await person(),
      b = await person();
    await signIn(page, a.email);
    await page.getByRole('button', { name: 'Configurar autenticador' }).click();
    await expect(page.getByLabel('Código de confirmação')).toBeVisible();
    const encrypted = (
      await pool.query('SELECT secret_encrypted FROM mfa_credentials WHERE user_id=$1', [a.id])
    ).rows[0].secret_encrypted as string;
    await page
      .getByLabel('Código de confirmação')
      .fill(totpCode(decryptSeed(encrypted, key), BigInt(Math.floor(Date.now() / 30000))));
    await page.getByRole('button', { name: 'Ativar MFA' }).click();
    await expect(
      page.getByRole('button', { name: 'Operação e suporte', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Salas e rodadas', exact: true }).click();
    await page.getByRole('button', { name: 'Nova sala', exact: true }).click();
    const roomName = `Recorrência E2E ${randomUUID().slice(0, 8)}`;
    await page.getByLabel('Nome da sala').fill(roomName);
    await page.getByLabel('Criar recorrência', { exact: true }).check();
    await page.getByRole('button', { name: 'Publicar e abrir inscrições' }).click();
    await expect(
      page.getByText('Configuração publicada. As regras da rodada são imutáveis.'),
    ).toBeVisible();
    expect(
      (await pool.query("SELECT id FROM room_schedules WHERE config->>'name'=$1", [roomName]))
        .rowCount,
    ).toBe(1);
    await page.getByRole('button', { name: 'Operação e suporte', exact: true }).click();
    await expect(page.getByRole('heading', { name: roomName, exact: true })).toBeVisible();
    await page.screenshot({
      path: `test-results/admin-operations-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Financeiro', exact: true }).click();
    const reason = `Fundo E2E ${randomUUID()}`;
    await page.getByLabel('Créditos inteiros (negativo para débito)').fill('100');
    await page.getByLabel('Motivo auditável').fill(reason);
    await page.getByRole('button', { name: 'Solicitar ajuste', exact: true }).click();
    const own = page.getByRole('row').filter({ hasText: reason });
    await expect(own).toBeVisible();
    await expect(own.getByRole('button', { name: 'Registrar decisão' })).toHaveCount(0);
    const secret = randomBytes(20).toString('hex');
    await pool.query(
      'INSERT INTO mfa_credentials(user_id,secret_encrypted,enabled) VALUES($1,$2,true)',
      [b.id, encryptSeed(secret, key)],
    );
    const approver = await other.newPage();
    await signIn(approver, b.email, totpCode(secret, BigInt(Math.floor(Date.now() / 30000))));
    await approver.getByRole('button', { name: 'Financeiro', exact: true }).click();
    const request = approver.getByRole('row').filter({ hasText: reason });
    await expect(request).toBeVisible();
    await request.getByLabel('Justificativa da decisão').fill('Conferido por outra pessoa no E2E');
    await request.getByLabel('Decisão').selectOption('approve');
    await request.getByRole('button', { name: 'Registrar decisão' }).click();
    await expect(request.getByRole('button', { name: 'Registrar decisão' })).toHaveCount(0);
    expect(
      (
        await pool.query('SELECT status,approved_by FROM admin_adjustments WHERE reason=$1', [
          reason,
        ])
      ).rows[0],
    ).toMatchObject({ status: 'APPROVED', approved_by: b.id });
  } finally {
    await other.close();
    await pool.end();
  }
});
