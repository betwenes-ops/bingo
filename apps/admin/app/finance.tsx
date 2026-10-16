'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, credits, stateLabel, type User } from '../../web/lib/api';
type Adjustment = {
  id: string;
  requested_by: string;
  target_email: string | null;
  requester_email: string;
  amount: string;
  reason: string;
  status: string;
};
export function Finance({ user }: { user: User }) {
  const [items, setItems] = useState<Adjustment[]>([]);
  const [treasury, setTreasury] = useState<{
    accounts: { id: string; kind: string; reference: string | null; balance: string }[];
    reservations: { id: string; name: string; amount: string; status: string }[];
  }>({ accounts: [], reservations: [] });
  const [daily, setDaily] = useState<
    { day: string; kind: string; transactions: number; volume: string }[]
  >([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [items, funds, reports] = await Promise.all([
        api<Adjustment[]>('/v1/admin/adjustments'),
        api<typeof treasury>('/v1/admin/treasury'),
        api<{ daily: typeof daily }>('/v1/admin/reports'),
      ]);
      setItems(items);
      setTreasury(funds);
      setDaily(reports.daily);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await api(
        '/v1/admin/adjustments',
        {
          method: 'POST',
          body: JSON.stringify({
            userId: String(f.get('userId')).trim() || null,
            amount: (BigInt(String(f.get('amount'))) * 100n).toString(),
            reason: f.get('reason'),
          }),
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
  async function decide(id: string, approve: boolean, reason: string) {
    setBusy(true);
    setError('');
    try {
      await api(
        `/v1/admin/adjustments/${id}/decision`,
        { method: 'POST', body: JSON.stringify({ approve, reason }) },
        user.csrfToken,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const canWrite = ['superadmin', 'finance'].includes(user.role);
  return (
    <>
      <section className="table-panel">
        <h2>Fundos e reservas</h2>
        <p>
          A conta promocional registra a origem dos créditos fictícios; seu saldo negativo não
          representa dívida monetária.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Conta</th>
                <th>Saldo em créditos</th>
              </tr>
            </thead>
            <tbody>
              {treasury.accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.reference ?? a.kind}</td>
                  <td>{credits(a.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Reservas de prêmio fixo</h3>
        <ul>
          {treasury.reservations.map((r) => (
            <li key={r.id}>
              {r.name} · {credits(r.amount)} créditos · {stateLabel(r.status)}
            </li>
          ))}
        </ul>
        <h3>Movimentações diárias</h3>
        <a className="secondary" href="/api/v1/admin/reports.csv" download>
          Exportar relatório CSV
        </a>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Operação</th>
                <th>Transações</th>
                <th>Movimentação em créditos</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((r) => (
                <tr key={`${r.day}:${r.kind}`}>
                  <td>{r.day}</td>
                  <td>{r.kind}</td>
                  <td>{r.transactions}</td>
                  <td>{credits(r.volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="table-panel">
        <h2>Ajustes de créditos fictícios</h2>
        <p>
          Uma pessoa solicita; outra confere e decide. O histórico permanece no razão e na
          auditoria. Campo de usuário vazio destina créditos ao fundo de demonstração.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {canWrite && (
          <form className="room-form" onSubmit={submit}>
            <label>
              UUID do usuário (opcional)
              <input name="userId" placeholder="Vazio: fundo de demonstração" />
            </label>
            <label>
              Créditos inteiros (negativo para débito)
              <input
                name="amount"
                type="number"
                step="1"
                min="-100000000"
                max="100000000"
                required
              />
            </label>
            <label>
              Motivo auditável
              <input name="reason" minLength={5} maxLength={500} required />
            </label>
            <button className="primary" disabled={busy}>
              Solicitar ajuste
            </button>
          </form>
        )}
        <button className="secondary" disabled={busy} onClick={() => void load()}>
          Atualizar solicitações
        </button>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Destino</th>
                <th>Créditos</th>
                <th>Solicitante</th>
                <th>Motivo</th>
                <th>Estado / decisão</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>{a.target_email ?? 'Fundo de demonstração'}</td>
                  <td>{credits(a.amount)}</td>
                  <td>{a.requester_email}</td>
                  <td>{a.reason}</td>
                  <td>
                    {stateLabel(a.status)}
                    {a.status === 'PENDING' && a.requested_by !== user.id && canWrite && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void decide(
                            a.id,
                            f.get('decision') === 'approve',
                            String(f.get('reason')),
                          );
                        }}
                      >
                        <label>
                          Justificativa da decisão
                          <input name="reason" minLength={5} maxLength={500} required />
                        </label>
                        <label>
                          Decisão
                          <select name="decision">
                            <option value="reject">Rejeitar</option>
                            <option value="approve">Aprovar</option>
                          </select>
                        </label>
                        <button className="secondary" disabled={busy}>
                          Registrar decisão
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && <p>Nenhuma solicitação.</p>}
        </div>
      </section>
    </>
  );
}
