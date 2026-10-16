'use client';
import { useEffect, useRef } from 'react';
type Widget = {
  render: (
    el: HTMLElement,
    options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void },
  ) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Widget;
  }
}
export function Turnstile({ onToken }: { onToken: (value: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!key) return;
    let id: string | undefined;
    let stopped = false;
    const render = () => {
      if (!stopped && root.current && window.turnstile && !id)
        id = window.turnstile.render(root.current, {
          sitekey: key,
          callback: (t) => callback.current(t),
          'expired-callback': () => callback.current(''),
        });
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.dataset.turnstile = 'true';
      document.head.append(script);
    }
    script.addEventListener('load', render);
    render();
    return () => {
      stopped = true;
      script?.removeEventListener('load', render);
      if (id) window.turnstile?.remove(id);
    };
  }, []);
  return <div ref={root} />;
}
