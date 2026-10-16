import { test, expect } from '@playwright/test';
test('lobby acessível, sem contadores inventados e sem transbordar no celular', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByText('DEMONSTRAÇÃO — créditos fictícios sem valor monetário', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Um número. Mil possibilidades.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Encontrar uma sala' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({
    path: `test-results/lobby-${test.info().project.name}.png`,
    fullPage: true,
    scale: 'css',
  });
  await page.getByRole('button', { name: 'Entrar', exact: false }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Seu lugar está reservado.' })).toBeVisible();
  await page.screenshot({ path: `test-results/register-${test.info().project.name}.png` });
});
test('admin exige autenticação e mantém demonstração visível', async ({ page }) => {
  await page.goto('http://localhost:3001');
  await expect(
    page.getByRole('heading', { name: 'Clareza para operar. Integridade para crescer.' }),
  ).toBeVisible();
  await expect(
    page.getByText('OPERAÇÃO DE DEMONSTRAÇÃO — CRÉDITOS SEM VALOR MONETÁRIO'),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/admin-${test.info().project.name}.png`,
    fullPage: true,
    scale: 'css',
  });
});
