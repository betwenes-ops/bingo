# ADR 0005 — Demo isolada e hospedagem persistente

Data: 2026-10-16

Status: Parcial: local aceito, provedor pendente

## Contexto

Não há orçamento nem autorização para serviço pago; motor requer processos persistentes.

## Decisão

Docker Compose local; API/WS/worker persistentes, Next.js em contêineres inicialmente, CDN futura. Payments indisponível; boot rejeita dinheiro real. Provedor, região e custo precisam de aprovação antes de criar recursos.

## Consequências e alternativas

Sem deploy nesta fase. Compliance-gate documental não é autorização automática nem suficiente para operação monetária.
