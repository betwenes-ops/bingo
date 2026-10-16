# ADR 0001 — Monólito modular e Drizzle

Data: 2026-10-16

Status: Aceita para proposta

## Contexto

Manter a stack do briefing e transações locais entre carteira e partida.

## Decisão

Drizzle com migrações SQL revisadas; Fastify com processos API e worker do mesmo código; PostgreSQL como fonte de verdade.

## Consequências e alternativas

Mais disciplina nas fronteiras e SQL manual para triggers/locks. Microserviços introduziriam transações distribuídas; Prisma é possível, mas não foi escolhido.
