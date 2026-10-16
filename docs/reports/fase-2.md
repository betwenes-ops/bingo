# Fase 2 — Domínio e RNG

Status: implementação inicial; gate integral **ainda aberto**. O usuário autorizou continuação autônoma, sem novas aprovações.

## Entrega e verificação

Cartelas 75/80/90, padrões, rateio, CSPRNG/HMAC/rejection sampling, seeds cifradas e verificador independente.

Testes de propriedades por modalidade, uniformidade básica e reprodução Node/WebCrypto passaram. Faltam a bateria estatística completa e plano de certificação independente.

Comandos exatos no README da raiz. Saídas reais, cobertura, matemática e limites em [relatório consolidado](implementation-2026-10-16.md); logs em evidence/ e capturas em ../screenshots/. Não atribuir cobertura do domínio à carteira/API. Não confundir simulação matemática de partidas com carga de jogadores concorrentes.

## Decisões, pendências e riscos

[ADRs](../adr/README.md), [roadmap](../ROADMAP.md) e [riscos](../RISKS.md). Nenhum requisito pendente foi tratado como concluído; funcionalidades listadas como faltantes continuam no escopo do briefing. Não há custo contratado, operação monetária ou URL de produção.
