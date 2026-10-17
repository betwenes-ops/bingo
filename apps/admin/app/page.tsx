'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  Radio,
  ScrollText,
  LogOut,
  Plus,
  RefreshCw,
  ArrowUpRight,
} from 'lucide-react';
import { api, credits, stateLabel, type User, type Room } from '../../web/lib/api';
import { Auth } from '../../web/components/auth';
import { Operations } from './operations';
import { Finance } from './finance';
import { Account } from '../../web/components/account';
type Summary = {
  users: number;
  live: number;
  cards: number;
  prizes: string;
  balances: string;
  pending_events: number;
};
type AdminUser = {
  id: string;
  email: string;
  role: string;
  balance: string;
  email_verified: boolean;
  blocked: boolean;
};
type Audit = {
  id: string;
  action: string;
  subject: string;
  actor_id: string | null;
  created_at: string;
};
export default function Admin() {
  const [user, setUser] = useState<User | null>(null),
    [auth, setAuth] = useState(false),
    [tab, setTab] = useState('dashboard'),
    [summary, setSummary] = useState<Summary | null>(null),
    [rooms, setRooms] = useState<Room[]>([]),
    [users, setUsers] = useState<AdminUser[]>([]),
    [audit, setAudit] = useState<Audit[]>([]),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [query, setQuery] = useState(''),
    [userSearch, setUserSearch] = useState(''),
    [userOffset, setUserOffset] = useState(0),
    [usersLoading, setUsersLoading] = useState(false);
  const refreshVersion = useRef(0);
  const refreshUser = useCallback(() => {
    void api<User>('/v1/me')
      .then(setUser)
      .catch(() => setUser(null));
  }, []);
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    setUsersLoading(true);
    setError('');
    try {
      const [s, r, u, a] = await Promise.all([
        api<Summary>('/v1/admin/summary'),
        api<{ rooms: Room[] }>('/v1/rooms'),
        api<AdminUser[]>(
          `/v1/admin/users?q=${encodeURIComponent(userSearch)}&offset=${userOffset}`,
        ),
        api<Audit[]>('/v1/admin/audit'),
      ]);
      if (version !== refreshVersion.current) return;
      setSummary(s);
      setRooms(r.rooms);
      setUsers(u);
      setAudit(a);
    } catch (e) {
      if (version === refreshVersion.current) setError((e as Error).message);
    } finally {
      if (version === refreshVersion.current) setUsersLoading(false);
    }
  }, [userSearch, userOffset]);
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);
  useEffect(() => {
    if (user && user.role !== 'player' && user.mfaEnabled) {
      void refresh();
      const t = setInterval(() => void refresh(), 10000);
      return () => {
        clearInterval(t);
        refreshVersion.current++;
      };
    }
  }, [user, refresh]);
  async function reconcile() {
    if (!user) return;
    setBusy(true);
    try {
      const r = await api<{ consistent: boolean; discrepancies: unknown[] }>(
        '/v1/admin/reconcile',
        { method: 'POST' },
        user.csrfToken,
      );
      setSuccess(
        r.consistent
          ? 'Conciliação concluída: nenhuma divergência.'
          : `Atenção: ${r.discrepancies.length} divergências encontradas.`,
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      const config = {
        name: f.get('name'),
        variant: Number(f.get('variant')),
        price: (BigInt(String(f.get('price'))) * 100n).toString(),
        salesSeconds: Number(f.get('seconds')),
        ballIntervalMs: 4000,
        maxCards: 24,
        prizeBps: 8500,
        minPlayers: Number(f.get('minimum')),
        startsInSeconds: Number(f.get('starts')),
        pattern: f.get('pattern'),
        prizePolicy: f.get('policy'),
        ...(f.get('policy') === 'fixed'
          ? { fixedPrize: (BigInt(String(f.get('fixedPrize'))) * 100n).toString() }
          : {}),
      };
      const recurring = f.get('recurring') === 'on';
      await api(
        recurring ? '/v1/admin/schedules' : '/v1/admin/rooms',
        {
          method: 'POST',
          body: JSON.stringify(
            recurring ? { config, intervalSeconds: Number(f.get('interval')) } : config,
          ),
        },
        user.csrfToken,
      );
      setCreating(false);
      setSuccess('Configuração publicada. As regras da rodada são imutáveis.');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="demo-banner">
        <ShieldCheck size={13} />
        OPERAÇÃO DE DEMONSTRAÇÃO — CRÉDITOS SEM VALOR MONETÁRIO
      </div>
      <header className="topbar">
        <div className="brand">
          <span className="brand-symbol">b.</span>
          <span>
            bingo<span className="brand-dot">.</span>
          </span>
          <small>PAINEL DE OPERAÇÃO</small>
        </div>
        <div className="topbar-right">
          <span className="admin-badge">ACESSO RESTRITO · MFA</span>
          {user ? (
            <button
              className="secondary"
              onClick={() => {
                void api('/v1/auth/logout', { method: 'POST' }, user.csrfToken)
                  .then(() => setUser(null))
                  .catch((e) => setError(e.message));
              }}
            >
              <LogOut size={14} />
              Sair
            </button>
          ) : (
            <button className="primary" onClick={() => setAuth(true)}>
              Entrar <ArrowUpRight size={14} />
            </button>
          )}
        </div>
      </header>
      {!user ? (
        <main className="admin-welcome">
          <span className="eyebrow">CENTRO DE OPERAÇÃO</span>
          <h1>
            Clareza para operar.
            <br />
            Integridade para crescer.
          </h1>
          <p>Entre com uma conta de administrador com autenticação em duas etapas.</p>
          <button className="primary" onClick={() => setAuth(true)}>
            Acessar painel <ArrowUpRight size={17} />
          </button>
          <div className="restricted-note">
            <ShieldCheck />
            Nenhuma intervenção em resultados. Cada ação, auditada.
          </div>
        </main>
      ) : user.role === 'player' ? (
        <main>
          <p className="error">
            Esta conta não tem acesso administrativo. A promoção inicial deve ser feita pelo
            responsável pela infraestrutura.
          </p>
        </main>
      ) : !user.mfaEnabled ? (
        <main>
          <Account user={user} onUpdate={refreshUser} tab="profile" />
        </main>
      ) : (
        <div className="shell">
          <aside className="sidebar">
            <div className="sidebar-label">CENTRO DE OPERAÇÃO</div>
            <nav>
              {[
                { id: 'dashboard', label: 'Visão geral', Icon: LayoutDashboard },
                { id: 'rooms', label: 'Salas e rodadas', Icon: Radio },
                { id: 'users', label: 'Usuários', Icon: Users },
                { id: 'audit', label: 'Auditoria', Icon: ScrollText },
                { id: 'operations', label: 'Operação e suporte', Icon: ShieldCheck },
                ...(['superadmin', 'finance', 'auditor'].includes(user.role)
                  ? [{ id: 'finance', label: 'Financeiro', Icon: ShieldCheck }]
                  : []),
              ].map(({ id, label, Icon }) => (
                <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>
                  <Icon size={17} />
                  {label}
                </button>
              ))}
            </nav>
            <div className="sidebar-note">
              <ShieldCheck className="gold" />
              <h3>Operação transparente.</h3>
              <p>
                Resultados imutáveis.
                <br />
                Créditos conciliados.
                <br />
                Ações rastreáveis.
              </p>
            </div>
          </aside>
          <main>
            <div className="section-heading">
              <div>
                <span className="eyebrow">PAINEL DE OPERAÇÃO</span>
                <h1>
                  {
                    (
                      {
                        dashboard: 'Tudo sob controle.',
                        rooms: 'Cada rodada, em detalhe.',
                        users: 'Pessoas no centro.',
                        audit: 'Uma trilha que permanece.',
                        finance: 'Cada ajuste, conferido.',
                        operations: 'Serviços e equipe.',
                      } as Record<string, string>
                    )[tab]
                  }
                </h1>
              </div>
              <button className="secondary" onClick={() => void refresh()}>
                <RefreshCw size={14} />
                Atualizar
              </button>
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {success && (
              <p role="status" className="success">
                {success}
              </p>
            )}
            {tab === 'dashboard' && (
              <>
                <div className="admin-stats">
                  {[
                    { label: 'USUÁRIOS CADASTRADOS', value: summary?.users },
                    { label: 'RODADAS AO VIVO', value: summary?.live },
                    { label: 'CARTELAS VENDIDAS', value: summary?.cards },
                    {
                      label: 'PRÊMIOS EM CRÉDITOS',
                      value: summary ? credits(summary.prizes) : undefined,
                    },
                  ].map((s) => (
                    <div key={s.label}>
                      <span>{s.label}</span>
                      <strong>{s.value ?? '—'}</strong>
                    </div>
                  ))}
                </div>
                <section className="table-panel reconciliation">
                  <div>
                    <h2>Integridade contábil</h2>
                    <p>Compare o saldo das carteiras com os lançamentos do razão.</p>
                    <span>
                      Saldo total: {summary ? credits(summary.balances) : '—'} créditos · Outbox
                      pendente: {summary?.pending_events ?? '—'}
                    </span>
                  </div>
                  <button className="primary" disabled={busy} onClick={reconcile}>
                    <ShieldCheck size={15} />
                    {busy ? 'Conciliando…' : 'Executar conciliação'}
                  </button>
                </section>
              </>
            )}
            {(tab === 'dashboard' || tab === 'rooms') && (
              <section className="table-panel">
                <div className="section-title">
                  <h2>{tab === 'dashboard' ? 'Rodadas recentes' : 'Todas as rodadas'}</h2>
                  <button
                    className="secondary"
                    onClick={() => {
                      setCreating(!creating);
                      setTab('rooms');
                    }}
                  >
                    <Plus size={15} />
                    Nova sala
                  </button>
                </div>
                {creating && (
                  <form className="room-form" onSubmit={create}>
                    <label>
                      Nome da sala
                      <input
                        name="name"
                        minLength={3}
                        maxLength={70}
                        required
                        placeholder="Encontro de demonstração"
                      />
                    </label>
                    <label>
                      Modalidade
                      <select name="variant">
                        <option value="75">75 bolas</option>
                        <option value="80">80 bolas</option>
                        <option value="90">90 bolas</option>
                      </select>
                    </label>
                    <label>
                      Preço em créditos inteiros
                      <input
                        name="price"
                        type="number"
                        min="1"
                        max="1000"
                        defaultValue="5"
                        required
                      />
                    </label>
                    <label>
                      Vendas abertas por (segundos)
                      <input
                        name="seconds"
                        type="number"
                        min="15"
                        max="86400"
                        defaultValue="120"
                        required
                      />
                    </label>
                    <label>
                      Mínimo de participantes
                      <input
                        name="minimum"
                        type="number"
                        min="1"
                        max="100"
                        defaultValue="1"
                        required
                      />
                    </label>
                    <label>
                      Abrir após (segundos)
                      <input
                        name="starts"
                        type="number"
                        min="0"
                        max="604800"
                        defaultValue="0"
                        required
                      />
                    </label>
                    <label>
                      Padrão (75/80 bolas)
                      <select name="pattern">
                        <option value="full">Cartela cheia</option>
                        <option value="line">Linha</option>
                        <option value="column">Coluna</option>
                        <option value="diagonal">Diagonal</option>
                        <option value="corners">Quatro cantos</option>
                        <option value="x">X (75 bolas)</option>
                        <option value="l">L (75 bolas)</option>
                      </select>
                    </label>
                    <label>
                      Política de prêmio
                      <select name="policy">
                        <option value="proportional">85% das compras</option>
                        <option value="fixed">Prêmio fixo com reserva</option>
                      </select>
                    </label>
                    <label>
                      Prêmio fixo (créditos inteiros)
                      <input name="fixedPrize" type="number" min="1" defaultValue="1000" required />
                    </label>
                    <label className="checkbox">
                      <input type="checkbox" name="recurring" />
                      Criar recorrência
                    </label>
                    <label>
                      Intervalo da recorrência (segundos)
                      <input
                        name="interval"
                        type="number"
                        min="60"
                        max="604800"
                        defaultValue="300"
                        required
                      />
                    </label>
                    <p>
                      Fundo proporcional: 85% por compra. Até 24 cartelas por pessoa. Intervalo: 4
                      segundos. Mínimo: 1 participante. 75/80: cartela cheia. 90: linha 20%, duas
                      linhas 30%, cheia 50%. Dados e créditos de demonstração.
                    </p>
                    <button className="primary" disabled={busy}>
                      {busy ? 'Abrindo…' : 'Publicar e abrir inscrições'}
                    </button>
                  </form>
                )}
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Sala</th>
                        <th>Modalidade</th>
                        <th>Status</th>
                        <th>Participantes</th>
                        <th>Cartelas</th>
                        <th>Fundo atual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rooms.map((r) => (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td>{r.variant} bolas</td>
                          <td>
                            <span className="tag">{stateLabel(r.state)}</span>
                          </td>
                          <td>{r.players}</td>
                          <td>{r.cards}</td>
                          <td>{credits(r.prize)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!rooms.length && <p>Nenhuma rodada criada.</p>}
                </div>
              </section>
            )}
            {tab === 'users' && (
              <section className="table-panel">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const next = query.trim();
                    if (next === userSearch && userOffset === 0) void refresh();
                    else {
                      setUserSearch(next);
                      setUserOffset(0);
                    }
                  }}
                >
                  <label>
                    Buscar por e-mail ou ID
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      maxLength={254}
                      placeholder="E-mail ou ID do usuário"
                    />
                  </label>
                  <button className="secondary" disabled={usersLoading}>
                    Buscar usuários
                  </button>
                </form>
                <p role="status">
                  {usersLoading
                    ? 'Buscando usuários…'
                    : `Página ${userOffset / 100 + 1} · ${users.length} usuários nesta página`}
                </p>
                <button
                  className="secondary"
                  disabled={usersLoading || userOffset === 0}
                  onClick={() => setUserOffset((value) => Math.max(0, value - 100))}
                >
                  Página anterior
                </button>
                <button
                  className="secondary"
                  disabled={usersLoading || users.length < 100}
                  onClick={() => setUserOffset((value) => value + 100)}
                >
                  Próxima página
                </button>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>E-mail</th>
                        <th>Papel</th>
                        <th>Verificação</th>
                        <th>Estado</th>
                        <th>Créditos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!usersLoading && users.length === 0 && (
                        <tr>
                          <td colSpan={5}>Nenhum usuário encontrado.</td>
                        </tr>
                      )}
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td>
                            {u.email}
                            <small className="hash-value">{u.id}</small>
                          </td>
                          <td>{u.role}</td>
                          <td>{u.email_verified ? 'Confirmado' : 'Pendente'}</td>
                          <td>{u.blocked ? 'Bloqueado' : 'Ativo'}</td>
                          <td>{credits(u.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {tab === 'finance' && <Finance user={user} />}
            {tab === 'operations' && (
              <Operations user={user} rooms={rooms} users={users} onChange={refresh} />
            )}
            {tab === 'audit' && (
              <section className="table-panel">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Ação</th>
                        <th>Referência</th>
                        <th>Ator</th>
                        <th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map((a) => (
                        <tr key={a.id}>
                          <td>{a.action}</td>
                          <td>{a.subject}</td>
                          <td>{a.actor_id ?? 'Sistema'}</td>
                          <td>
                            {new Date(a.created_at).toLocaleString('pt-BR', {
                              timeZone: 'America/Sao_Paulo',
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </main>
        </div>
      )}
      {auth && (
        <Auth
          onClose={() => setAuth(false)}
          onSuccess={() => {
            setAuth(false);
            refreshUser();
          }}
        />
      )}
    </>
  );
}
