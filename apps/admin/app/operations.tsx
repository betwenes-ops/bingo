'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, stateLabel, type User, type Room } from '../../web/lib/api';
type Person = { id: string; email: string; blocked: boolean; role: string };
type Catalog = {
  key: string;
  name: string;
  enabled: boolean;
  version: string | null;
  config_hash: string | null;
};
type Schedule = {
  id: string;
  enabled: boolean;
  interval_seconds: number;
  next_open_at: string;
  config: { name: string };
};
type Case = { id: string; email: string; subject: string; message: string; status: string };
type Health = {
  configuration: { smtpExternal: boolean };
  workers: { instance_id: string; healthy: boolean; updated_at: string; rounds_advanced: string }[];
  outbox: { pending: number };
  email: { pending: number; failed: number };
  scheduler: { seconds: number };
};
export function Operations({
  user,
  rooms,
  users,
  onChange,
}: {
  user: User;
  rooms: Room[];
  users: Person[];
  onChange: () => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<Catalog[]>([]),
    [schedules, setSchedules] = useState<Schedule[]>([]),
    [cases, setCases] = useState<Case[]>([]),
    [health, setHealth] = useState<Health | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const operator = ['superadmin', 'operator'].includes(user.role),
    support = ['superadmin', 'support'].includes(user.role);
  const load = useCallback(async () => {
    setError('');
    const jobs = [
      api<Health>('/v1/admin/health').then(setHealth),
      api<Catalog[]>('/v1/admin/catalog').then(setCatalog),
    ];
    if (['superadmin', 'operator', 'auditor'].includes(user.role))
      jobs.push(api<Schedule[]>('/v1/admin/schedules').then(setSchedules));
    if (['superadmin', 'support', 'auditor'].includes(user.role))
      jobs.push(api<{ cases: Case[] }>('/v1/admin/support').then((r) => setCases(r.cases)));
    const results = await Promise.allSettled(jobs);
    for (const result of results)
      if (result.status === 'rejected') setError((result.reason as Error).message);
  }, [user.role]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);
  async function write(path: string, body: unknown) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) }, user.csrfToken);
      setMessage('Operação registrada na auditoria.');
      await Promise.all([load(), onChange()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const form = (handler: (f: FormData) => void) => (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    handler(new FormData(event.currentTarget));
  };
  return (
    <>
      <section className="table-panel">
        <h2>Saúde da operação</h2>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="success">
            {message}
          </p>
        )}
        {health ? (
          <>
            <p role={health.configuration.smtpExternal ? 'status' : 'alert'}>
              Envio de e-mails:{' '}
              {health.configuration.smtpExternal
                ? 'servidor externo configurado — confira a entrega no provedor'
                : 'provedor externo não configurado; confirmações e recuperação de senha não serão entregues'}
            </p>
            <p role="status">
              Motor:{' '}
              {health.workers.some((w) => w.healthy)
                ? 'ativo'
                : 'sem worker ativo — sorteios não avançarão automaticamente'}{' '}
              · eventos pendentes: {health.outbox.pending} · e-mails pendentes:{' '}
              {health.email.pending} · entregas esgotadas: {health.email.failed} · atraso do
              sorteio: {Math.max(0, Math.round(health.scheduler.seconds))}s
            </p>
            <ul>
              {health.workers.map((w) => (
                <li key={w.instance_id}>
                  {w.healthy ? 'Ativo' : 'Sem sinal recente'} · última atividade{' '}
                  {new Date(w.updated_at).toLocaleString('pt-BR')} · {w.rounds_advanced} avanços
                  processados
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>Carregando saúde dos serviços…</p>
        )}
        <button className="secondary" disabled={busy} onClick={() => void load()}>
          Atualizar operação
        </button>
      </section>
      {operator && (
        <section className="table-panel">
          <h2>Controle de vendas e cancelamento</h2>
          <p>
            Cancelamento somente antes do sorteio, com estorno integral. Pausar vendas preserva o
            horário publicado.
          </p>
          <form
            className="room-form"
            onSubmit={form(
              (f) =>
                void write(`/v1/admin/rounds/${f.get('round')}/control`, {
                  action: f.get('action'),
                  reason: f.get('reason'),
                }),
            )}
          >
            <label>
              Rodada
              <select name="round" required>
                <option value="">Selecione</option>
                {rooms
                  .filter((r) =>
                    ['SCHEDULED', 'OPEN_FOR_SALES', 'SALES_CLOSED', 'READY'].includes(r.state),
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Ação
              <select name="action">
                <option value="pause">Pausar novas compras</option>
                <option value="resume">Retomar compras</option>
                <option value="cancel">Cancelar e estornar</option>
              </select>
            </label>
            <label>
              Justificativa
              <input name="reason" minLength={5} maxLength={500} required />
            </label>
            <button className="primary" disabled={busy}>
              Registrar ação
            </button>
          </form>
        </section>
      )}
      {(support || user.role === 'superadmin') && (
        <section className="table-panel">
          <h2>Bloqueio de acesso</h2>
          <form
            className="room-form"
            onSubmit={form(
              (f) =>
                void write(`/v1/admin/users/${f.get('person')}/status`, {
                  blocked: f.get('blocked') === 'true',
                  reason: f.get('reason'),
                }),
            )}
          >
            <label>
              Usuário
              <select name="person" required>
                <option value="">Selecione</option>
                {users
                  .filter(
                    (p) => p.id !== user.id && (user.role === 'superadmin' || p.role === 'player'),
                  )
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.email} · {p.blocked ? 'bloqueado' : 'ativo'}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Ação
              <select name="blocked">
                <option value="true">Bloquear e encerrar sessões</option>
                <option value="false">Desbloquear</option>
              </select>
            </label>
            <label>
              Justificativa
              <input name="reason" minLength={5} maxLength={500} required />
            </label>
            <button className="primary" disabled={busy}>
              Salvar estado
            </button>
          </form>
        </section>
      )}
      {user.role === 'superadmin' && (
        <section className="table-panel">
          <h2>Papéis da equipe</h2>
          <p>Alterar o papel encerra as sessões do usuário. A equipe precisa autenticar com MFA.</p>
          <form
            className="room-form"
            onSubmit={form(
              (f) =>
                void write(`/v1/admin/users/${f.get('person')}/role`, {
                  role: f.get('role'),
                  reason: f.get('reason'),
                }),
            )}
          >
            <label>
              Usuário
              <select name="person" required>
                <option value="">Selecione</option>
                {users
                  .filter((p) => p.id !== user.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.email} · {p.role}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Papel
              <select name="role">
                {['player', 'operator', 'finance', 'support', 'auditor', 'superadmin'].map(
                  (role) => (
                    <option key={role} value={role}>
                      {
                        (
                          {
                            player: 'Jogador',
                            operator: 'Operação de jogos',
                            finance: 'Financeiro',
                            support: 'Suporte',
                            auditor: 'Auditoria',
                            superadmin: 'Administrador geral',
                          } as Record<string, string>
                        )[role]
                      }
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Justificativa
              <input name="reason" minLength={5} maxLength={500} required />
            </label>
            <button className="primary" disabled={busy}>
              Alterar papel
            </button>
          </form>
        </section>
      )}
      <section className="table-panel">
        <h2>Catálogo e versões publicadas</h2>
        <p>Regras publicadas permanecem imutáveis. A disponibilidade afeta novas publicações.</p>
        {catalog.map((g, index) => (
          <article key={`${g.key}:${g.version ?? index}`}>
            <h3>
              {g.name} · {g.enabled ? 'Disponível' : 'Pausado'}
            </h3>
            <p>Versão: {g.version ?? 'Ainda não publicada'}</p>
            {g.config_hash && <code className="hash-value">{g.config_hash}</code>}
            {operator && (
              <form
                onSubmit={form(
                  (f) =>
                    void write('/v1/admin/catalog/availability', {
                      key: g.key,
                      enabled: !g.enabled,
                      reason: f.get('reason'),
                    }),
                )}
              >
                <label>
                  Motivo
                  <input name="reason" minLength={5} maxLength={500} required />
                </label>
                <button className="secondary" disabled={busy}>
                  {g.enabled ? 'Pausar modalidade' : 'Habilitar modalidade'}
                </button>
              </form>
            )}
          </article>
        ))}
        {!catalog.length && (
          <p>
            Nenhuma versão publicada. As versões são criadas ao publicar uma sala ou preparar um
            jogo individual.
          </p>
        )}
      </section>
      {['superadmin', 'operator', 'auditor'].includes(user.role) && (
        <section className="table-panel">
          <h2>Salas recorrentes</h2>
          <p>
            Crie recorrências pelo formulário de nova sala. O worker é obrigatório para executá-las.
          </p>
          {schedules.map((s) => (
            <article key={s.id}>
              <h3>{s.config.name}</h3>
              <p>
                {s.enabled ? 'Ativa' : 'Pausada'} · a cada {s.interval_seconds}s · próxima execução{' '}
                {new Date(s.next_open_at).toLocaleString('pt-BR')}
              </p>
              {operator && (
                <form
                  onSubmit={form(
                    (f) =>
                      void write(`/v1/admin/schedules/${s.id}/status`, {
                        enabled: !s.enabled,
                        reason: f.get('reason'),
                      }),
                  )}
                >
                  <label>
                    Motivo
                    <input name="reason" minLength={5} maxLength={500} required />
                  </label>
                  <button className="secondary" disabled={busy}>
                    {s.enabled ? 'Pausar recorrência' : 'Retomar recorrência'}
                  </button>
                </form>
              )}
            </article>
          ))}
          {!schedules.length && <p>Nenhuma recorrência cadastrada.</p>}
        </section>
      )}
      {['superadmin', 'support', 'auditor'].includes(user.role) && (
        <section className="table-panel">
          <h2>Atendimento e contestação</h2>
          {cases.map((c) => (
            <article key={c.id}>
              <h3>{c.subject}</h3>
              <p>
                {c.email} · {stateLabel(c.status)}
              </p>
              <p>{c.message}</p>
              {support && (
                <form
                  onSubmit={form(
                    (f) =>
                      void write(`/v1/admin/support/${c.id}/reply`, {
                        message: f.get('message'),
                        close: f.get('close') === 'on',
                      }),
                  )}
                >
                  <label>
                    Resposta
                    <textarea name="message" minLength={5} maxLength={4000} required />
                  </label>
                  <label className="checkbox">
                    <input name="close" type="checkbox" />
                    Encerrar solicitação
                  </label>
                  <button className="primary" disabled={busy}>
                    Responder
                  </button>
                </form>
              )}
            </article>
          ))}
          {!cases.length && <p>Nenhuma solicitação de atendimento.</p>}
        </section>
      )}
    </>
  );
}
