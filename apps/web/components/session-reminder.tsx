'use client';
import { useEffect, useState } from 'react';
export function SessionReminder({ onLimits }: { onLimits: () => void }) {
  const [minutes, setMinutes] = useState(0),
    [dismissed, setDismissed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setMinutes(Math.floor((Date.now() - started) / 60000)), 60000);
    return () => clearInterval(timer);
  }, []);
  if (minutes - dismissed < 20) return null;
  return (
    <aside className="session-reminder" role="status">
      <p>
        Esta visita já dura {minutes} minutos. Consulte seu histórico e faça uma pausa quando
        quiser.
      </p>
      <button className="secondary" onClick={onLimits}>
        Ver meus limites
      </button>
      <button className="text-button" onClick={() => setDismissed(minutes)}>
        Fechar lembrete
      </button>
    </aside>
  );
}
