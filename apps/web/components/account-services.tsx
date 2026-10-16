'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, credits, stateLabel, type User } from '../lib/api';
type Services = {
  cases: { id: string; subject: string; message: string; status: string }[];
  messages: { id: string; case_id: string; message: string }[];
};
type History = {
  rounds: { id: string; name: string; state: string; cards: number; prizes: string }[];
};
export function AccountServices({ user }: { user: User }) {
  const [support, setSupport] = useState<Services>({ cases: [], messages: [] });
  const [history, setHistory] = useState<History>({ rounds: [] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        api<Services>('/v1/me/support'),
        api<History>('/v1/me/history'),
      ]);
      setSupport(s);
      setHistory(h);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await api(
        '/v1/me/support',
        {
          method: 'POST',
          body: JSON.stringify({ subject: f.get('subject'), message: f.get('message') }),
        },
        user.csrfToken,
      );
      form.reset();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setError('');
    try {
      const data = await api('/v1/me/export');
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'meus-dados-bingo.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="table-panel">
        <h2>Seu histórico de rodadas</h2>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="secondary" onClick={() => void load()} disabled={busy}>
          Atualizar histórico e atendimento
        </button>
        {history.rounds.length ? (
          <ul>
            {history.rounds.map((r) => (
              <li key={r.id}>
                {r.name} · {stateLabel(r.state)} · {r.cards} cartelas · {credits(r.prizes)} créditos
                em prêmios
              </li>
            ))}
          </ul>
        ) : (
          <p>Você ainda não participou de uma rodada.</p>
        )}
        <button className="secondary" disabled={busy} onClick={() => void download()}>
          Baixar meus dados (JSON)
        </button>
        <p>
          O arquivo contém dados pessoais e o histórico da sua conta. Guarde-o em local privado.
        </p>
      </section>
      <section className="table-panel">
        <h2>Atendimento</h2>
        <p>Envie sua dúvida ou contestação. Não inclua senhas ou códigos de autenticação.</p>
        <form onSubmit={submit}>
          <label>
            Assunto
            <input name="subject" minLength={5} maxLength={120} required />
          </label>
          <label>
            Mensagem
            <textarea name="message" minLength={10} maxLength={4000} required />
          </label>
          <button className="primary" disabled={busy}>
            Enviar solicitação
          </button>
        </form>
        {support.cases.map((c) => (
          <article key={c.id}>
            <h3>
              {c.subject} · {c.status}
            </h3>
            <p>{c.message}</p>
            {support.messages
              .filter((m) => m.case_id === c.id)
              .map((m) => (
                <p key={m.id}>
                  <strong>Resposta: </strong>
                  {m.message}
                </p>
              ))}
          </article>
        ))}
      </section>
    </>
  );
}
