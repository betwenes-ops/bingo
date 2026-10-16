# PROMPT-MESTRE — PLATAFORMA PREMIUM DE BINGO ONLINE (VISÃO COMPLETA DO PROJETO)

> **Como usar este documento:** ele descreve o projeto inteiro, de ponta a ponta. Salve-o na raiz do repositório como `PROJECT_BRIEF.md` e crie um `CLAUDE.md` (ou `AGENTS.md`) curto apontando para ele e repetindo as seções 2, 4 e 28. Depois, trabalhe fase por fase (seção 25).
>
> **Campos a preencher antes de enviar:** `[NOME_DA_MARCA]`, `[DOMÍNIO]`, paleta/fontes se quiser trocar (seção 19).

---

## 0. INSTRUÇÕES AO AGENTE (LEIA PRIMEIRO)

Você é uma equipe sênior de engenharia: arquitetura de sistemas, jogos online em tempo real, matemática de jogos, contabilidade financeira, segurança, design de interface e DevOps.

Este documento é a **fonte da verdade** do projeto. Ao recebê-lo:

1. Leia-o inteiro antes de escrever qualquer código.
2. Produza, nesta ordem, e **pare para aprovação** ao final:
   - `docs/ARCHITECTURE.md` (arquitetura, módulos, contratos, diagrama).
   - `docs/ROADMAP.md` (plano por fase com critérios de aceite verificáveis, derivados da seção 25).
   - `docs/RISKS.md` (riscos de concorrência, segurança, financeiros e de desempenho, com mitigação).
   - `docs/adr/` (um ADR curto por decisão técnica relevante).
   - Lista de **dúvidas bloqueantes** (apenas as que têm impacto real em custo, requisito legal ou funcionamento).
3. Após aprovação, implemente **uma fase por vez**. Ao fim de cada fase, entregue o relatório descrito na seção 27 e aguarde "seguir" antes da próxima.
4. Quando algo não estiver especificado, escolha a opção mais robusta, documente em um ADR e siga. Só pergunte quando houver impacto significativo.

---

## 1. VISÃO DO PRODUTO

**[NOME_DA_MARCA]** é uma plataforma de **bingo online exclusivamente**, com padrão de qualidade técnico, visual e operacional comparável aos grandes provedores internacionais de jogos (referência de nível, **sem copiar marcas, assets, interfaces ou textos de terceiros**).

Ela oferece dois produtos que compartilham a mesma base (autenticação, carteira, auditoria, configuração, segurança) mas têm motores de regras independentes:

### Produto A — Bingo multiplayer em tempo real
Salas com vários jogadores. Cada jogador compra uma ou mais cartelas com créditos. Ao fim da janela de vendas, as cartelas são congeladas e começa o sorteio; todos veem **as mesmas bolas, na mesma ordem**. O servidor identifica os vencedores e calcula e credita os prêmios conforme as regras publicadas na sala.

### Produto B — Bingo individual instantâneo
O jogador escolhe um jogo, define o valor da participação e inicia uma partida solo. O servidor sorteia, avalia os padrões e paga conforme uma **tabela de pagamentos pública e imutável**. O resultado nunca é ajustado depois.

### Estado da entrega (inegociável)
- A versão inicial opera **somente com créditos fictícios, sem valor monetário e sem possibilidade de resgate ou conversão**.
- Toda a interface exibe, de forma fixa e visível: **"DEMONSTRAÇÃO — créditos fictícios sem valor monetário"**.
- O módulo de dinheiro real existe apenas como **interface/arquitetura preparada e desativada por feature flag**, e só pode ser ativado após análise jurídica, licenciamento e aprovação de provedores financeiros na jurisdição escolhida (seção 18).

---

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

---

## 3. ESCOPO

### Dentro do escopo
Cadastro/login, carteira de créditos fictícios, lobby, salas multiplayer (75, 90, 80 bolas), bingo individual instantâneo, motor de premiação, RNG auditável com verificação pública, histórico, painel administrativo, auditoria, conciliação, observabilidade, testes (unidade, integração, e2e, carga, matemática), CI/CD, ambiente de demonstração, documentação.

### Fora do escopo (nesta entrega)
Dinheiro real, saques, Pix real, KYC real, geolocalização real, jackpots monetários, aplicativos nativos nas lojas. A **arquitetura deve prever** esses pontos (portas/adaptadores/feature flags), sem implementá-los de verdade.

---

## 4. STACK (DECIDIDA — NÃO ALTERNAR SEM ADR)

