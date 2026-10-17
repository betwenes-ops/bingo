import { describe, it, expect } from 'vitest';
import { readConfig } from './config';
const base = { NODE_ENV: 'test', DATABASE_URL: 'unused', SEED_ENCRYPTION_KEY: '14'.repeat(32) };
describe('Origens explícitas da implantação', () => {
  it('valida endereço e protocolo SMTP antes de iniciar os serviços', () => {
    for (const SMTP_URL of ['not-a-url', '', 'smtp://', 'https://mail.example.test'])
      expect(() => readConfig({ ...base, SMTP_URL })).toThrow();
    for (const SMTP_URL of [
      'smtp://localhost:1025',
      'smtp://mail.example.test:587',
      'smtps://mail.example.test:465',
    ])
      expect(readConfig({ ...base, SMTP_URL }).SMTP_URL).toBe(SMTP_URL);
  });
  it('inclui o site confirmado somente no projeto Railway correspondente', () => {
    const configured = readConfig({
      ...base,
      RAILWAY_PROJECT_ID: '6ac1f620-3a63-421f-865c-06502fee7956',
    });
    expect(configured.PUBLIC_WEB_URL).toBe('https://bingoweb-production-8b1f.up.railway.app');
    expect(configured.ALLOWED_ORIGINS.split(',')).toContain(configured.PUBLIC_WEB_URL);
    expect(
      readConfig({ ...base, RAILWAY_PROJECT_ID: 'different-project' }).ALLOWED_ORIGINS,
    ).not.toContain('railway.app');
    expect(
      readConfig({
        ...base,
        RAILWAY_PUBLIC_DOMAIN: 'bingoapi-production-e17b.up.railway.app.evil.test',
      }).ALLOWED_ORIGINS,
    ).not.toContain('railway.app');
  });
  it('normaliza a origem do endereço público e preserva domínios adicionais explícitos', () => {
    const c = readConfig({
      ...base,
      PUBLIC_WEB_URL: 'https://demo.example.test/',
      ALLOWED_ORIGINS: ' https://admin.example.test ,http://localhost:3000',
    });
    expect(c.ALLOWED_ORIGINS.split(',')).toEqual([
      'https://admin.example.test',
      'http://localhost:3000',
      'https://demo.example.test',
    ]);
  });
});
