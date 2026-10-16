'use client';
import { useState, useEffect } from 'react';
import { ShieldCheck, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { AccountSecurity } from './account-security';
import { AccountServices } from './account-services';
import { api, credits, type User } from '../lib/api';
export function Account({
  user,
  onUpdate,
  tab,
}: {
  user: User;
  onUpdate: () => void;
  tab: 'wallet' | 'profile';
}) {
  const [entries, setEntries] = useState<
      { id: string; amount: string; kind: string; created_at: string }[]
    >([]),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [secret, setSecret] = useState(''),
    [code, setCode] = useState(''),
    [limit, setLimit] = useState('1000'),
    [busy, setBusy] = useState(false),
    [selfConfirm, setSelfConfirm] = useState(false);
  useEffect(() => {
    api<typeof entries>('/v1/wallet/entries')
      .then(setEntries)
      .catch((e) => setError(e.message));
    api<{ daily_limit: string }>('/v1/me/limits')
      .then((r) => setLimit((BigInt(r.daily_limit) / 100n).toString()))
      .catch((e) => setError(e.message));
  }, []);
  async function action(path: string, body: unknown) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const r = await api<{ secret?: string }>(
        path,
        { method: 'POST', body: JSON.stringify(body) },
        user.csrfToken,
      );
      if (r.secret) setSecret(r.secret);
      else {
        setSuccess('Preferência salva.');
        onUpdate();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <span className="eyebrow">SUA CONTA</span>
      <h1>{tab === 'wallet' ? 'Cada crédito, com clareza.' : 'Jogue no seu ritmo.'}</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="success" role="status">
          {success}
        </p>
      )}
      {tab === 'wallet' ? (
        <>
          <section className="wallet-hero">
            <span>SALDO DISPONÍVEL</span>
            <strong>
              {credits(user.balance)} <small>créditos</small>
            </strong>
            <p>
              Créditos fictícios concedidos após a confirmação de e-mail.
              <br />
              Sem depósitos, saques ou conversão em dinheiro.
            </p>
          </section>
          <section className="table-panel">
            <h2>Suas movimentações</h2>
            {entries.length === 0 ? (
              <p>Nenhuma movimentação por aqui.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Movimentação</th>
                      <th>Data</th>
                      <th>Créditos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {BigInt(e.amount) > 0 ? (
                            <ArrowDownLeft size={16} />
                          ) : (
                            <ArrowUpRight size={16} />
                          )}{' '}
                          {(
                            {
                              DEMO_GRANT: 'Créditos de demonstração',
                              CARD_PURCHASE: 'Compra de cartelas',
                              PRIZE: 'Premiação',
                              REFUND: 'Reembolso',
                            } as Record<string, string>
                          )[e.kind] ?? e.kind}
                        </td>
                        <td>
                          {new Date(e.created_at).toLocaleString('pt-BR', {
                            timeZone: 'America/Sao_Paulo',
                          })}
                        </td>
                        <td className={BigInt(e.amount) > 0 ? 'positive' : ''}>
                          {BigInt(e.amount) > 0 ? '+' : '−'}
                          {credits(
                            (BigInt(e.amount) < 0
                              ? -BigInt(e.amount)
                              : BigInt(e.amount)
                            ).toString(),
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="profile-grid">
          <section className="table-panel">
            <ShieldCheck className="gold" />
            <h2>Uma camada extra de segurança</h2>
            <p>{user.email}</p>
            <p>Ative a verificação em duas etapas com seu aplicativo autenticador.</p>
            {user.mfaEnabled ? (
              <span className="tag">MFA ativo</span>
            ) : (
              <>
                {!secret ? (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void action('/v1/auth/mfa/setup', {})}
                  >
                    Configurar autenticador
                  </button>
                ) : (
                  <>
                    <p>Adicione esta chave ao seu autenticador (TOTP, 6 dígitos, 30 segundos):</p>
                    <code className="secret">{secret}</code>
                    <label>
                      Código de confirmação
                      <input
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                    </label>
                    <button
                      className="primary"
                      disabled={busy || code.length !== 6}
                      onClick={() => void action('/v1/auth/mfa/enable', { code })}
                    >
                      Ativar MFA
                    </button>
                  </>
                )}
              </>
            )}
          </section>
          <section className="table-panel">
            <h2>Seu limite diário</h2>
            <p>
              Você pode reduzir seu limite de participação a qualquer momento. Esta versão não
              permite aumentá-lo.
            </p>
            <label>
              Créditos por dia
              <input
                type="number"
                min="0"
                step="1"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </label>
            <button
              className="secondary"
              disabled={busy || !/^\d+$/.test(limit)}
              onClick={() =>
                void action('/v1/me/limits', { dailyLimit: (BigInt(limit) * 100n).toString() })
              }
            >
              Salvar limite
            </button>
          </section>
          <section className="table-panel">
            <h2>Uma pausa também faz parte.</h2>
            <p>
              Durante a pausa, nenhuma nova compra será permitida. Cartelas já compradas continuam
              válidas.
            </p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void action('/v1/me/limits', { pauseHours: 24 })}
            >
              Pausar por 24 horas
            </button>
            <hr />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={selfConfirm}
                onChange={(e) => setSelfConfirm(e.target.checked)}
              />
              Entendo que a autoexclusão é permanente nesta demonstração.
            </label>
            <button
              className="danger"
              disabled={busy || !selfConfirm}
              onClick={() => void action('/v1/me/limits', { selfExclude: true })}
            >
              Confirmar autoexclusão
            </button>
          </section>
        </div>
      )}
      {tab === 'profile' && (
        <>
          <AccountServices user={user} />
          <AccountSecurity user={user} onUpdate={onUpdate} />
        </>
      )}
    </>
  );
}