| Camada | Escolha |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Linguagem | TypeScript estrito (`strict`, `noUncheckedIndexedAccess`) em tudo |
| Frontend jogador | Next.js (App Router) + React + Tailwind CSS |
| Cenas 3D | Three.js (procedural, sem depender de modelos externos pesados) |
| 2D acelerado / partículas | PixiJS quando fizer sentido |
| Animação UI | Framer Motion (UI) e GSAP (sequências cinematográficas) |
| Áudio | Howler.js |
| Backend | Node.js + Fastify, validação com Zod, OpenAPI gerada das rotas |
| Tempo real | WebSocket (`ws`) com protocolo próprio versionado; Redis pub/sub para múltiplas instâncias |
| Banco | PostgreSQL 16+ com migrações versionadas (Drizzle ou Prisma — escolher e registrar ADR) |
| Cache/presença/coordenação | Redis |
| Filas/jobs | BullMQ (Redis) ou equivalente; **outbox transacional** para eventos críticos |
| E-mail | Mailpit em desenvolvimento; provedor transacional configurável em demo |
| Anti-bot | Cloudflare Turnstile (com bypass configurável em dev/teste) |
| MFA | TOTP (RFC 6238) |
| Testes | Vitest (unidade/integração), Testcontainers (Postgres/Redis reais), Playwright (e2e + screenshots), k6 (carga), fast-check (propriedades) |
| Observabilidade | Pino (logs JSON), OpenTelemetry, Prometheus + Grafana |
| Contêineres | Docker; `docker compose up` sobe o ambiente local completo com um comando |
| CI | GitHub Actions: lint, typecheck, testes, build, auditoria de dependências |
| Deploy da demo | Containers para serviços persistentes (API + WebSocket + workers), CDN para estáticos. **Não** hospedar o motor de partidas em funções serverless stateless. Escolher provedor por custo/latência e registrar ADR. |

---

## 5. ARQUITETURA

### 5.1 Monólito modular primeiro
Um único backend deployável com **módulos de fronteira rígida** (sem importar internals de outro módulo; comunicação por interfaces/serviços públicos e eventos). Isso evita transações distribuídas entre carteira e partidas no início, mantendo a possibilidade de extrair serviços depois.

Módulos de backend:

- `identity` — usuários, sessões, MFA, permissões, perfil.
- `wallet` — carteira, razão contábil, reservas, idempotência, conciliação.
- `catalog` — jogos, versões, regras, modelos matemáticos (imutáveis após publicação).
- `rng` — geração criptográfica, commit-reveal, verificação.
- `cards` — Card Engine (geração/validação por modalidade, padrões).
- `prizes` — Prize Engine (políticas, rateio, empates, arredondamento).
- `rooms` — ciclo de vida de salas/partidas multiplayer, scheduler, recuperação.
- `instant` — motor do bingo individual, tabelas de pagamento, RTP.
- `realtime` — gateway WebSocket, protocolo, presença, replay de eventos.
- `admin` — operações administrativas, RBAC, dupla aprovação, relatórios.
- `audit` — trilha de auditoria imutável.
- `compliance` — limites, autoexclusão, pausas, flags regulatórias (portas para KYC/idade/geo).
- `payments` — **porta** para provedores (interface + adaptador "desativado"); webhooks com validação de assinatura prontos, porém off.
- `notifications` — avisos in-app/e-mail.

### 5.2 Estrutura sugerida do repositório
```
/apps
  /web            # app do jogador (Next.js)
  /admin          # painel administrativo (Next.js, separado, outro domínio/porta)
  /api            # Fastify: HTTP + WebSocket + workers
/packages
  /domain         # tipos, regras puras de bingo, sem I/O (100% testável)
  /bingo-math     # probabilidades exatas, RTP, simulador
  /protocol       # esquemas Zod dos eventos WS/HTTP compartilhados
  /ui             # design system (tokens, componentes)
  /scene3d        # globo, bolas, efeitos (Three.js) com fallback
  /config         # tsconfig, eslint, prettier compartilhados
/infra            # docker, compose, k6, dashboards, scripts
/docs             # ARCHITECTURE, ROADMAP, RISKS, ADRs, runbooks, regras públicas
```

### 5.3 Princípios de design
- **Núcleo de domínio puro** (`packages/domain`): geração de cartelas, avaliação de padrões e rateio de prêmios são funções puras e determinísticas, testáveis sem banco.
- **Máquinas de estado explícitas** para partidas e transações, com transições validadas.
- **Outbox**: evento gravado na mesma transação do dado que o originou e publicado por um worker (garantia "pagou mas o evento se perdeu" = impossível).
- **Contratos tipados** compartilhados (`packages/protocol`) entre API e clientes.

---

## 6. LOBBY E PERFIL

Página inicial premium, alimentada **por dados reais do backend em tempo real**:

- Salas abertas, agendadas e em andamento; tempo restante para início; número real de participantes e cartelas vendidas.
- Modalidade (75/90/80), padrão(ões) de vitória, preço da cartela, limite por usuário, prêmio (fixo anunciado ou % do fundo, com valor atual calculado).
- Jogos individuais com RTP e tabela de pagamentos acessíveis.
- Filtros por modalidade, faixa de preço e status.
- Histórico de partidas e de cartelas; acesso à carteira, perfil, regras e jogo responsável.
- Estados de carregamento, vazio, erro e reconexão em todas as listas.

Perfil: dados da conta, sessões ativas (com encerramento remoto), histórico de atividade, limites pessoais, MFA, autoexclusão/pausa.

---

## 7. MODALIDADES DE BINGO

Cada modalidade é um **módulo parametrizável** (`BingoVariant`) com: geração de cartela, universo de bolas, padrões suportados, avaliador de vitória e testes próprios.

### 7.1 Bingo 75 bolas
- Cartela 5×5; colunas B(1–15), I(16–30), N(31–45), G(46–60), O(61–75); centro livre (configurável).
- Padrões: linha, coluna, diagonal, quatro cantos, X, L, cartela cheia. **O padrão da sala é publicado antes da venda e versionado com a sala.**

