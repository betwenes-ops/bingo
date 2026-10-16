'use client';
import { useEffect, useState } from 'react';
export function AppRuntime() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    if ('serviceWorker' in navigator && window.isSecureContext)
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online ? null : (
    <div className="offline-banner" role="status">
      Sem conexão. Suas cartelas permanecem no servidor; novas compras aguardam conexão.
    </div>
  );
}
