# ADR 0002 — Consistência, outbox e recuperação

Data: 2026-10-16

Status: Aceita para proposta

## Contexto

Quedas e múltiplas instâncias não podem perder sorteios nem duplicar créditos.

## Decisão

Locks transacionais PostgreSQL e ordem global; outbox ao menos uma vez, consumers idempotentes; replay do banco, Redis apenas distribuição/presença.

## Consequências e alternativas

Exactly-once no transporte não é prometido. Constraints e efeitos idempotentes garantem unicidade contábil; testar queda entre commit e publish.