### 7.2 Bingo 90 bolas
- Cartela 3 linhas × 9 colunas, 15 números e 12 vazios; **5 números por linha**; faixas por coluna (1–9, 10–19, …, 80–90); cada coluna com ao menos 1 número; números crescentes dentro da coluna.
- Premiações: primeira linha, duas linhas, cartela cheia (em sequência, cada uma com seu prêmio).
- **Atenção:** gerar também "tickets" de 6 cartelas que cobrem os 90 números sem repetição é um diferencial opcional (registrar como extensão futura).

### 7.3 Bingo 80 bolas
- Cartela 4×4 com 16 números por faixas de coluna (1–20, 21–40, 41–60, 61–80 por coluna).
- Padrões configuráveis: linha, coluna, diagonal, quatro cantos, cartela cheia.

### 7.4 Regras comuns
- Bolas sem repetição; sequência fixada no início e imutável.
- Cartelas únicas por identificador; unicidade de **conteúdo** não é exigida, mas colisões devem ser mensuráveis nos testes.
- Marcação automática padrão; marcação manual é apenas visual e **não** altera os critérios objetivos.
- Indicador de "faltam N bolas" para o padrão mais próximo (calculado no servidor ou derivado de forma idêntica no cliente a partir do mesmo domínio).

---

## 8. RNG E JUSTIÇA VERIFICÁVEL

### 8.1 Requisitos
- Fonte: `crypto.randomBytes` / CSPRNG do SO para seeds; embaralhamento **Fisher-Yates com rejection sampling** (sem viés de módulo).
- Sequência derivada de forma determinística de `(server_seed, client_seed/round_id, nonce)` via **HMAC-SHA256** para permitir **reprodução e auditoria**.
- Seeds armazenadas cifradas; nunca expostas antes da hora; nenhuma informação que permita prever bolas futuras.

### 8.2 Protocolo commit-reveal (multiplayer)
1. Na criação/abertura da venda, o servidor gera `server_seed`, calcula `commitment = SHA256(server_seed)` e **publica o commitment** junto com a sala.
2. Após o fechamento das vendas, o servidor define o `round_id` final (incluindo a lista congelada de cartelas) e deriva a sequência.
3. Ao fim da partida, revela `server_seed`. Qualquer pessoa pode conferir: `SHA256(server_seed) == commitment` e reconstruir a sequência.
4. Página pública **"Verificar partida"** (no app e no admin) que recebe o ID da partida e valida automaticamente.
5. Documentar o modelo de ameaça: o que o commit-reveal prova e o que **não** prova (por exemplo, o operador conhecer a seed antes do fechamento). Mitigações possíveis (misturar entropia pública após o fechamento, como hash do ID da última cartela vendida) devem ser avaliadas em ADR.

### 8.3 Individual
Cada partida registra seed, nonce e commitment; o jogador pode verificar o resultado depois.

### 8.4 Testes do RNG
- Uniformidade (qui-quadrado), ausência de repetição, independência, posição de cada bola (distribuição uniforme sobre posições), reprodutibilidade determinística, testes de propriedade com fast-check.
- Planejar certificação independente (documento `docs/certification-plan.md`: laboratórios típicos, escopo, normas aplicáveis).

---

## 9. CARTEIRA E CONTABILIDADE

### 9.1 Modelo
- Razão de **partidas dobradas**: `ledger_accounts` (do usuário, da casa, fundos de prêmio, promocional, reservas), `ledger_transactions` (cabeçalho, com `idempotency_key` única), `ledger_entries` (linhas débito/crédito; soma da transação = 0).
- `wallets` guarda saldo **derivado/cacheado** com versão; a verdade é o razão. Existe job de reconciliação saldo × razão.
- Saldo nunca negativo (`CHECK` no banco + validação em transação).
- Valores `bigint` em unidade mínima (centavos de crédito).

### 9.2 Tipos de movimentação
Crédito promocional fictício, reserva, compra de cartela, liberação de reserva, cancelamento, estorno, premiação, ajuste administrativo (dupla aprovação), reversão, expiração de promocional.

### 9.3 Fluxo de compra (único e transacional)
```
Solicitação (Idempotency-Key) → BEGIN → trava a carteira (SELECT ... FOR UPDATE)
→ valida estado da sala/limites → debita/reserva → cria cartelas
→ grava lançamentos + evento no outbox → COMMIT → publica evento
```
Qualquer falha: rollback completo. Repetir a mesma `Idempotency-Key` devolve o resultado original, sem novo débito.

### 9.4 Fluxo de premiação
```
Motor confirma resultado → grava prize_awards (UNIQUE por partida+cartela+padrão)
→ cria lançamentos de crédito (idempotentes) → atualiza saldo → outbox → notificação
```
Reexecutar o processo não pode pagar duas vezes. Falha no meio fica em estado recuperável (job de repasse com retentativas).

### 9.5 Regras
Estornos = lançamentos compensatórios; nada é apagado; toda movimentação tem ID único, data, origem, valor, referência e correlação; admin pode conciliar e investigar.

---

## 10. PRIZE ENGINE

Módulo independente, com **regras versionadas e congeladas no momento em que a sala abre para vendas**.

