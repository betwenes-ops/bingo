import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { database } from '../../apps/api/src/db';
import { createRoom, advanceRound } from '../../apps/api/src/rooms';

test('cadastro até premiação verificável, carteira e bingo individual', async ({ page }) => {
  test.skip(
    !process.env.E2E_DATABASE_URL,
    'Requires an isolated PostgreSQL/API/worker stack; CI enables this test.',
  );
  test.setTimeout(120000);
  const { pool } = database(process.env.E2E_DATABASE_URL!);
  const email = `e2e-${randomUUID()}@example.test`,
    password = 'E2E-only-password-1234';
  const origin = 'http://localhost:3000';
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: false }).fill(password);
    await page.getByRole('button', { name: 'Criar minha conta' }).click();
    await expect(
      page.getByText('Se o endereço puder ser cadastrado, enviaremos um e-mail de confirmação.'),
    ).toBeVisible();
    // Read the actual queued email from the isolated test DB. No verification bypass:
    // the browser follows its one-time link and the real API grants the credits.
    const mail = await pool.query<{ body: string }>(
      'SELECT body FROM email_outbox WHERE recipient=$1 ORDER BY created_at DESC LIMIT 1',
      [email],
    );
    const token = /verify=([a-f0-9]{64})/.exec(mail.rows[0]!.body)![1]!;
    await page.goto(`${origin}/?verify=${token}`);
    await expect(page.getByText(/E-mail confirmado. Seus 1.000 créditos fictícios/)).toBeVisible();
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: false }).fill(password);
    await page.getByRole('dialog').getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const user = (await pool.query<{ id: string }>('SELECT id FROM users WHERE email=$1', [email]))
      .rows[0]!;
    const room = await createRoom(pool, process.env.SEED_ENCRYPTION_KEY!, user.id, {
      name: `Encontro E2E ${email.slice(4, 12)} — créditos fictícios`,
      variant: 75,
      price: '100',
      salesSeconds: 15,
      ballIntervalMs: 1000,
      maxCards: 24,
      prizeBps: 8500,
      minPlayers: 1,
    });
    await expect(
      page.getByRole('heading', {
        name: `Encontro E2E ${email.slice(4, 12)} — créditos fictícios`,
      }),
    ).toBeVisible({ timeout: 10000 });
    const tile = page.locator('article').filter({
      has: page.getByRole('heading', {
        name: `Encontro E2E ${email.slice(4, 12)} — créditos fictícios`,
      }),
    });
    await tile.getByRole('button', { name: 'Escolher minhas cartelas' }).click();
    await page.getByRole('button', { name: 'Comprar · 1,00 créditos' }).click();
    await expect(page.getByText('CARTELA 01', { exact: false })).toBeVisible();
    await expect
      .poll(async () =>
        Number(
          (
            await pool.query('SELECT count(*)::int AS count FROM bingo_cards WHERE round_id=$1', [
              room.id,
            ])
          ).rows[0].count,
        ),
      )
      .toBe(1);
    // Advance real persistent time-based state. Only next_ball_at is accelerated;
    // CSPRNG, cards, patterns, winner selection and ledger remain unchanged.
    await expect
      .poll(
        async () => {
          await advanceRound(pool, process.env.SEED_ENCRYPTION_KEY!, room.id);
          return (await pool.query('SELECT state FROM game_rounds WHERE id=$1', [room.id])).rows[0]
            .state;
        },
        { timeout: 20000, intervals: [500] },
      )
      .toBe('DRAWING');
    for (let i = 0; i < 75; i++) {
      await pool.query(
        "UPDATE game_rounds SET next_ball_at=clock_timestamp()-interval '1 second' WHERE id=$1 AND state='DRAWING'",
        [room.id],
      );
      await advanceRound(pool, process.env.SEED_ENCRYPTION_KEY!, room.id);
      if (
        (await pool.query('SELECT state FROM game_rounds WHERE id=$1', [room.id])).rows[0].state ===
        'COMPLETED'
      )
        break;
    }
    await expect(page.getByRole('button', { name: 'Verificar resultado' })).toBeEnabled({
      timeout: 10000,
    });
    await page.getByRole('button', { name: 'Verificar resultado' }).click();
    await expect(page.getByText(/Verificada. Compromisso e sequência conferem/)).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: `test-results/game-completed-${test.info().project.name}.png`,
      fullPage: true,
      scale: 'css',
    });
    const wallet = (
      await pool.query('SELECT balance::text FROM wallets WHERE user_id=$1', [user.id])
    ).rows[0];
    expect(wallet.balance).toBe('99985');
    if (await page.getByRole('button', { name: 'Abrir navegação' }).isVisible())
      await page.getByRole('button', { name: 'Abrir navegação' }).click();
    await page.getByRole('button', { name: 'Minha carteira', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cada crédito, com clareza.' })).toBeVisible();
    await expect(page.getByText('Premiação', { exact: false })).toBeVisible();
    if (await page.getByRole('button', { name: 'Abrir navegação' }).isVisible())
      await page.getByRole('button', { name: 'Abrir navegação' }).click();
    await page.getByRole('button', { name: 'Bingo individual', exact: true }).click();
    await page.getByRole('button', { name: 'Preparar sorteio', exact: true }).click();
    await expect(page.getByText('COMPROMISSO PUBLICADO ANTES DA PARTICIPAÇÃO')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar · 1,00 créditos' }).click();
    await expect(page.getByRole('button', { name: 'Exibir resultado completo' })).toBeVisible();
    await page.getByRole('button', { name: 'Exibir resultado completo' }).click();
    await page.getByRole('button', { name: 'Verificar neste navegador' }).click();
    await expect(
      page.getByText('Compromisso, cartela, pagamento e 30 bolas verificados neste navegador.'),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: `test-results/instant-result-${test.info().project.name}.png`,
      fullPage: true,
      scale: 'css',
    });
  } finally {
    await pool.end();
  }
});
