# ADR 0003 — Commit-reveal e limites de confiança

Data: 2026-10-16

Status: Aceita para proposta

## Contexto

Seeds devem permitir auditoria sem antecipar bolas ao cliente.

## Decisão

CSPRNG de 32 bytes, HMAC-SHA256 separado por finalidade, Fisher-Yates e rejection sampling. roundId estável e hash de manifesto no contexto. Commitment antes de vender; reveal depois de liquidar.

## Consequências e alternativas

Operador ainda conhece a seed; hash de cartelas não é entropia independente. Beacon externo poderia reduzir controle, mas adiciona disponibilidade/trust e exige outro ADR. Sem alegação de certificação.