- **Política A — Fundo proporcional:** `fundo = arrecadado × %_prêmios`; distribuição percentual entre os prêmios da modalidade (ex.: 15% / 25% / 60% — exemplos configuráveis). O % é exibido **antes da compra**.
- **Política B — Prêmio fixo anunciado:** exige fundo garantidor disponível e **mínimo de participantes**; define política de cancelamento/reembolso se não atingido.
- **Política C — Acumulado (preparado, desativado):** contabilidade segregada, regras públicas de contribuição/elegibilidade/distribuição. Nenhum jackpot monetário ativo.
- **Empates:** vencedores na mesma bola dividem o prêmio. **Regra determinística de resto:** divisão inteira; o resto (centavos indivisíveis) é distribuído um a um pela ordem determinística publicada (ex.: ordem crescente de ID de cartela) — **sem perda contábil** (soma paga = prêmio).
- Sem participantes → partida cancelada com reembolso integral; abaixo do mínimo → cancelamento conforme regra publicada.
- Todo cálculo é auditável: guardar entradas, regra aplicada, saída e hash.

---

## 11. MOTOR MULTIPLAYER

### 11.1 Estados
`CREATED → SCHEDULED → OPEN_FOR_SALES → SALES_CLOSED → READY → DRAWING → VERIFYING → SETTLING → COMPLETED`, com `CANCELLED` e `FAILED` como terminais alcançáveis conforme regras. Toda transição é validada no servidor, persistida e auditada.

### 11.2 Resiliência (requisito central)
- **Partida não depende de conexão de jogador.** Fechar o app não elimina cartela.
- **Scheduler persistente:** cada partida tem `next_ball_at` no banco. Um worker executa o sorteio protegido por **advisory lock** do Postgres (um único "dono" por partida). Se a instância cair, outra assume do ponto exato.
- **Event sourcing leve:** `game_events` com sequência monotônica por partida; snapshots periódicos; reconstrução do estado por replay.
- **Reinício do servidor durante o sorteio** não perde bola, não repete bola, não duplica prêmio.
- Cadência de bolas configurável por sala (ex.: 4–6 s) e registrada nas regras.

### 11.3 Processo
Criação → publicação → vendas → fechamento (congela participantes e cartelas) → derivação da sequência → sorteio ao vivo → verificação de padrões a cada bola → todos os vencedores da bola identificados → liquidação → revelação da seed → publicação de resultados verificáveis.

### 11.4 Regras
Nenhuma cartela após o fechamento; nenhum ajuste de regras após abertura de vendas; admin não intervém em sorteio ativo nem altera vencedores retroativamente (só pode **suspender novas vendas** ou **cancelar** antes do início, conforme regras publicadas).

---

## 12. MOTOR INDIVIDUAL (BINGO INSTANTÂNEO)

### 12.1 Jogo inicial concreto: "Instant Bingo 75"
- Cartela 75 bolas (5×5, centro livre), gerada no servidor.
- **30 bolas** sorteadas sem reposição entre 75, reveladas em sequência na animação (o resultado já está decidido no servidor antes da animação).
- Avaliação: para cada partida, o servidor identifica os padrões completados dentro das 30 bolas. **Paga-se o padrão de maior valor** (sem acúmulo), para simplicidade e clareza da regra.
- Tabela de pagamentos (múltiplos da aposta) **proposta inicial** para ajuste pelo cálculo exato: linha, coluna, diagonal, quatro cantos, X, cartela cheia (ex.: 1×, 1×, 2×, 3×, 10×, 200×; valores ilustrativos).
- Faixa de apostas fixa (ex.: 1, 2, 5, 10, 25 créditos fictícios).

### 12.2 Matemática
- `packages/bingo-math` calcula **probabilidade exata** de cada resultado (combinatória/programação dinâmica/enumeração por classes de simetria — documentar o método) e o **RTP teórico**:
  `RTP = Σ (probabilidade do resultado × pagamento) / aposta`.
- **Simulador** de milhões de partidas (paralelizável) comparando RTP simulado × teórico, com intervalo de confiança, variância, desvio-padrão, distribuição de prêmios, frequência de acerto e maior sequência de perdas.
- A tabela de pagamentos é **ajustada até o RTP-alvo resultar da matemática** (alvo inicial 94–96%, a decidir em ADR); nunca se "configura" o RTP por percentual.
- Cada versão (`game_versions` + `game_math_models`) é **imutável após publicada**, tem relatório matemático gerado, testes de regressão entre versões e aprovação registrada.
- Exibir ao jogador: regras, probabilidades por padrão, tabela de pagamentos, RTP e identificador da versão.

### 12.3 Fluxo
Seleciona jogo/aposta → confirma (idempotência) → servidor debita, gera seed/cartela/sequência, avalia e liquida **antes** da animação → cliente anima o resultado já gravado → histórico verificável (botão "Verificar").

---

## 13. TEMPO REAL

### 13.1 Envelope de evento (versão de protocolo `v1`)
```
{ eventId, roomId/roundId, seq (monotônico por partida), type, ts (servidor), v, payload }
```
Eventos mínimos: `ROOM_CREATED`, `ROOM_OPENED`, `CARD_PURCHASED`, `SALES_CLOSED`, `GAME_STARTED`, `BALL_DRAWN`, `PATTERN_COMPLETED`, `PRIZE_CONFIRMED`, `GAME_FINISHED`, `GAME_CANCELLED`, `WALLET_UPDATED`.

