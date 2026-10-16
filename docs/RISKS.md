# Registro inicial de riscos

Status: análise de projeto, mitigação ainda não implementada. Severidade considera impacto potencial na demo. Responsáveis são papéis a atribuir, não pessoas presumidas.

| Risco                                     | Nível / responsável | Mitigação e prova exigida                                                                                                                |
| ----------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Duplo débito ou saldo negativo            | Crítico / backend   | Locks ordenados, BIGINT, constraints, idempotência atômica; duas compras simultâneas e falhas antes/depois do commit                     |
| Compra após congelamento                  | Crítico / motor     | Lock compartilhado com fechamento e hora do banco; teste concorrente de fronteira                                                        |
| Contabilidade desbalanceada               | Crítico / carteira  | Trigger diferida entre linhas, papel restrito, compensações; transação incompleta rejeitada no commit e conciliação após carga           |
| Prêmio repetido/parcial                   | Crítico / carteira  | Unique award e chave por liquidação; crédito e estado atômicos; kill em cada ponto de falha                                              |
| Dois schedulers ou bola perdida           | Crítico / motor     | Advisory lock transacional + row lock e uniques; matar processo com dois workers e reconstruir replay                                    |
| Redis/outbox perder/duplicar evento       | Alto / operação     | Outbox transacional, entrega ao menos uma vez, dedupe e replay durável; desligar Redis e repetir publicação                              |
| Deadlocks em compras e payouts            | Alto / backend      | Ordem global de locks, lotes e retry limitado; carga concorrente com débito×crédito e timeout                                            |
| Seed futura exposta                       | Crítico / segurança | Cifra autenticada, chave externa, logs redigidos e DTOs permitidos; inspeção de HTTP/WS/logs antes de reveal                             |
| Operador conhece seed/aborta              | Alto / segurança    | Commit-reveal não elimina abuso do operador; trilha de cancelamentos e regra fixa; avaliar entropia independente sem alegar certificação |
| RNG com viés/serialização diferente       | Alto / matemática   | Rejection sampling e formato canônico versionado; vetores independentes e propriedades                                                   |
| RTP calculado com padrões sobrepostos     | Alto / matemática   | Partição pelo maior pagamento, cálculo conjunto exato e simulação com IC; bloquear tabela ilustrativa                                    |
| Fundo insuficiente/erro de arredondamento | Crítico / carteira  | Reserva antes das vendas, inteiros, percentuais em bps e resto determinístico; soma paga=fundo alocado                                   |
| IDOR, sessão roubada, admin indevido      | Crítico / segurança | RBAC por recurso, cookies seguros, CSRF/Origin, TOTP e revogação; testes cruzados de contas/papéis                                       |
| Bypass de autoexclusão ou limites         | Alto / compliance   | Validar dentro da transação, não só UI; compras simultâneas e sessão antiga bloqueadas                                                   |
| Replay mistura dados privados             | Alto / backend      | Stream público sem saldo/PII, canal privado autorizado e cursor próprio; testes com usuário estranho                                     |
| Falta de cópia recuperável                | Alto / operação     | Backups segregados e restauração isolada; medir RPO/RTO antes de prometer SLA                                                            |
| Anonimização destrói auditoria            | Alto / privacidade  | Separar PII de IDs do razão e política de retenção; revisão antes da demo pública                                                        |
| 3D ruim no celular/vazamento              | Alto / frontend     | Lazy, orçamento, perfis e dispose; sessão longa e fallback testados em aparelho real                                                     |
| 10.000 jogadores excedem recursos         | Alto / operação     | Carga gradual, backpressure, índices e fan-out medidos; documentar limite observado e custo antes de escalar                             |
| Demo confundida com dinheiro              | Alto / produto      | Aviso fixo, sem conversão/resgate, adaptadores ausentes e boot fail-closed; testes em todas as rotas/telas                               |
| Dependência/asset inseguro ou sem licença | Alto / engenharia   | Lockfile, auditoria, scanner de segredos e inventário de licenças; sem download de asset sem revisão                                     |

## Condições de parada

Divergência de razão, pagamento duplicado, seed vazada ou quebra de autorização bloqueiam gate e novas vendas afetadas. Preservar eventos e obrigações; recuperar sem editar resultados históricos. Nenhum ambiente será apresentado como certificado ou apto a dinheiro real.
