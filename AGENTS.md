# Instruções do projeto

Leia PROJECT_BRIEF.md inteiro e docs/adr antes de alterar o projeto. O briefing é a fonte da verdade. O usuário autorizou em 2026-10-16 a execução autônoma sem novas aprovações. Continue com relatórios honestos e validações; decisões reversíveis não exigem nova confirmação. Dinheiro real permanece fora do escopo.

## 2. PRINCÍPIOS INEGOCIÁVEIS

1. **Servidor autoritativo.** Resultado, vencedor, saldo e prêmio são decididos exclusivamente no backend. O cliente só exibe.
2. **Aleatoriedade criptográfica.** Nunca `Math.random()` em nada que afete resultado, cartela ou sorteio.
3. **Resultado imutável.** Nenhum mecanismo, painel ou script altera sorteio, vencedor ou prêmio depois de decidido. Não implementar RNG adaptativo, "controle de lucro", ajuste por saldo, histórico de perdas, perfil ou rentabilidade do jogador.
4. **Dinheiro em inteiros.** Valores em unidades mínimas (`bigint`/inteiro), nunca ponto flutuante.
5. **Contabilidade imutável.** Razão de partidas dobradas; correções por lançamento compensatório, nunca por `UPDATE`/`DELETE`.
6. **Idempotência em tudo que mexe com dinheiro ou prêmio.**
7. **Sem mocks permanentes.** Mocks só em testes, desenvolvimento isolado ou demonstrações explicitamente identificadas.
8. **Sem fingir.** Nunca declare que algo funciona sem rodar os testes e mostrar a saída; nunca declare deploy sem URL e verificação. Nunca substitua funcionalidade por tela estática sem avisar.
9. **Sem dados fictícios apresentados como reais** (contadores de jogadores, prêmios, partidas). Seeds de demonstração devem ser claramente marcados como tais no ambiente de demo.
10. **Degradação elegante.** O jogo funciona integralmente sem 3D e sem som; efeitos se reduzem automaticamente em aparelhos fracos.

## 4. STACK (DECIDIDA — NÃO ALTERNAR SEM ADR)

| Camada                     | Escolha                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Monorepo                   | pnpm workspaces + Turborepo                                                                                                                                                                                        |
| Linguagem                  | TypeScript estrito (`strict`, `noUncheckedIndexedAccess`) em tudo                                                                                                                                                  |
| Frontend jogador           | Next.js (App Router) + React + Tailwind CSS                                                                                                                                                                        |
| Cenas 3D                   | Three.js (procedural, sem depender de modelos externos pesados)                                                                                                                                                    |
| 2D acelerado / partículas  | PixiJS quando fizer sentido                                                                                                                                                                                        |
| Animação UI                | Framer Motion (UI) e GSAP (sequências cinematográficas)                                                                                                                                                            |
| Áudio                      | Howler.js                                                                                                                                                                                                          |
| Backend                    | Node.js + Fastify, validação com Zod, OpenAPI gerada das rotas                                                                                                                                                     |
| Tempo real                 | WebSocket (`ws`) com protocolo próprio versionado; Redis pub/sub para múltiplas instâncias                                                                                                                         |
| Banco                      | PostgreSQL 16+ com migrações versionadas (Drizzle ou Prisma — escolher e registrar ADR)                                                                                                                            |
| Cache/presença/coordenação | Redis                                                                                                                                                                                                              |
| Filas/jobs                 | BullMQ (Redis) ou equivalente; **outbox transacional** para eventos críticos                                                                                                                                       |
| E-mail                     | Mailpit em desenvolvimento; provedor transacional configurável em demo                                                                                                                                             |
| Anti-bot                   | Cloudflare Turnstile (com bypass configurável em dev/teste)                                                                                                                                                        |
| MFA                        | TOTP (RFC 6238)                                                                                                                                                                                                    |
| Testes                     | Vitest (unidade/integração), Testcontainers (Postgres/Redis reais), Playwright (e2e + screenshots), k6 (carga), fast-check (propriedades)                                                                          |
| Observabilidade            | Pino (logs JSON), OpenTelemetry, Prometheus + Grafana                                                                                                                                                              |
| Contêineres                | Docker; `docker compose up` sobe o ambiente local completo com um comando                                                                                                                                          |
| CI                         | GitHub Actions: lint, typecheck, testes, build, auditoria de dependências                                                                                                                                          |
| Deploy da demo             | Containers para serviços persistentes (API + WebSocket + workers), CDN para estáticos. **Não** hospedar o motor de partidas em funções serverless stateless. Escolher provedor por custo/latência e registrar ADR. |

## 28. QUANDO PEDIR APROVAÇÃO

Pare e pergunte **somente** se a decisão: (a) altera custos de forma relevante (provedor de nuvem, serviços pagos), (b) tem implicação legal/regulatória, (c) muda requisito de produto, (d) envolve ativar qualquer operação com valor real, ou (e) depende de asset/licença externa. Fora isso, decida, documente e siga.
