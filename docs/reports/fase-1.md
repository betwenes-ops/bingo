# Fase 1 — Identidade, carteira e auditoria

Status: implementação inicial; gate integral **ainda aberto**. O usuário autorizou continuação autônoma, sem novas aprovações.

## Entrega e verificação

Cadastro, confirmação, recuperação, sessões, TOTP, carteira BIGINT, razão append-only e conciliação; privilégios SQL runtime separados.

Integração PostgreSQL real cobre concorrência, replay, rollback, soma zero, recuperação/MFA e permissões. Faltam reservas, ajustes com dupla aprovação, rotação periódica de sessão, LGPD e cobertura mínima da carteira/API.

Comandos exatos no README da raiz. Saídas reais, cobertura, matemática e limites em [relatório consolidado](implementation-2026-10-16.md); logs em evidence/ e capturas em ../screenshots/. Não atribuir cobertura do domínio à carteira/API. Não confundir simulação matemática de partidas com carga de jogadores concorrentes.

## Decisões, pendências e riscos

[ADRs](../adr/README.md), [roadmap](../ROADMAP.md) e [riscos](../RISKS.md). Nenhum requisito pendente foi tratado como concluído; funcionalidades listadas como faltantes continuam no escopo do briefing. Não há custo contratado, operação monetária ou URL de produção.