### 13.2 Requisitos
- Autenticação do handshake; autorização por sala; limite de mensagens e de conexões por usuário.
- **Reconexão automática com backoff** e **recuperação por `lastSeq`**: o servidor reenvia o que faltou (ou snapshot + eventos).
- Deduplicação por `eventId`, ordenação por `seq`, detecção de lacunas.
- Heartbeats; indicador de qualidade de conexão na UI.
- **Sincronização de relógio** (offset servidor/cliente) para contagens regressivas coerentes.
- Fan-out entre instâncias via Redis pub/sub; presença via Redis.
- Ao reconectar, o jogador recupera a partida em andamento **e** suas cartelas, sem perder estado.

---

## 14. AUTENTICAÇÃO E CONTA

- Cadastro e-mail/senha (hash Argon2id), verificação de e-mail, recuperação de senha, Turnstile no cadastro/login/recuperação.
- Sessões com cookies `HttpOnly`/`Secure`/`SameSite`, rotação de tokens, lista de dispositivos e logout remoto.
- **MFA TOTP** obrigatório para operações sensíveis (e para todo o admin).
- Proteção contra força bruta (rate limit + bloqueio progressivo), registro de acessos e histórico de atividades.
- RBAC com menor privilégio; cada usuário tem ID único e uma carteira própria; **nenhum usuário acessa dado privado de outro** (testes específicos de IDOR).
- Fluxos LGPD: consentimento, política de privacidade, exportação e exclusão/anonimização de dados, registro de tratamento.

---

## 15. PAINEL ADMINISTRATIVO

Aplicação **separada** (`apps/admin`), outro domínio/porta, MFA obrigatório, sem layout genérico de template: densidade de informação alta, tabelas poderosas, filtros salvos, exportação CSV.

- **Dashboard:** usuários (cadastrados/ativos/online), partidas (andamento/concluídas), cartelas vendidas, créditos movimentados, prêmios, saldo total das carteiras, falhas, saúde dos servidores.
- **Usuários:** busca, perfil, sessões, movimentações, bloqueio/desbloqueio com motivo obrigatório, trilha de auditoria.
- **Jogos/salas:** criar, agendar, modalidade, preço, limite de cartelas, política de premiação, empate, mínimo de participantes, suspender novas vendas, cancelar conforme regras, consultar resultados e **verificação da seed**.
- **Financeiro:** carteiras, lançamentos, divergências, conciliação (manual e automática), prêmios pendentes, transações duplicadas, **ajustes com dupla aprovação** (quem solicita ≠ quem aprova), relatórios.
- **Auditoria:** toda ação relevante registra quem, quando, o quê, justificativa e valores antes/depois, em trilha **append-only**.
- **Proibido:** qualquer intervenção em sorteio ativo ou alteração retroativa de vencedor.
- Papéis sugeridos: `superadmin`, `operador_de_jogos`, `financeiro`, `suporte`, `auditor` (somente leitura).

---

## 16. MODELO DE DADOS

Entidades mínimas (nomes em inglês, `snake_case`):

`users, user_profiles, user_sessions, wallets, ledger_accounts, ledger_transactions, ledger_entries, games, game_versions, game_rules, game_math_models, rooms, room_participants, bingo_cards, card_purchases, game_rounds, draw_sequences, drawn_balls, winning_patterns, prize_pools, prize_allocations, prize_awards, wallet_reservations, game_events, audit_logs, admin_users, admin_roles, permissions, notifications, idempotency_keys, reconciliation_records, system_settings, outbox_events, responsible_gaming_limits, self_exclusions, feature_flags`

Exigências:
- PKs (preferir UUID v7 ou equivalente ordenável), FKs com integridade referencial, índices justificados, `UNIQUE` onde há idempotência (`idempotency_key`, `prize_awards(round, card, pattern)`, `drawn_balls(round, position)` e `(round, number)`).
- `CHECK` constraints (saldo ≥ 0, soma de lançamentos = 0, valores ≥ 0).
- Controle de concorrência explícito (locks, versão otimista onde cabível).
- Migrações versionadas e reversíveis quando possível; **tabelas críticas append-only** (razão, eventos, auditoria) protegidas por triggers/permissões.
- Política de retenção documentada; backup automático com **restauração testada**.
- Documentar o ER em `docs/data-model.md` com justificativa de cada índice.

---

## 17. SEGURANÇA E ANTIFRAUDE

Checklist obrigatório (verificado por testes quando possível):

- Validação de toda entrada (Zod) e codificação de saída; proteção contra SQL injection (queries parametrizadas), XSS (CSP estrita), CSRF, SSRF, IDOR, enumeração de usuários.
- Rate limiting por IP, usuário e rota; proteção contra replay; limites de mensagens WS.
- Segredos via variáveis/secret manager, nunca no repositório; rotação documentada.
- TLS em trânsito; cabeçalhos de segurança; CORS restritivo.
- Webhooks (futuros): assinatura validada, janela de tempo, deduplicação por ID, confirmação direta com o provedor.
- Segregação de funções no admin, dupla aprovação para ajustes, trilha imutável.
- Monitoramento de anomalias: múltiplas contas por dispositivo/IP, padrões de compra suspeitos, tentativas de acesso cruzado, picos de falhas de login.
- `pnpm audit`/scanner de dependências e de segredos no CI; revisão de dependências novas.
- Modelo de ameaças documentado (`docs/threat-model.md`) e **testes de segurança** (incluindo tentativas de manipulação de cartela, de saldo e de evento via cliente).

---

## 18. JOGO RESPONSÁVEL E CONFORMIDADE

