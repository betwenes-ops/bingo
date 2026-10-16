# ADR 0006 — Orçamento inicial de frontend

Data: 2026-10-16

Status: Proposta para Fase 5

## Contexto

Lobby deve carregar rápido sem depender de 3D.

## Decisão

JS inicial do lobby ≤250 KiB gzip transferidos, incluindo framework e chunks iniciais, excluindo cena lazy; medir build e navegação fria em mobile 4G. Cena 3D apenas na sala; perfis com fallback 2D.

## Consequências e alternativas

Orçamento é alvo ainda não medido. Gates de FPS/Lighthouse/LCP/CLS do briefing permanecem; redução de efeitos não pode ocultar informações do jogo.
