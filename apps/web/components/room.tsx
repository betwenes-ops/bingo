'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, ShieldCheck, Wifi, Plus, Minus, Layers, Box, Check } from 'lucide-react';
import { remaining, type Card, type Pattern } from '@bingo/domain';
import { eventEnvelope } from '@bingo/protocol';
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
  const cursor = useRef(0);
  const load = useCallback(async () => {
    try {
      const snapshot = await api<Snapshot>(`/v1/rounds/${room.id}`);
      cursor.current = Math.max(cursor.current, snapshot.round.event_seq);
      setData((previous) =>
        previous && previous.round.event_seq > snapshot.round.event_seq ? previous : snapshot,
      );
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [room.id]);
  useEffect(() => {
    cursor.current = 0;
    let stopped = false,
      socket: WebSocket | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      delay = 500;
    const connect = async () => {
      if (stopped) return;
      try {
        const [settings, credentials] = await Promise.all([
          fetch('/api/connection', { cache: 'no-store' }).then(async (r) => {
            if (!r.ok) throw Error('API_UNAVAILABLE');
            return r.json() as Promise<{ webSocketUrl: string }>;
          }),
          api<{ ticket: string }>(
            '/v1/realtime/ticket',
            { method: 'POST', body: JSON.stringify({ roundId: room.id }) },
            user.csrfToken,
          ),
        ]);
        if (stopped) return;
        const url = new URL(settings.webSocketUrl);
        url.searchParams.set('roundId', room.id);
        url.searchParams.set('lastSeq', String(cursor.current));
        url.searchParams.set('ticket', credentials.ticket);
        socket = new WebSocket(url);
        socket.onopen = () => {
          setConnected(true);
          delay = 500;
          void load();
        };
        socket.onmessage = (message) => {
          try {
            const event = eventEnvelope.parse(JSON.parse(String(message.data)));
            if (event.roundId !== room.id || event.seq <= cursor.current) return;
            if (event.seq !== cursor.current + 1) {
              void load();
              return;
            }
            cursor.current = event.seq;
            setData((previous) => {
              if (!previous || event.seq <= previous.round.event_seq) return previous;
              const round = { ...previous.round, event_seq: event.seq };
              if (event.type === 'STATE_CHANGED' && typeof event.payload.to === 'string')
                round.state = event.payload.to;
              if (
                event.type === 'BALL_DRAWN' &&
                typeof event.payload.number === 'number' &&
                typeof event.payload.position === 'number'
              )
                return {
                  ...previous,
                  round: { ...round, current_position: event.payload.position },
                  balls: [
                    ...previous.balls,
                    { number: event.payload.number, position: event.payload.position },
                  ],
                };
              return { ...previous, round };
            });
            if (
              ['PATTERN_COMPLETED', 'GAME_FINISHED', 'GAME_CANCELLED', 'CARD_PURCHASED'].includes(
                event.type,
              )
            ) {
              void load();
              onBalance();
            }
          } catch {
            void load();
          }
        };
        socket.onclose = () => {
          setConnected(false);
          if (!stopped) {
            timer = setTimeout(() => void connect(), delay);
            delay = Math.min(delay * 2, 15000);
          }
        };
        socket.onerror = () => socket?.close();
      } catch {
        setConnected(false);
        if (!stopped) {
          timer = setTimeout(() => void connect(), delay);
          delay = Math.min(delay * 2, 15000);
        }
      }
    };
    void load().then(() => connect());
    const polling = setInterval(() => {
      if (socket?.readyState !== WebSocket.OPEN) void load();
    }, 5000);
    const resume = () => {
      if (document.visibilityState === 'visible') {
        void load();
        if (!socket || socket.readyState === WebSocket.CLOSED) {
          if (timer) clearTimeout(timer);
          void connect();
        }
      }
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      stopped = true;
      clearInterval(polling);
      if (timer) clearTimeout(timer);
      socket?.close();
      document.removeEventListener('visibilitychange', resume);
    };
  }, [room.id, load, onBalance, user.csrfToken]);
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
                    ? r.variant === 75
                      ? (['B', 'I', 'N', 'G', 'O'][Math.floor((latest - 1) / 15)] ?? 'BINGO')
                      : 'BOLA'
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
          {r.state === 'OPEN_FOR_SALES' && !r.sales_paused && (
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
                {r.rules.policy === 'fixed'
                  ? `Prêmio fixo reservado: ${credits(r.rules.fixedPrize)} créditos.`
                  : `Prêmios: ${r.prize_bps / 100}% de cada compra, arredondados para baixo ao centésimo de crédito.`}{' '}
                Empates dividem o prêmio.
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
          {r.sales_paused && <p role="status">As vendas desta sala estão pausadas.</p>}
          <div className="card-list">
            {data?.cards.map((c, index) => (
              <article className="bingo-card" key={c.id}>
                <p className="card-proximity">
                  {Math.min(
                    ...r.rules.patterns.map((p) =>
                      remaining(c.card as Card, p.pattern as Pattern, balls),
                    ),
                  )}{' '}
                  bolas para o padrão mais próximo
                </p>
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