A arquitetura nasce preparada para regulação, **sem ativar operação monetária**:

- Portas/adaptadores para verificação de **idade**, **identidade (KYC)**, **localização** e PLD/AML — implementados como interfaces com adaptador "desativado".
- Já funcionais na demo: **limites de participação**, **pausas voluntárias**, **autoexclusão**, histórico de participação, transparência de regras/probabilidades/RTP, canal de atendimento e contestação (formulário + painel).
- **Sem incentivos a perseguir perdas:** nada de "dobre para recuperar", bônus por perda, urgência manipulativa, cores/sons que simulem quase-vitória artificial. Indicadores de proximidade de vitória devem refletir **a realidade matemática da cartela**, não teatro.
- Lembretes de tempo de sessão e resumo de gasto/créditos ao jogador.
- Antes de qualquer ativação de dinheiro real: parecer jurídico, licença/autorização da modalidade e do operador na jurisdição escolhida, contratos com provedores, política de privacidade e termos revisados. Registrar em `docs/compliance-gate.md` um **checklist de ativação** que impeça a flag de ser ligada sem os itens marcados.

---

## 19. DIREÇÃO DE ARTE E EXPERIÊNCIA

> O visual é prioridade absoluta, mas deve ser **mensurável**. "Premium" aqui significa decisões concretas, não adjetivos.

### 19.1 Identidade (ajuste livremente, mas **defina e registre em `packages/ui/tokens`**)
- Conceito: "cassino-boutique noturno": superfícies escuras, metal escovado, vidro, ouro quente como acento, luz cinematográfica de uma fonte principal. Nada infantil, nada de neon genérico.
- Paleta inicial: fundo `#0B0A12`, superfície `#14121F`, elevação `#1D1A2E`, ouro `#D4AF37` / realce `#F2D27A`, carmim `#C8283C`, esmeralda `#14B58A`, texto `#F4F1EA`, texto secundário `#A7A1B5`. Contraste AA mínimo em todo texto.
- Tipografia: títulos **Fraunces** (ou serifada de display equivalente), interface **Sora**, números de bolas/cartelas **Barlow Condensed** (tabular, legibilidade extrema). Fontes auto-hospedadas, `font-display: swap`, subset.
- Design system com tokens (cor, raio, sombra, espaçamento, movimento), componentes documentados (Storybook opcional) e **estados completos** (hover, foco, ativo, desabilitado, carregando, erro).

### 19.2 Sala de bingo
1. **Máquina de sorteio 3D procedural** (globo de vidro, estrutura metálica, bolas com material PBR, iluminação com reflexos, sombra suave, física simples de bolas em agitação).
2. Animação de saída de cada bola (tubo/rampa), destaque cinematográfico do número (câmera/zoom, partículas discretas), voz/efeito sonoro sincronizado.
3. Histórico visual das últimas bolas e quadro completo 1–N com as sorteadas.
4. Cartelas com marcação animada, destaque de bola recém-sorteada, indicador de "faltam N".
5. Animação especial de **linha** e celebração premium de **cartela cheia/bingo**, com resumo do prêmio e botão para ver prova de justiça.
6. Contagem regressiva sincronizada, estados de conexão claros (conectado, reconectando, sem conexão).
7. Preferências: desativar efeitos intensos, som, vibração, marcação automática; respeitar `prefers-reduced-motion`.

### 19.3 Realismo de expectativas (para o agente)
Você produzirá 3D **procedural** (Three.js) e efeitos de partículas; **não** depende de modelagem em Blender. Faça o melhor possível dentro disso: materiais, luz, easing e timing cuidadosos. Estruture o código para **aceitar assets 3D externos** (glTF) futuramente sem refatoração. Se algum recurso exigir asset de artista, registre em `docs/asset-needs.md`.

### 19.4 Orçamento de desempenho (critérios de aceite)
- Celular intermediário (referência: Android com ~4 GB de RAM): **≥ 50 fps** na cena 3D; degradação automática por **perfis de qualidade (alto/médio/baixo/sem-3D)** escolhidos por benchmark de inicialização + preferência do usuário.
- LCP < 2,5 s em 4G simulado; CLS < 0,1; JS inicial do lobby documentado e com orçamento definido em ADR; cena 3D carregada sob demanda (lazy).
- Lighthouse: Performance ≥ 80 (mobile), Acessibilidade ≥ 90, Boas práticas ≥ 90.
- Assets comprimidos (texturas KTX2/WebP, áudio opus/aac), `dispose()` correto de recursos Three.js (sem vazamento).

### 19.5 Processo visual
- Para cada tela principal, **gere screenshots com Playwright** (mobile 390×844 e desktop 1440×900), compare com a direção de arte, **autocritique por escrito** e corrija antes de declarar pronto. Anexe os screenshots no relatório da fase.
- Teste de regressão visual básico nas telas-chave.

### 19.6 Acessibilidade
Navegação por teclado, foco visível, rótulos ARIA, leitor de tela anunciando bolas sorteadas (região `aria-live` moderada), alternativas ao som, redução de movimento, cores não como única informação (modo daltônico para marcação).

---

## 20. MOBILE-FIRST

Projetar primeiro para vertical 360–430 px: áreas de toque ≥ 44 px, **múltiplas cartelas** em carrossel/grade compacta com zoom e fixação de favoritas, saldo sempre visível, ações principais ao alcance do polegar, PWA instalável, carregamento progressivo, tratamento de teclado virtual e *safe areas*, retomada correta ao voltar do segundo plano (reconexão + recuperação de estado).

