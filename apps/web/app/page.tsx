'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Layers,
  Wallet,
  ShieldCheck,
  LogOut,
  UserRound,
  Menu,
  X,
  Radio,
  Clock3,
  Users,
  SlidersHorizontal,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { DEMO_NOTICE } from '@bingo/protocol';
import { Auth } from '../components/auth';
import { Room } from '../components/room';
import { Instant } from '../components/instant';
import { Account } from '../components/account';
import { api, credits, stateLabel, type User, type Room as RoomType } from '../lib/api';
function Countdown({ date, serverOffset }: { date: string; serverOffset: number }) {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    const tick = () =>
      setSeconds(
        Math.max(0, Math.ceil((new Date(date).getTime() - Date.now() - serverOffset) / 1000)),
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [date, serverOffset]);
  return (
    <span>
      {seconds === null
        ? '…'
        : `${Math.floor(seconds / 60)
            .toString()
            .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`}
    </span>
  );
}
export default function Home() {
  const [user, setUser] = useState<User | null>(null),
    [rooms, setRooms] = useState<RoomType[]>([]),
    [selected, setSelected] = useState<RoomType | null>(null),
    [tab, setTab] = useState<'lobby' | 'wallet' | 'profile' | 'instant'>('lobby'),
    [auth, setAuth] = useState(false),
    [resetToken, setResetToken] = useState<string | undefined>(),
    [menu, setMenu] = useState(false),
    [filter, setFilter] = useState<0 | 75 | 80 | 90>(0),
    [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading'),
    [notice, setNotice] = useState(''),
    [offset, setOffset] = useState(0);
  const refreshUser = useCallback(() => {
    void api<User>('/v1/me')
      .then(setUser)
      .catch(() => setUser(null));
  }, []);
  const refreshRooms = useCallback(async () => {
    try {
      const start = Date.now();
      const result = await api<{ rooms: RoomType[]; serverTime: string }>('/v1/rooms');
      setOffset(new Date(result.serverTime).getTime() - (start + Date.now()) / 2);
      setRooms(result.rooms);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }, []);
  useEffect(() => {
    refreshUser();
    void refreshRooms();
    const timer = setInterval(() => void refreshRooms(), 5000);
    const params = new URLSearchParams(location.search);
    const verify = params.get('verify'),
      reset = params.get('reset');
    if (verify) {
      void api('/v1/auth/verify-email', { method: 'POST', body: JSON.stringify({ token: verify }) })
        .then(() => {
          setNotice(
            'E-mail confirmado. Seus 1.000 créditos fictícios já estão disponíveis. Entre para jogar.',
          );
          setAuth(true);
        })
        .catch((e) => setNotice(e.message));
      history.replaceState({}, '', '/');
    }
    if (reset) {
      setResetToken(reset);
      setAuth(true);
      history.replaceState({}, '', '/');
    }
    return () => clearInterval(timer);
  }, [refreshUser, refreshRooms]);
  async function logout() {
    if (!user) return;
    try {
      await api('/v1/auth/logout', { method: 'POST' }, user.csrfToken);
      setUser(null);
      setSelected(null);
      setTab('lobby');
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  function navigate(next: 'lobby' | 'wallet' | 'profile' | 'instant') {
    if (next !== 'lobby' && !user) {
      setAuth(true);
      return;
    }
    setTab(next);
    setSelected(null);
    setMenu(false);
  }
  function enter(room: RoomType) {
    if (!user) {
      setAuth(true);
      return;
    }
    setSelected(room);
  }
  const filtered = rooms.filter((r) => !filter || r.variant === filter);
  const open = rooms.filter((r) => r.state === 'OPEN_FOR_SALES' || r.state === 'DRAWING');
  return (
    <div className="app">
      <div className="demo-banner">
        <ShieldCheck size={13} />
        {DEMO_NOTICE}
      </div>
      <header className="topbar">
        <button
          className="mobile-menu icon"
          aria-label="Abrir navegação"
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
        <button className="brand" onClick={() => navigate('lobby')} aria-label="Bingo início">
          <span className="brand-symbol">b.</span>
          <span>
            bingo<span className="brand-dot">.</span>
          </span>
          <small>CLUBE DE ENCONTROS</small>
        </button>
        <div className="topbar-right">
          <span className="safe-top">
            <ShieldCheck size={15} /> Jogo transparente
          </span>
          {user ? (
            <>
              <button className="balance" onClick={() => navigate('wallet')}>
                <Wallet size={16} />
                <span>
                  <small>SEUS CRÉDITOS</small>
                  <b>{credits(user.balance)}</b>
                </span>
              </button>
              <button
                className="avatar"
                aria-label="Minha conta"
                onClick={() => navigate('profile')}
              >
                {user.email[0]?.toUpperCase()}
              </button>
            </>
          ) : (
            <button className="primary compact" onClick={() => setAuth(true)}>
              Entrar <ArrowUpRight size={16} />
            </button>
          )}
        </div>
      </header>
      <div className="shell">
        <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
          <div className="sidebar-label">EXPLORE O CLUBE</div>
          <nav aria-label="Principal">
            <button className={tab === 'lobby' ? 'active' : ''} onClick={() => navigate('lobby')}>
              <Layers size={18} />
              Salas de bingo<span>{open.length}</span>
            </button>
            <button
              className={tab === 'instant' ? 'active' : ''}
              onClick={() => navigate('instant')}
            >
              <Sparkles size={18} />
              Bingo individual
            </button>
            <button className={tab === 'wallet' ? 'active' : ''} onClick={() => navigate('wallet')}>
              <Wallet size={18} />
              Minha carteira
            </button>
            <button
              className={tab === 'profile' ? 'active' : ''}
              onClick={() => navigate('profile')}
            >
              <UserRound size={18} />
              Minha conta
            </button>
          </nav>
          <div className="sidebar-note">
            <span className="tiny-orbit">✦</span>
            <h3>
              O melhor do jogo
              <br />é estar junto.
            </h3>
            <p>
              Respeite seu tempo.
              <br />
              Jogue no seu ritmo.
            </p>
            <button onClick={() => navigate('profile')}>
              Seus limites <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="sidebar-bottom">
            <ShieldCheck size={18} />
            <span>
              Créditos fictícios.
              <br />
              Diversão de verdade.
            </span>
          </div>
          {user && (
            <button className="logout" onClick={logout}>
              <LogOut size={15} />
              Sair da conta
            </button>
          )}
        </aside>
        <main id="main-content">
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button className="icon" aria-label="Dispensar aviso" onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {selected && user ? (
            <Room
              room={selected}
              user={user}
              onBack={() => {
                setSelected(null);
                void refreshRooms();
              }}
              onBalance={refreshUser}
            />
          ) : tab === 'instant' && user ? (
            <Instant user={user} onBalance={refreshUser} />
          ) : (tab === 'wallet' || tab === 'profile') && user ? (
            <Account tab={tab} user={user} onUpdate={refreshUser} />
          ) : (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <span className="gold-line" /> SEU NOVO PONTO DE ENCONTRO
                  </div>
                  <h1>
                    Um número.
                    <br />
                    Mil possibilidades<span>.</span>
                  </h1>
                  <p>
                    A emoção de cada bola. A companhia de uma sala inteira.
                    <br className="desktop-break" /> Encontre seu lugar na próxima rodada.
                  </p>
                  <button
                    className="primary"
                    onClick={() =>
                      document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' })
                    }
                  >
                    Encontrar uma sala <ArrowRight size={17} />
                  </button>
                  <div className="hero-footnote">
                    <span className="live-dot" /> Bingo ao vivo · 75, 80 e 90 bolas
                  </div>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="hero-ball ball-gold">
                    <small>B</small>
                    <b>07</b>
                  </div>
                  <div className="hero-ball ball-white">
                    <small>G</small>
                    <b>56</b>
                  </div>
                  <div className="hero-ball ball-red">
                    <small>O</small>
                    <b>72</b>
                  </div>
                  <div className="art-caption">CADA RODADA, UM NOVO ENCONTRO</div>
                  <span className="art-spark s1">✦</span>
                  <span className="art-spark s2">✧</span>
                </div>
              </section>
              <div className="trust-row">
                <span>
                  <ShieldCheck size={18} />
                  Sorteios verificáveis
                </span>
                <span>
                  <Users size={18} />
                  Salas multiplayer
                </span>
                <span>
                  <Wallet size={18} />
                  Sem dinheiro real
                </span>
              </div>
              <section id="rooms" className="rooms-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">ESCOLHA SEU PRÓXIMO ENCONTRO</span>
                    <h2>
                      Uma sala espera por você<span>.</span>
                    </h2>
                  </div>
                  <span className="room-count">
                    <Radio size={15} />
                    {open.length} {open.length === 1 ? 'sala disponível' : 'salas disponíveis'}
                  </span>
                </div>
                <div className="filters">
                  <div className="filter-tabs">
                    {([0, 75, 80, 90] as const).map((n) => (
                      <button
                        key={n}
                        className={filter === n ? 'selected' : ''}
                        onClick={() => setFilter(n)}
                      >
                        {n === 0 ? 'Todas as salas' : `${n} bolas`}
                      </button>
                    ))}
                  </div>
                  <span className="filter-note">
                    <SlidersHorizontal size={15} />
                    Atualização em tempo real
                  </span>
                </div>
                {status === 'loading' ? (
                  <div className="loading-grid" aria-label="Carregando salas">
                    {[1, 2, 3].map((i) => (
                      <div className="skeleton" key={i} />
                    ))}
                  </div>
                ) : status === 'error' ? (
                  <div className="empty-state" role="alert">
                    <Radio size={28} />
                    <h3>Não conseguimos buscar as salas.</h3>
                    <p>Confira sua conexão e tente novamente.</p>
                    <button className="secondary" onClick={() => void refreshRooms()}>
                      Tentar novamente
                    </button>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="empty-state">
                    <Layers size={30} />
                    <h3>O clube está se preparando.</h3>
                    <p>
                      Nenhuma sala nesta modalidade agora. Novas rodadas aparecerão aqui quando
                      forem abertas.
                    </p>
                    <button className="secondary" onClick={() => void refreshRooms()}>
                      Atualizar salas
                    </button>
                  </div>
                ) : (
                  <div className="room-grid">
                    {filtered.map((r, i) => (
                      <article className={`room-card theme-${r.variant}`} key={r.id}>
                        <div className="room-cover">
                          <span className={`status-chip ${r.state === 'DRAWING' ? 'is-live' : ''}`}>
                            <span />
                            {stateLabel(r.state)}
                          </span>
                          <span className="variant-label">{r.variant} BOLAS</span>
                          <div className="cover-number">
                            {r.variant}
                            <span>BINGO CLUB</span>
                          </div>
                          <div className="cover-lines" />
                          <span className="cover-edition">
                            ENCONTRO Nº {String(i + 1).padStart(2, '0')}
                          </span>
                        </div>
                        <div className="room-content">
                          <h3>{r.name}</h3>
                          <div className="room-meta">
                            <span>
                              <Users size={13} />
                              {r.players} participantes
                            </span>
                            <span>
                              <Layers size={13} />
                              {r.cards} cartelas
                            </span>
                          </div>
                          <div className="prize-row">
                            <div>
                              <small>FUNDO DE PRÊMIOS ATUAL</small>
                              <strong>
                                {credits(r.prize)}
                                <span> créditos</span>
                              </strong>
                            </div>
                            <ShieldCheck size={21} />
                          </div>
                          <div className="entry-row">
                            <span>
                              Cartela <b>{credits(r.price)}</b>
                            </span>
                            <span>
                              <Clock3 size={13} />
                              {r.state === 'OPEN_FOR_SALES' ? (
                                <Countdown date={r.sales_close_at} serverOffset={offset} />
                              ) : (
                                stateLabel(r.state)
                              )}
                            </span>
                          </div>
                          <button className="room-enter" onClick={() => enter(r)}>
                            {r.state === 'OPEN_FOR_SALES'
                              ? 'Escolher minhas cartelas'
                              : r.state === 'DRAWING'
                                ? 'Acompanhar rodada'
                                : 'Ver rodada'}
                            <ArrowUpRight size={18} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <section className="how-it-works">
                <div>
                  <span className="eyebrow">
                    <Sparkles size={14} /> SIMPLES ASSIM
                  </span>
                  <h2>
                    Do primeiro número
                    <br />
                    ao último sorriso.
                  </h2>
                </div>
                <div className="steps">
                  <div>
                    <b>01</b>
                    <h3>Entre no clube</h3>
                    <p>Crie sua conta, confirme seu e-mail e receba créditos de demonstração.</p>
                  </div>
                  <ChevronRight size={18} />
                  <div>
                    <b>02</b>
                    <h3>Encontre sua sala</h3>
                    <p>Leia as regras e escolha suas cartelas antes da rodada começar.</p>
                  </div>
                  <ChevronRight size={18} />
                  <div>
                    <b>03</b>
                    <h3>Viva a rodada</h3>
                    <p>Acompanhe as bolas. O servidor marca e confere os resultados.</p>
                  </div>
                </div>
              </section>
              <footer>
                <span className="footer-brand">bingo.</span>
                <p>Um clube feito para compartilhar a emoção de cada rodada.</p>
                <span>Demonstração · Sem valor monetário</span>
              </footer>
            </>
          )}
        </main>
      </div>
      {auth && (
        <Auth
          resetToken={resetToken}
          onClose={() => {
            setAuth(false);
            setResetToken(undefined);
          }}
          onSuccess={() => {
            setAuth(false);
            setResetToken(undefined);
            refreshUser();
          }}
        />
      )}
    </div>
  );
}
