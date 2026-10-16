'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, credits, type User } from '../lib/api';
type Session = { id: string; created_at: string; expires_at: string; current: boolean };
type Notice = { id: string; message: string; read_at: string | null };
type Play = { id: string; stake: string; payout: string; created_at: string; game_version: string };
export function AccountSecurity({ user, onUpdate }: { user: User; onUpdate: () => void }) {
  const [sessions, setSessions] = useState<Session[]>([]),
    [notices, setNotices] = useState<Notice[]>([]),
    [plays, setPlays] = useState<Play[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      api<Session[]>('/v1/me/sessions').then(setSessions),
      api<Notice[]>('/v1/me/notifications').then(setNotices),
      api<Play[]>('/v1/instant/history').then(setPlays),
    ]);
    for (const r of results) if (r.status === 'rejected') setError((r.reason as Error).message);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function revoke(session: Session) {
    setBusy(true);
    setError('');
    try {
      await api(`/v1/me/sessions/${session.id}`, { method: 'DELETE' }, user.csrfToken);
      if (session.current) onUpdate();
      else await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api(
        '/v1/me/anonymize',
        {
          method: 'POST',
          body: JSON.stringify({
            password: f.get('password'),
            confirmation: f.get('confirmation'),
            ...(user.mfaEnabled ? { totp: f.get('totp') } : {}),
          }),
        },
        user.csrfToken,
      );
      onUpdate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function read() {
    setBusy(true);
    try {
      await api('/v1/me/notifications/read', { method: 'POST' }, user.csrfToken);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <section className="table-panel">
        <h2>Sessões de acesso</h2>
        <p>
          Encerre acessos que você não reconhece. A lista identifica sessões, sem coletar impressão
          digital do aparelho.
        </p>
        {sessions.map((s) => (
          <article key={s.id}>
            <p>
              {s.current ? 'Esta sessão' : 'Outra sessão'} · iniciada em{' '}
              {new Date(s.created_at).toLocaleString('pt-BR')}
            </p>
            <button className="secondary" disabled={busy} onClick={() => void revoke(s)}>
              {s.current ? 'Sair desta sessão' : 'Encerrar sessão'}
            </button>
          </article>
        ))}
      </section>
      <section className="table-panel">
        <h2>Notificações</h2>
        {notices.length ? (
          <>
            <ul>
              {notices.map((n) => (
                <li key={n.id}>
                  {n.read_at ? '' : 'Nova · '}
                  {n.message}
                </li>
              ))}
            </ul>
            <button className="secondary" onClick={() => void read()} disabled={busy}>
              Marcar como lidas
            </button>
          </>
        ) : (
          <p>Nenhuma notificação.</p>
        )}
      </section>
      <section className="table-panel">
        <h2>Histórico do bingo individual</h2>
        {plays.length ? (
          <ul>
            {plays.map((p) => (
              <li key={p.id}>
                {new Date(p.created_at).toLocaleString('pt-BR')} · participação {credits(p.stake)} ·
                prêmio {credits(p.payout)} créditos · {p.game_version}
              </li>
            ))}
          </ul>
        ) : (
          <p>Nenhuma partida individual realizada.</p>
        )}
      </section>
      <section className="table-panel">
        <details>
          <summary>Desativar e anonimizar identificação da conta</summary>
          <p>
            Esta ação é permanente nesta demonstração. Seu e-mail e credenciais serão removidos,
            suas sessões encerradas e novas participações bloqueadas. Cartelas já compradas
            continuam válidas. Razão, resultados, auditoria e mensagens de atendimento permanecem
            vinculados a um identificador; evite incluir dados sensíveis nos textos de suporte.
          </p>
          <p>Baixe seus dados antes de continuar. Créditos são fictícios e não têm resgate.</p>
          <form onSubmit={remove}>
            <label>
              Confirmação
              <input
                name="confirmation"
                placeholder="EXCLUIR MINHA CONTA"
                pattern="EXCLUIR MINHA CONTA"
                required
                autoComplete="off"
              />
            </label>
            <label>
              Senha atual
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                required
                autoComplete="current-password"
              />
            </label>
            {user.mfaEnabled && (
              <label>
                Código do autenticador
                <input
                  name="totp"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoComplete="one-time-code"
                />
              </label>
            )}
            <button className="danger" disabled={busy}>
              Confirmar desativação permanente
            </button>
          </form>
        </details>
      </section>
    </>
  );
}
