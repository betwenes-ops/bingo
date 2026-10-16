import { z } from 'zod';
export const credits = z.string().regex(/^\d{1,16}$/);
export const credentials = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(128),
  turnstileToken: z.string().max(2048).optional(),
  totp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export const purchaseRequest = z.object({ quantity: z.number().int().min(1).max(24) });
export const roomInput = z.object({
  name: z.string().min(3).max(70),
  variant: z.union([z.literal(75), z.literal(80), z.literal(90)]),
  price: credits.refine((v) => BigInt(v) > 0n),
  salesSeconds: z.number().int().min(15).max(86400),
  ballIntervalMs: z.number().int().min(1000).max(10000),
  maxCards: z.number().int().min(1).max(24),
  prizeBps: z.number().int().min(1).max(10000),
  minPlayers: z.number().int().min(1).max(100),
  startsInSeconds: z.number().int().min(0).max(604800).optional(),
  pattern: z.enum(['line', 'column', 'diagonal', 'corners', 'x', 'l', 'full']).optional(),
  prizePolicy: z.enum(['proportional', 'fixed']).optional(),
  fixedPrize: credits.optional(),
});
export const eventEnvelope = z.object({
  v: z.literal(1),
  eventId: z.uuid(),
  roundId: z.uuid(),
  seq: z.number().int().positive(),
  type: z.string(),
  ts: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
export const DEMO_NOTICE = 'DEMONSTRAÇÃO — créditos fictícios sem valor monetário';
export type GameEvent = z.infer<typeof eventEnvelope>;
