export type User = {
  id: string;
  email: string;
  role: string;
  balance: string;
  csrfToken: string;
  mfaEnabled: boolean;
};
export type Room = {
  id: string;
  name: string;
  variant: 75 | 80 | 90;
  state: string;
  price: string;
  max_cards: number;
  prize_bps: number;
  min_players: number;
  sales_close_at: string;
  commitment: string;
  players: number;
  cards: number;
  prize: string;
  current_position: number;
  rules: { patterns: { pattern: string; bps: number }[] };
};
export type CardData = { id: string; card: { variant: number; rows: (number | null)[][] } };
export type Snapshot = {
  round: Room & { event_seq: number };
  balls: { number: number; position: number }[];
  cards: CardData[];
  awards: { card_id: string; pattern: string; amount: string }[];
  serverTime: string;
};
export const messages: Record<string, string> = {
  TWO_PERSON_REQUIRED: 'Outra pessoa precisa conferir esta solicitação.',
  TREASURY_INSUFFICIENT: 'O fundo não tem créditos suficientes para reservar este prêmio.',
  SALES_PAUSED: 'As vendas estão pausadas nesta sala.',
  GAME_UNAVAILABLE: 'Esta modalidade está temporariamente indisponível.',
  RATE_LIMITED: 'Muitas solicitações. Aguarde um momento e tente novamente.',
  UNAUTHENTICATED: 'Entre na sua conta para continuar.',
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  EMAIL_NOT_VERIFIED: 'Confirme seu e-mail antes de entrar.',
  MFA_REQUIRED: 'Informe o código do autenticador.',
  MFA_INVALID: 'Código do autenticador inválido ou já utilizado.',
  INSUFFICIENT_CREDITS: 'Você não tem créditos suficientes.',
  SALES_CLOSED: 'As vendas desta rodada já encerraram.',
  CARD_LIMIT: 'Limite de cartelas atingido.',
  CAPTCHA_REQUIRED: 'Conclua a verificação de segurança.',
  TOKEN_INVALID: 'Este link expirou ou já foi utilizado.',
  DAILY_LIMIT: 'Seu limite diário foi atingido.',
  PARTICIPATION_PAUSED: 'Sua participação está pausada ou excluída.',
  ADMIN_FORBIDDEN: 'Acesso restrito. O administrador precisa ter MFA ativo.',
  LIMIT_INCREASE_REQUIRES_COOLDOWN: 'O limite só pode ser reduzido nesta versão.',
  NETWORK: 'Não foi possível conectar. Tente novamente.',
};
export async function api<T>(path: string, options: RequestInit = {}, csrf?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(messages.NETWORK);
  }
  const data = await response.json();
  if (!response.ok)
    throw new Error(messages[data.code as string] ?? 'Não foi possível concluir esta ação.');
  return data as T;
}
export function credits(value: string | undefined): string {
  const signed = BigInt(value ?? '0');
  const n = signed < 0n ? -signed : signed;
  return `${signed < 0n ? '-' : ''}${(n / 100n).toLocaleString('pt-BR')},${(n % 100n).toString().padStart(2, '0')}`;
}
export function stateLabel(state: string) {
  return (
    (
      {
        OPEN_FOR_SALES: 'Inscrições abertas',
        CREATED: 'Criada',
        SCHEDULED: 'Agendada',
        SALES_CLOSED: 'Vendas encerradas',
        READY: 'Preparada',
        VERIFYING: 'Verificando',
        SETTLING: 'Creditando prêmios',
        FAILED: 'Falha operacional',
        DRAWING: 'Ao vivo',
        COMPLETED: 'Concluída',
        CANCELLED: 'Cancelada',
      } as Record<string, string>
    )[state] ?? state
  );
}
export const patternNames: Record<string, string> = {
  full: 'Cartela cheia',
  line: 'Uma linha',
  'two-lines': 'Duas linhas',
};
