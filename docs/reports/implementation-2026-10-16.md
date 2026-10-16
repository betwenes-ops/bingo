# Implementação inicial — 2026-10-16

## Entrega concreta

Monorepo em apps/web, apps/admin e apps/api; regras e RNG em packages/domain, schemas em packages/protocol e matemática exata em packages/bingo-math. Migrações SQL, Compose, Dockerfile, CI, testes de domínio, integração com PostgreSQL real/Testcontainers e Playwright. Instruções exatas no README.

Jogador: cadastro, confirmação, login/MFA, recuperação, carteira, lobby, compra de cartelas, sorteio, resultados e prova, bingo individual, limites, pausa e autoexclusão. Admin: MFA obrigatório, criação de salas, usuários em leitura, auditoria e conciliação. Nenhum ajuste manual de crédito foi exposto sem dupla aprovação.

O razão usa BIGINT e triggers diferidas para balanceamento; headers/entries são imutáveis e não recebem linhas depois do posting. O papel runtime do Compose não possui privilégios para alterar tabelas ou desabilitar triggers. Compra, débito e outbox são atômicos; disputa com fechamento trava a mesma partida. Advisory lock/uniques protegem avanço e retomada. Prêmios e débitos são liquidados na transação da decisão.

## Evidências locais

Saídas reais em evidence/typecheck.txt, evidence/lint.txt, evidence/build.txt e evidence/unit-coverage.txt. Testes: 23 testes locais de domínio, matemática, segurança HTTP e verificação independente; cartelas com 1.000 amostras por modalidade e teste estatístico de primeira posição com seed fixa. A cobertura reportada pelo executor refere-se ao núcleo de regras mostrado no relatório; não é cobertura de 90% da API/carteira.

Matemática: instant-math.json registra 1.000.000 de partidas, RTP teórico 0,9486071910554115 para participação 100, simulado 0,94437501, IC95% [0,9394111325415594; 0,9493388874584406]. Resultado compatível. Distribuição por maior pagamento; não somamos probabilidades marginais sobrepostas. Fonte e comando em scripts/simulate.ts.

Playwright verifica lobby, autenticação visual, aviso de demonstração, largura mobile e tela restrita do admin em 390×844 e 1440×900. Fluxos financeiros completos dependem da integração com banco; não chamar o smoke visual de E2E completo de jogo. Autocrítica visual: hierarquia, tema e estados estão presentes; a cena procedural ainda não possui física/tubo/voz ou medição no dispositivo-alvo. Erros de API são mostrados, não substituídos por salas simuladas.

## Limites e gates abertos

Não há Docker nem PostgreSQL utilizável neste executor. O teste nativo encontrou restrição de troca de UID; não houve execução local de Testcontainers. O primeiro CI verde foi verificado no run 38907232218, commit 2db19b36a0e0c6e6ea93fc32c6572fed4a1bed6b: 13 testes de integração reais passaram, incluindo compra concorrente, rollback, reembolso e kill do worker. Logs integrais em evidence/ci-first-green.txt. Uma regressão encontrada no primeiro run (evento final após congelar estado terminal) foi corrigida e revalidada. Docker Compose não foi executado localmente. Não existe URL pública nem deploy.

Fases 0–8 permanecem com itens abertos: falta executar o Compose completo e ampliar a cobertura da API/carteira; identidade sem rotação automática de sessão e fluxo LGPD completo; reservas, prêmio fixo, ajustes com dupla aprovação; catálogo/versionamento administrável; ciclo de estados completo; Redis fan-out consumidor, snapshots periódicos; segurança/matemática completas; som/PWA/perfis/FPS/Lighthouse; relatórios avançados, suporte e carga/restauração. Não foi comprovada capacidade para 10.000 jogadores.

Nenhuma pendência depende de nova aprovação para continuar a implementação. Custos, provedores e ativação monetária não foram assumidos. Dinheiro real permanece indisponível, inclusive no boot.
