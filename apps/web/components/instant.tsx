'use client';
import type { Card } from '@bingo/domain';
import { useState, useEffect, useRef } from 'react';
import { Check, ShieldCheck, ArrowRight, RotateCcw } from 'lucide-react';
import { api, credits, type User } from '../lib/api';
import { verifyInstant } from '../lib/verifier';
type Game = {
  version: string;
  draws: number;
  stakes: string[];
  payoutBps: Record<string, number>;
  rtpByStake: { stake: string; rtp: number }[];
  probabilities: { multiplierBps: number; probability: number }[];
};
type Result = {
  id: string;
  version: string;
  card: Card;
  drawn: number[];
  payout: string;
  stake: string;
  pattern: string | null;
  serverSeed: string;
  commitment: string;
  context: string;
};
const names: Record<string, string> = {
  line: 'Linha',
  column: 'Coluna',
  diagonal: 'Diagonal',
  corners: 'Quatro cantos',
  x: 'X',
  full: 'Cartela cheia',
};
export function Instant({ user, onBalance }: { user: User; onBalance: () => void }) {
  const [game, setGame] = useState<Game | null>(null),
    [stake, setStake] = useState('100'),
    [commit, setCommit] = useState<{ id: string; commitment: string } | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revealed, setRevealed] = useState(0),
    [verification, setVerification] = useState('');
  const request = useRef<{ clientSeed: string; key: string } | null>(null);
  useEffect(() => {
    api<Game>('/v1/instant/game')
      .then(setGame)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!result) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(30);
      return;
    }
    const t = setInterval(
      () =>
        setRevealed((n) => {
          if (n >= 29) clearInterval(t);
          return Math.min(30, n + 1);
        }),
      140,
    );
    return () => clearInterval(t);
  }, [result]);
  async function prepare() {
    setBusy(true);
    setError('');
    try {
      setCommit(await api('/v1/instant/commit', { method: 'POST' }, user.csrfToken));
      request.current = { clientSeed: crypto.randomUUID(), key: crypto.randomUUID() };
      setResult(null);
      setRevealed(0);
      setVerification('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function play() {
    if (!commit || !request.current) return;
    setBusy(true);
    setError('');
    try {
      const r = await api<Result>(
        '/v1/instant/play',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': request.current.key },
          body: JSON.stringify({
            commitmentId: commit.id,
            clientSeed: request.current.clientSeed,
            stake,
          }),
        },
        user.csrfToken,
      );
      setResult(r);
      setCommit(null);
      onBalance();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (!result) return;
    try {
      setVerification(
        game && (await verifyInstant(result, game.payoutBps))
          ? 'Compromisso, cartela, pagamento e 30 bolas verificados neste navegador.'
          : 'A prova apresentou uma divergência.',
      );
    } catch {
      setVerification('Não foi possível verificar neste navegador.');
    }
  }
  const balls = result?.drawn.slice(0, revealed) ?? [],
    done = revealed === 30;
  return (
    <>
      <span className="eyebrow">BINGO INDIVIDUAL · 75 BOLAS</span>
      <h1>Sua cartela. Seu momento.</h1>
      <p>
        Uma cartela, 30 bolas e uma tabela de pagamentos publicada. Sem espera por outros
        participantes.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="game-layout instant-layout">
        <section className="draw-panel">
          <div className="instant-top">
            <span className="tag">INSTANT BINGO 75</span>
            <span>{game?.version ?? 'Carregando…'}</span>
          </div>
          <div className="draw-stage">
            <div className="stage-ring" />
            <div className="main-ball" key={balls.at(-1) ?? 'instant'}>
              <small>{done ? 'RESULTADO' : 'BINGO'}</small>
              <strong>{balls.at(-1) ?? '—'}</strong>
            </div>
            <span className="stage-caption">
              {result ? `${revealed} DE 30 BOLAS REVELADAS` : 'PREPARE SEU SORTEIO'}
            </span>
          </div>
          <div className="instant-balls" aria-live="polite">
            {balls.map((n) => (
              <b key={n}>{n}</b>
            ))}
          </div>
          {result && (
            <div className="instant-card">
              <div className="bingo-letters">
                {'BINGO'.split('').map((l) => (
                  <b key={l}>{l}</b>
                ))}
              </div>
              <div className="numbers">
                {result.card.rows.flatMap((r, ri) =>
                  r.map((n, ci) => (
                    <span
                      key={`${ri}:${ci}`}
                      className={n === null ? 'free' : balls.includes(n) ? 'marked' : ''}
                    >
                      {n === null ? <Check size={17} /> : n}
                    </span>
                  )),
                )}
              </div>
            </div>
          )}
          {result && !done && (
            <button className="text-button skip" onClick={() => setRevealed(30)}>
              Exibir resultado completo
            </button>
          )}
          {result && done && (
            <div
              className={`instant-result ${BigInt(result.payout) > 0 ? 'won' : ''}`}
              role="status"
            >
              <h2>
                {BigInt(result.payout) > 0
                  ? `+${credits(result.payout)} créditos`
                  : 'Sem prêmio nesta partida'}
              </h2>
              <p>
                {result.pattern
                  ? names[result.pattern]
                  : `Participação: ${credits(result.stake)} créditos`}
                . O resultado já foi contabilizado antes da animação.
              </p>
              <button className="secondary" onClick={verify}>
                <ShieldCheck size={16} />
                Verificar neste navegador
              </button>
              {verification && <p>{verification}</p>}
            </div>
          )}
        </section>
        <aside>
          <section className="table-panel">
            <h2>Prepare sua partida</h2>
            <label>
              Participação em créditos
              <select
                value={stake}
                disabled={busy || commit !== null || (!!result && !done)}
                onChange={(e) => setStake(e.target.value)}
              >
                {(game?.stakes ?? ['100']).map((s) => (
                  <option key={s} value={s}>
                    {credits(s)} créditos
                  </option>
                ))}
              </select>
            </label>
            <p>
              RTP teórico para esta participação:{' '}
              <strong className="gold">
                {((game?.rtpByStake.find((s) => s.stake === stake)?.rtp ?? 0) * 100).toFixed(3)}%
              </strong>
            </p>
            <p>
              O RTP descreve uma média matemática de longo prazo, sem garantir retorno em uma
              partida ou sessão.
            </p>
            {commit ? (
              <>
                <div className="commit-box">
                  <small>COMPROMISSO PUBLICADO ANTES DA PARTICIPAÇÃO</small>
                  <code>{commit.commitment}</code>
                </div>
                <button className="primary wide" disabled={busy} onClick={play}>
                  {busy ? 'Confirmando…' : `Confirmar · ${credits(stake)} créditos`}
                  <ArrowRight size={16} />
                </button>
              </>
            ) : (
              <button
                className="primary wide"
                disabled={busy || !game || (!!result && !done)}
                onClick={prepare}
              >
                {busy ? 'Preparando…' : result ? 'Preparar nova partida' : 'Preparar sorteio'}
                {result ? <RotateCcw size={16} /> : <ArrowRight size={16} />}
              </button>
            )}
            <small className="instant-disclaimer">
              Sem depósitos ou saques. Créditos fictícios sem valor monetário.
            </small>
          </section>
          <section className="table-panel">
            <h2>Tabela de pagamentos</h2>
            <p>
              Paga somente o padrão de maior valor. O pagamento é o retorno total, incluindo a
              participação.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Padrão</th>
                  <th>Retorno</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(game?.payoutBps ?? {}).map(([p, bps]) => (
                  <tr key={p}>
                    <td>{names[p] ?? p}</td>
                    <td>{(bps / 10000).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="math-note">Valores arredondados para baixo ao centésimo de crédito.</p>
            <h3>Probabilidades por retorno</h3>
            <p>
              Classes exclusivas: quando vários padrões se completam, conta somente o maior
              pagamento.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Retorno total</th>
                  <th>Probabilidade</th>
                </tr>
              </thead>
              <tbody>
                {game?.probabilities.map((p) => (
                  <tr key={p.multiplierBps}>
                    <td>
                      {(p.multiplierBps / 10000).toLocaleString('pt-BR', {
                        maximumFractionDigits: 4,
                      })}
                      ×
                    </td>
                    <td>
                      {p.probability < 1e-8
                        ? 'Menor que 0,000001%'
                        : `${(p.probability * 100).toLocaleString('pt-BR', { maximumFractionDigits: 6 })}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </aside>
      </div>
    </>
  );
}