---

## 21. IDIOMA E LOCALIZAÇÃO

- Idioma principal **pt-BR**; arquitetura i18n pronta para outros idiomas (chaves de tradução, nunca texto fixo em componentes).
- Formatação de datas/horas/números em pt-BR; fuso padrão `America/Sao_Paulo`; horários de sala exibidos no fuso do usuário com indicação clara.
- Créditos exibidos como "créditos" (não "R$"), com formatação consistente.

---

## 22. OBSERVABILIDADE E OPERAÇÃO

- Logs JSON estruturados com `correlationId` (do request até o evento WS), sem dados sensíveis.
- Métricas Prometheus: conexões WS, latência de evento `BALL_DRAWN`, atraso do scheduler, taxa de erro, transações/s, tempo de lock da carteira, filas, uso de CPU/memória; dashboards Grafana versionados em `/infra`.
- Tracing OpenTelemetry nos fluxos de compra e premiação.
- Alertas: atraso de sorteio, divergência de conciliação, fila de outbox crescendo, picos de erro.
- **Runbooks** em `docs/runbooks/`: queda de instância durante sorteio, divergência contábil, restauração de backup, rotação de segredos, cancelamento de sala.
- Backups automáticos e **exercício de restauração documentado**.
- Ambientes: `local`, `staging` (homologação), `production-demo`, com variáveis e flags separadas; migrações aplicadas por pipeline.

---

## 23. ESTRATÉGIA DE TESTES (MATRIZ OBRIGATÓRIA)

### Domínio e motor
Geração de milhares de cartelas válidas por modalidade; avaliação de todos os padrões (casos limite e propriedades); sorteio sem repetição; empates (2, 3, N vencedores) e divisão com resto; sala sem participantes; cancelamento e reembolso; recuperação após reinício **no meio do sorteio** (matar o processo em teste e validar continuidade sem bola duplicada ou perdida); reconexão; compra após fechamento rejeitada.

### Financeiro
Compra com saldo suficiente/insuficiente; **duas compras simultâneas com o mesmo saldo** (somente uma passa); repetição da mesma `Idempotency-Key`; repetição de evento de premiação (sem pagamento duplo); falha no meio da transação (rollback total); estorno; concorrência débito × crédito; conciliação saldo × razão sempre fecha; soma do razão = 0; propriedade: "pago em prêmios ≤ fundo".

### Matemático
Probabilidades exatas × simulação (dentro do intervalo de confiança); RTP teórico × simulado; distribuição de prêmios; regressão entre versões matemáticas; relatório gerado e versionado.

### Segurança
IDOR em todas as rotas privadas, rate limit, brute force, replay, manipulação de payload WS, XSS/CSRF, escalonamento de privilégio no admin, dupla aprovação burlada.

### E2E (Playwright)
Cadastro → verificação → login → receber créditos → comprar cartelas → participar de sala → acompanhar sorteio → ganhar → ver saldo/histórico → verificar partida; jogo individual; admin cria sala e acompanha; reconexão simulada; viewport mobile.

### Carga (k6 + clientes WS simulados)
Progressão **100 → 500 → 1.000 → 5.000 → 10.000** jogadores simultâneos em uma sala e em várias salas. Medir latência de entrega de bola (p50/p95/p99), CPU, memória, eventos perdidos/duplicados, tempo de reconexão, desempenho do banco, **consistência financeira ao final**. Registrar **resultados reais** em `docs/load-test-results.md`, corrigir gargalos e re-testar. Metas são alvos de teste, **não capacidade presumida**; relatar até onde de fato chegou.

### Cobertura
Meta mínima: 90% no domínio/carteira/prêmios; relatório de cobertura no CI. Cobertura não substitui revisão dos casos críticos acima.

---

## 24. CI/CD E QUALIDADE

- Pipeline a cada PR: lint, typecheck, testes de unidade e integração (com Testcontainers), build, auditoria de dependências, varredura de segredos, migrações em banco limpo e sobre banco com dados.
- Pipeline noturna: simulações matemáticas longas, e2e completo, regressão visual.
- Commits pequenos e semânticos; nunca commitar com testes falhando; `main` protegida.
- Qualidade por módulo: tipagem estrita, validação, tratamento de erros, logs, documentação técnica, migrações, integração, estados de carregamento/falha, critérios de aceite verificáveis.
- README com "como rodar" (um comando), variáveis de ambiente (`.env.example`), seeds de demo e scripts úteis.

---

## 25. PLANO DE EXECUÇÃO POR FASES

Cada fase termina com **gate**: testes passando, relatório (seção 27) e aprovação.

**Fase 0 — Planejamento e fundação do repositório**
Arquitetura, ADRs, roadmap, riscos, monorepo, Docker Compose, CI, lint/format/typecheck, README. *Gate:* `docker compose up` sobe o ambiente; CI verde.

**Fase 1 — Identidade, carteira, auditoria, admin inicial**
Auth completo (cadastro, verificação, login, recuperação, sessões, MFA, Turnstile), perfil, RBAC, razão contábil + carteira + idempotência + reconciliação, créditos fictícios de teste, auditoria, admin com usuários/carteiras/auditoria. *Gate:* testes financeiros e de segurança básicos verdes; conciliação fecha.

