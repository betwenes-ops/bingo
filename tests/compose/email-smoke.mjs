/* global fetch, AbortSignal */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

if (process.env.CI !== 'true') throw Error('Only run against the disposable CI Compose stack');
const apiBase = 'http://127.0.0.1:4000';
const mailbox = 'http://127.0.0.1:8025';
const email = `compose-mail-${randomUUID()}@example.test`;
const password = 'Compose-test-password-1234';
async function request(path, body, cookie) {
  return fetch(`${apiBase}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      origin: 'http://localhost:3000',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
}
assert.equal((await request('/v1/auth/register', { email, password })).status, 200);
let message;
const deadline = Date.now() + 60000;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${mailbox}/api/v1/messages`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      message = data.messages.find(
        (item) =>
          item.To.some((recipient) => recipient.Address === email) &&
          item.Subject.startsWith('Confirme seu e-mail'),
      );
      if (message) break;
    }
  } catch {
    // The SMTP receiver may still be starting; no production destinations are used.
  }
  await delay(500);
}
assert.ok(message, 'Verification email was not received through the real SMTP worker');
const received = await fetch(`${mailbox}/api/v1/message/${encodeURIComponent(message.ID)}`, {
  signal: AbortSignal.timeout(5000),
});
assert.equal(received.status, 200);
const body = await received.json();
const token = /verify=([a-f0-9]{64})/.exec(body.Text)?.[1];
assert.ok(token, 'Received email did not contain a verification link');
assert.equal((await request('/v1/auth/verify-email', { token })).status, 200);
const login = await request('/v1/auth/login', { email, password });
assert.equal(login.status, 200);
const cookie = login.headers
  .getSetCookie()
  .find((value) => value.startsWith('session='))
  ?.split(';')[0];
assert.ok(cookie, 'Login did not set the session cookie');
const me = await request('/v1/me', undefined, cookie);
assert.equal(me.status, 200);
assert.equal((await me.json()).balance, '100000');
const replay = await request('/v1/auth/verify-email', { token });
assert.equal(replay.status, 400);
assert.equal((await replay.json()).code, 'TOKEN_INVALID');
assert.equal((await (await request('/v1/me', undefined, cookie)).json()).balance, '100000');
console.log(
  JSON.stringify({
    smtpReceived: true,
    emailVerified: true,
    loginSucceeded: true,
    initialCreditGrantedOnce: true,
    tokenReplayRejected: true,
    scope:
      'Disposable CI Compose stack, real worker and Mailpit SMTP. Not external email delivery.',
  }),
);
