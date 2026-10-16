# Fase 8 — Validação e publicação

Status: implementação inicial; gate integral **ainda aberto**. O usuário autorizou continuação autônoma, sem novas aprovações.

## Entrega e verificação

CI com PostgreSQL real/Testcontainers, testes de navegador, build, auditoria e artefatos.

Nenhum deploy público. Carga progressiva, segurança completa, observabilidade, runbooks e restauração ainda pendentes. Capacidade não foi medida; não há promessa de 10.000 jogadores.

Comandos exatos no README da raiz. Saídas reais, cobertura, matemática e limites em [relatório consolidado](implementation-2026-10-16.md); logs em evidence/ e capturas em ../screenshots/. Não atribuir cobertura do domínio à carteira/API. Não confundir simulação matemática de partidas com carga de jogadores concorrentes.

## Decisões, pendências e riscos

[ADRs](../adr/README.md), [roadmap](../ROADMAP.md) e [riscos](../RISKS.md). Nenhum requisito pendente foi tratado como concluído; funcionalidades listadas como faltantes continuam no escopo do briefing. Não há custo contratado, operação monetária ou URL de produção.