**Fase 2 — Domínio de bingo e RNG (75 bolas)**
`packages/domain`, Card Engine 75, RNG HMAC + Fisher-Yates + commit-reveal, avaliador de padrões, Prize Engine, testes estatísticos e de propriedade, verificador público. *Gate:* testes do RNG e do domínio verdes, verificação reproduz a sequência.

**Fase 3 — Multiplayer funcional**
Salas, ciclo de estados, compra de cartelas, scheduler persistente com advisory lock, WebSocket, protocolo, reconexão e replay, premiação coletiva, outbox, recuperação de falhas, admin de salas, UI funcional (ainda sem acabamento 3D). *Gate:* e2e de ponta a ponta; teste de **kill durante sorteio** passando; premiação sem duplicidade.

**Fase 4 — Bingo individual e matemática**
`bingo-math` (probabilidade exata, RTP, simulador), "Instant Bingo 75", tabela de pagamentos calibrada, versões imutáveis, histórico verificável, relatório matemático. *Gate:* RTP teórico = simulado dentro do IC; relatório publicado.

**Fase 5 — Experiência premium**
Design system, lobby profissional, sala 3D, animações, partículas, áudio, cartelas interativas, perfis de qualidade, acessibilidade, otimização mobile, PWA. *Gate:* orçamentos da seção 19.4 atingidos e medidos; screenshots aprovados.

**Fase 6 — Novas modalidades**
Bingo 90 e Bingo 80 (geração, padrões, premiações em sequência, testes), padrões especiais, salas programadas/recorrentes. *Gate:* testes de geração e avaliação por modalidade verdes.

**Fase 7 — Administração avançada e jogo responsável**
Relatórios, monitoramento, conciliação avançada, dupla aprovação, limites/pausas/autoexclusão completos, atendimento/contestação, dashboards operacionais. *Gate:* fluxos admin e de conformidade cobertos por e2e.

**Fase 8 — Validação e implantação da demo**
Testes de carga progressivos, revisão de segurança, revisão matemática, revisão de acessibilidade, correções, `staging` e `production-demo`, monitoramento, runbooks, exercício de restauração. *Gate:* critérios da seção 26 atendidos, com evidências.

---

## 26. DEFINIÇÃO DE PRONTO (SISTEMA FUNCIONAL)

Só é "pronto" quando, **com evidência verificável**:

- Um usuário se cadastra, verifica o e-mail, entra e recebe créditos fictícios.
- Compra cartelas e entra numa sala multiplayer; acompanha sorteio sincronizado; vence conforme regras verificáveis; recebe a premiação correta.
- Consulta histórico e verifica a justiça da partida (commit-reveal).
- Joga o bingo individual, vê regras, probabilidades, RTP e tabela de pagamentos.
- Reconecta sem perder estado; usa tudo em celular com desempenho dentro do orçamento.
- Admin gerencia salas, usuários e finanças, com auditoria e dupla aprovação.
- Saldos são contabilmente consistentes: **zero** créditos ou débitos duplicados; conciliação fecha.
- Testes essenciais passam; carga testada com resultados reais registrados; logs, métricas, alertas e runbooks existem.
- Visual com acabamento profissional, acessível e performático.
- Aviso de demonstração visível; módulo de dinheiro real **desativado** e protegido pelo checklist de conformidade.

---

## 27. REGRAS DE TRABALHO E RELATÓRIO DE FASE

### Regras
- Trabalhe em passos pequenos; rode testes antes de cada commit; não avance de fase sem gate.
- **Nunca marque algo como concluído sem mostrar a saída real dos comandos de teste.**
- Não afirme deploy sem URL e verificação (health check, smoke test).
- Se algo não ficou pronto, diga claramente (sem esconder em "melhorias futuras" o que era requisito).
- Registre cada decisão técnica relevante em ADR.
- Não copie assets, marcas ou interfaces proprietárias; use somente assets próprios, procedurais ou com licença registrada.

### Relatório ao final de cada fase (`docs/reports/fase-N.md`)
1. O que foi entregue (lista objetiva, com caminhos de arquivos).
2. Como rodar e como verificar (comandos exatos).
3. Saída dos testes (unidade, integração, e2e; cobertura).
4. Resultados de medições (desempenho, carga, matemática), quando aplicável.
5. Screenshots (fases com UI).
6. Decisões tomadas (links para ADRs).
7. Pendências e riscos conhecidos, honestamente.
8. Dúvidas que precisam de decisão humana.

---

## 28. QUANDO PEDIR APROVAÇÃO

Pare e pergunte **somente** se a decisão: (a) altera custos de forma relevante (provedor de nuvem, serviços pagos), (b) tem implicação legal/regulatória, (c) muda requisito de produto, (d) envolve ativar qualquer operação com valor real, ou (e) depende de asset/licença externa. Fora isso, decida, documente e siga.

---

## 29. INSTRUÇÃO FINAL

Comece pela **Fase 0**: entregue `ARCHITECTURE.md`, `ROADMAP.md`, `RISKS.md`, os ADRs iniciais e a lista de dúvidas bloqueantes, e **aguarde aprovação** antes de implementar a Fase 1. Mantenha em mente, durante todo o desenvolvimento, a visão das fases seguintes para que nada seja refeito.

Prioridade absoluta: **integridade do motor, segurança da carteira e qualidade verificável da experiência.**