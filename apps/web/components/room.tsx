'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, ShieldCheck, Wifi, Plus, Minus, Layers, Box, Check } from 'lucide-react';
import { verifyDraw, sha256 } from '../lib/verifier';
import {
  api,
  credits,
  stateLabel,
  patternNames,
  type Snapshot,
  type User,
  type Room as RoomType,
} from '../lib/api';
const Globe = dynamic(() => import('./globe'), {
  ssr: false,
  loading: () => <div className="globe-placeholder">Preparando o globo…</div>,
});
export function Room({
  room,
  user,
  onBack,
  onBalance,
}: {
  room: RoomType;
  user: User;
  onBack: () => void;
  onBalance: () => void;
}) {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [quantity, setQuantity] = useState(1),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false),
    [three, setThree] = useState(false),
    [verification, setVerification] = useState('');
  const key = useRef<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<Snapshot>(`/v1/rounds/${room.id}`));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [room.id]);
  useEffect(() => {
    void load();
    let stopped = false,
      socket: WebSocket | undefined,
      timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 500;
    const connect = () => {
      if (stopped) return;
      const base =
        process.env.NEXT_PUBLIC_WS_URL ??
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/v1/realtime`;
      socket = new WebSocket(`${base}?roundId=${room.id}&lastSeq=0`);
      socket.onopen = () => {
        setConnected(true);
        delay = 500;
        void load();
      };
      let refreshing = false;
      socket.onmessage = () => {
        if (refreshing) return;
        refreshing = true;
        void load().finally(() => {
          refreshing = false;
        });
        onBalance();
      };
      socket.onclose = () => {
        setConnected(false);
        if (!stopped) {
          timer = setTimeout(connect, delay);
          delay = Math.min(delay * 2, 15000);
        }
      };
    };
    connect();
    const polling = setInterval(() => void load(), 5000);
    return () => {
      stopped = true;
      clearInterval(polling);
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [room.id, load, onBalance]);
  async function buy() {
    setBusy(true);
    setError('');
    key.current ??= crypto.randomUUID();
    try {
      await api(
        `/v1/rounds/${room.id}/purchases`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': key.current },
          body: JSON.stringify({ quantity }),
        },
        user.csrfToken,
      );
      key.current = null;
      await load();
      onBalance();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    try {
      const p = await api<{
        serverSeed: string;
        commitment: string;
        context: string;
        variant: number;
        drawn: number[];
        manifest: unknown;
        manifestHash: string;
      }>(`/v1/rounds/${room.id}/proof`);
      const valid =
        (await verifyDraw(p)) && (await sha256(JSON.stringify(p.manifest))) === p.manifestHash;
      setVerification(
        valid
          ? `Verificada. Compromisso e sequência conferem. Seed: ${p.serverSeed}`
          : 'A prova apresentou divergência.',
      );
    } catch (e) {
      setVerification((e as Error).message);
    }
  }
  const balls = data?.balls.map((b) => b.number) ?? [],
    latest = balls.at(-1),
    r = data?.round ?? room;
  return (
    <>
      <div className="room-top">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={16} /> Todas as salas
        </button>
        <span className={connected ? 'connection' : 'connection offline'}>
          <Wifi size={14} />
          {connected ? 'Conectado' : 'Reconectando…'}
        </span>
      </div>
      <div className="room-heading">
        <div>
          <span className="eyebrow">
            BINGO {r.variant} · {stateLabel(r.state)}
          </span>
          <h1>{r.name}</h1>
        </div>
        <button className="secondary" onClick={() => setThree(!three)}>
          <Box size={16} />
          {three ? 'Visual 2D' : 'Ativar globo 3D'}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="game-layout">
        <section className="draw-panel">
          {three ? (
            <Globe active={r.state === 'DRAWING'} />
          ) : (
            <div className="draw-stage">
              <div className="stage-ring" />
              <div className="main-ball" key={latest ?? 'waiting'}>
                <small>
                  {latest
                    ? (['B', 'I', 'N', 'G', 'O'][Math.floor((latest - 1) / 15)] ?? 'BINGO')
                    : 'BINGO'}
                </small>
                <strong>{latest ?? '—'}</strong>
              </div>
              <span className="stage-caption">
                {latest ? 'ÚLTIMA BOLA SORTEADA' : 'AGUARDANDO A PRÓXIMA RODADA'}
              </span>
            </div>
          )}
          <div className="last-balls" aria-live="polite" aria-atomic="true">
            <span>Últimas bolas</span>
            {balls
              .slice(-6)
              .reverse()
              .map((n, i) => (
                <b className={i === 0 ? 'fresh' : ''} key={n}>
                  {n}
                </b>
              ))}
            {!balls.length && <small>O sorteio ainda não começou</small>}
          </div>
          <div className="ball-board">
            {Array.from({ length: r.variant }, (_, i) => (
              <span key={i} className={balls.includes(i + 1) ? 'hit' : ''}>
                {i + 1}
              </span>
            ))}
          </div>
          <div className="fair-strip">
            <ShieldCheck size={17} />
            <span>Resultado decidido no servidor. Sorteio verificável.</span>
          </div>
        </section>
        <aside className="cards-panel">
          <div className="section-title">
            <h2>Suas cartelas</h2>
            <span>
              {data?.cards.length ?? 0} / {r.max_cards}
            </span>
          </div>
          {r.state === 'OPEN_FOR_SALES' && (
            <div className="purchase-box">
              <div>
                <span>Por cartela</span>
                <strong>
                  {credits(r.price)} <small>créditos</small>
                </strong>
              </div>
              <div className="stepper">
                <button
                  aria-label="Diminuir quantidade"
                  disabled={busy || quantity === 1}
                  onClick={() => {
                    setQuantity((q) => q - 1);
                    key.current = null;
                  }}
                >
                  <Minus size={15} />
                </button>
                <b>{quantity}</b>
                <button
                  aria-label="Aumentar quantidade"
                  disabled={busy || quantity >= r.max_cards - (data?.cards.length ?? 0)}
                  onClick={() => {
                    setQuantity((q) => q + 1);
                    key.current = null;
                  }}
                >
                  <Plus size={15} />
                </button>
              </div>
              <button
                className="primary wide"
                onClick={buy}
                disabled={busy || (data?.cards.length ?? 0) >= r.max_cards}
              >
                {busy
                  ? 'Confirmando…'
                  : `Comprar · ${credits((BigInt(r.price) * BigInt(quantity)).toString())} créditos`}
              </button>
              <small>
                Prêmios: {r.prize_bps / 100}% de cada compra, arredondados para baixo ao centésimo
                de crédito. Empates dividem o prêmio.
              </small>
            </div>
          )}
          {!data?.cards.length && (
            <div className="empty-cards">
              <Layers size={30} />
              <h3>Seu jogo começa aqui</h3>
              <p>Compre uma cartela enquanto as inscrições estiverem abertas.</p>
            </div>
          )}
          <div className="card-list">
            {data?.cards.map((c, index) => (
              <article className="bingo-card" key={c.id}>
                <div className="card-label">
                  CARTELA {String(index + 1).padStart(2, '0')}
                  <span>{c.id.slice(0, 8)}</span>
                </div>
                {c.card.variant === 75 && (
                  <div className="bingo-letters">
                    {'BINGO'.split('').map((l) => (
                      <b key={l}>{l}</b>
                    ))}
                  </div>
                )}
                <div className={`numbers variant-${c.card.variant}`}>
                  {c.card.rows.flatMap((row, ri) =>
                    row.map((n, ci) => (
                      <span
                        key={`${ri}:${ci}`}
                        className={n === null ? 'free' : balls.includes(n) ? 'marked' : ''}
                      >
                        {n === null ? c.card.variant === 75 ? <Check size={16} /> : null : n}
                      </span>
                    )),
                  )}
                </div>
                {data.awards
                  .filter((a) => a.card_id === c.id)
                  .map((a) => (
                    <div className="award" key={a.pattern}>
                      {patternNames[a.pattern]} · +{credits(a.amount)} créditos
                    </div>
                  ))}
              </article>
            ))}
          </div>
        </aside>
      </div>
      <section className="proof-panel">
        <h3>
          <ShieldCheck size={18} /> Transparência em cada rodada
        </h3>
        <p>Compromisso publicado antes das vendas</p>
        <code>{r.commitment}</code>
        <p>
          Padrões:{' '}
          {r.rules.patterns
            .map((p) => `${patternNames[p.pattern] ?? p.pattern} (${p.bps / 100}% do fundo)`)
            .join(' · ')}
        </p>
        <button className="secondary" disabled={r.state !== 'COMPLETED'} onClick={verify}>
          Verificar resultado
        </button>
        {verification && (
          <p className="proof-result" role="status">
            {verification}
          </p>
        )}
      </section>
    </>
  );
}
