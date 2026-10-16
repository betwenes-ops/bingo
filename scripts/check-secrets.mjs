import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const findings = [];
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['supabase-secret', /sb_secret_[A-Za-z0-9_-]{24,}/g],
  ['github-token', /(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}/g],
  ['openai-secret', /sk-(?:proj|svcacct)-[A-Za-z0-9_-]{30,}/g],
];
let scanned = 0;
for (const path of paths) {
  if (!/\.(?:[cm]?js|tsx?|json|ya?ml|sql|md)$|\.env(?:\.example)?$/.test(path)) continue;
  const text = readFileSync(path, 'utf8');
  scanned++;
  for (const [kind, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern))
      findings.push({ path, line: text.slice(0, match.index).split('\n').length, kind });
  }
  for (const match of text.matchAll(/postgres(?:ql)?:\/\/[^:\s@]+:([^@\s]+)@/g)) {
    const value = match[1];
    if (
      ['local-demo-only', 'local-app-only', 'test-only-password', 'unused'].includes(value) ||
      ['[', '<', '$', '{'].some((marker) => value.includes(marker))
    )
      continue;
    findings.push({
      path,
      line: text.slice(0, match.index).split('\n').length,
      kind: 'database-password',
    });
  }
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try {
      if (JSON.parse(Buffer.from(match[1], 'base64url').toString()).role === 'service_role')
        findings.push({
          path,
          line: text.slice(0, match.index).split('\n').length,
          kind: 'service-role-jwt',
        });
    } catch {
      /* Not a JWT. */
    }
  }
}
if (findings.length) {
  for (const f of findings) console.error(`${f.path}:${f.line}: ${f.kind} (value redacted)`);
  process.exitCode = 1;
} else console.log(`Secret pattern scan passed (${scanned} tracked text files).`);
