# Fase 3 — Multiplayer

Status: implementação inicial; gate integral **ainda aberto**. O usuário autorizou continuação autônoma, sem novas aprovações.

## Entrega e verificação

Compra atômica com fechamento, scheduler PostgreSQL, advisory lock, eventos/outbox, WS/replay, premiação e recuperação.

Testes reais de kill do processo e E2E desktop/mobile passaram. Faltam ciclo completo de estados, snapshots periódicos, gateway consumidor Redis e otimizações/fan-out medidos.

Comandos exatos no README da raiz. Saídas reais, cobertura, matemática e limites em [relatório consolidado](implementation-2026-10-16.md); logs em evidence/ e capturas em ../screenshots/. Não atribuir cobertura do domínio à carteira/API. Não confundir simulação matemática de partidas com carga de jogadores concorrentes.

## Decisões, pendências e riscos

[ADRs](../adr/README.md), [roadmap](../ROADMAP.md) e [riscos](../RISKS.md). Nenhum requisito pendente foi tratado como concluído; funcionalidades listadas como faltantes continuam no escopo do briefing. Não há custo contratado, operação monetária ou URL de produção.
