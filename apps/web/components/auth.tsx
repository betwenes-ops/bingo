'use client';
import { useState, useEffect, useRef } from 'react';
import { X, ArrowRight, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { Turnstile } from './turnstile';
export function Auth({
  onClose,
  onSuccess,
  resetToken,
}: {
  onClose: () => void;
  onSuccess: () => void;
  resetToken?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  const [security, setSecurity] = useState<{
    required: boolean;
    siteKey: string | null;
    ready: boolean;
  } | null>(null);
  const [securityError, setSecurityError] = useState(false);
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void fetch('/api/security-config', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json() as Promise<{ required: boolean; siteKey: string | null; ready: boolean }>;
      })
      .then((config) => {
        if (active) setSecurity(config);
      })
      .catch(() => {
        if (active) setSecurityError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(
    resetToken ? 'reset' : 'login',
  );
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [totp, setTotp] = useState(''),
    [token, setToken] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'reset') {
        await api('/v1/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: resetToken, password }),
        });
        setMode('login');
        setMessage('Senha atualizada. Entre com a nova senha.');
      } else if (mode === 'forgot') {
        const r = await api<{ message: string }>('/v1/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email, turnstileToken: token }),
        });
        setMessage(r.message);
      } else {
        const r = await api<{ message?: string }>(`/v1/auth/${mode}`, {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            turnstileToken: token,
            ...(totp ? { totp } : {}),
          }),
        });
        if (mode === 'login') onSuccess();
        else setMessage(r.message ?? 'Confira sua caixa de entrada para confirmar seu e-mail.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setToken('');
      setCaptchaAttempt((value) => value + 1);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="auth-title"
      className="overlay"
      onCancel={onClose}
      onClick={onClose}
    >
      <section className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon close" onClick={onClose} aria-label="Fechar">
          <X size={20} />
        </button>
        <span className="eyebrow">
          <ShieldCheck size={15} /> SEU PRÓXIMO ENCONTRO COMEÇA AQUI
        </span>
        <h2 id="auth-title">
          {mode === 'login'
            ? 'Bom ter você de volta.'
            : mode === 'register'
              ? 'Seu lugar está reservado.'
              : mode === 'reset'
                ? 'Uma nova senha.'
                : 'Vamos recuperar seu acesso.'}
        </h2>
        <p>Uma conta. Muitas rodadas para compartilhar.</p>
        <form onSubmit={submit}>
          {mode !== 'reset' && (
            <label>
              E-mail
              <input
                autoFocus
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {mode !== 'forgot' && (
            <label>
              Senha <small>Mínimo de 12 caracteres</small>
              <input
                autoFocus={mode === 'reset'}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={12}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {mode === 'login' && (
            <label>
              Código do autenticador <small>Se você ativou MFA</small>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
              />
            </label>
          )}
          {mode !== 'reset' && security?.required && security.siteKey && (
            <Turnstile
              key={`${mode}-${captchaAttempt}`}
              siteKey={security.siteKey}
              onToken={setToken}
            />
          )}
          {mode !== 'reset' && (securityError || security?.ready === false) && (
            <p className="error" role="alert">
              O acesso está temporariamente em configuração. A verificação de segurança precisa ser
              concluída pelo responsável pela plataforma.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="success" role="status">
              {message}
            </p>
          )}
          <button
            className="primary wide"
            disabled={
              busy || (mode !== 'reset' && (!security?.ready || (security.required && !token)))
            }
          >
            {busy
              ? 'Só um instante…'
              : mode === 'login'
                ? 'Entrar'
                : mode === 'register'
                  ? 'Criar minha conta'
                  : mode === 'reset'
                    ? 'Salvar nova senha'
                    : 'Enviar instruções'}
            <ArrowRight size={18} />
          </button>
        </form>
        <div className="auth-switch">
          {mode === 'login' ? (
            <>
              <button
                onClick={() => {
                  setMode('register');
                  setError('');
                  setMessage('');
                }}
              >
                Criar conta
              </button>
              <button onClick={() => setMode('forgot')}>Esqueci minha senha</button>
            </>
          ) : (
            <button
              onClick={() => {
                setMode('login');
                setError('');
                setMessage('');
              }}
            >
              Voltar para entrar
            </button>
          )}
        </div>
        <div className="fineprint">
          DEMONSTRAÇÃO — créditos fictícios sem valor monetário. Sem depósitos ou saques.
        </div>
      </section>
    </dialog>
  );
}
