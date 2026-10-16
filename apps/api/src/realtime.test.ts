import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { issueSocketTicket, readSocketTicket } from './realtime';
describe('Ingresso WS vinculado à sessão e rodada', () => {
  it('aceita somente assinatura íntegra, rodada correta e janela de 30 segundos', () => {
    const key = 'test-key',
      sid = randomUUID(),
      uid = randomUUID(),
      round = randomUUID(),
      now = 100000;
    const ticket = issueSocketTicket(key, sid, uid, round, now);
    expect(readSocketTicket(key, ticket, round, now + 1)).toMatchObject({
      sessionId: sid,
      userId: uid,
      roundId: round,
    });
    expect(() => readSocketTicket(key, ticket, randomUUID(), now + 1)).toThrow(
      'SOCKET_TICKET_INVALID',
    );
    expect(() => readSocketTicket('other', ticket, round, now + 1)).toThrow(
      'SOCKET_TICKET_INVALID',
    );
    expect(() => readSocketTicket(key, ticket, round, now + 30000)).toThrow(
      'SOCKET_TICKET_INVALID',
    );
    expect(() => readSocketTicket(key, `${ticket}.extra`, round, now + 1)).toThrow(
      'SOCKET_TICKET_INVALID',
    );
  });
});
