# Carga medida em ambiente isolado

[CI 38962117984 aprovado](https://github.com/betwenes-ops/bingo/actions/runs/38962117984), commit `f8e3756df96dc376a921b4618c0fee1b9fc850b5`, 2026-10-16. Clientes WebSocket reais conectaram a uma sala, compraram cartelas por HTTP e acompanharam sorteio/premiação com PostgreSQL e Redis reais.

| Participantes | Concluíram | Entregas de bolas | Lacunas | Duplicações | Divergências contábeis | p50 / p95 / p99 de entrega |
| ------------- | ---------- | ----------------- | ------- | ----------- | ---------------------- | -------------------------- |
| 100           | 100        | 6.100             | 0       | 0           | 0                      | 12 / 29 / 212 ms           |
| 500           | 500        | 30.000            | 0       | 0           | 0                      | 30 / 132 / 331 ms          |
| 1.000         | 1.000      | 56.000            | 0       | 0           | 0                      | 50 / 349 / 559 ms          |

Prova final válida nos três estágios. Durações: 2.652, 77.587 e 225.296 ms, respectivamente, incluindo pausas internas entre lotes; a pausa inicial de cada estágio não entra nesse cronômetro. Relógio do sorteio acelerado. Cada rodada usa RNG próprio, portanto números de bolas entregues diferem. A conciliação compara saldo em cache com soma do razão e verifica o total de carteiras após os prêmios. [Dados JSON extraídos do log real](reports/evidence/load-2026-10-16.json); os originais estão no artefato verification-evidence do workflow.

O script `apps/api/src/load-smoke.ts` admite somente ambiente test, API em localhost e banco descartável chamado bingo_e2e. A bateria executou estágios de 100, 500 e 1.000 com chegadas em lotes e pausas de 66 segundos, respeitando o limite por IP de produção. O limite não foi desativado. O CI também passou em 31 testes locais, 23 integrações PostgreSQL, 10 testes de navegador, build, auditoria, Compose e restauração.

Esses clientes são processos WebSocket sintéticos, não navegadores renderizando 3D. Há uma única instância de API e uma sala; relógio acelerado e infraestrutura do runner diferem da hospedagem pública. Não foram medidas CPU/memória, capacidade contínua, redes móveis ou múltiplas instâncias. Não extrapolar para 5.000/10.000 clientes nem declarar certificação de capacidade de produção.

Execução anterior com 100 participantes, commit 77a026f, também passou: 6.300 entregas, nenhuma divergência e latências 30/50/198 ms, duração 3.914 ms. O resultado atual é outra rodada aleatória, não uma repetição estatística selecionada para melhorar percentis.

## Revalidação em 2026-10-17

[Execução 39025959363](https://github.com/betwenes-ops/bingo/actions/runs/39025959363), commit a1ba061, aprovada com as correções de acesso e busca administrativa.

| Participantes | Concluíram | Entregas de bolas | Lacunas / duplicações / divergências | p50 / p95 / p99   |
| ------------- | ---------- | ----------------- | ------------------------------------ | ----------------- |
| 100           | 100        | 6.700             | 0 / 0 / 0                            | 10 / 29 / 177 ms  |
| 500           | 500        | 30.500            | 0 / 0 / 0                            | 26 / 95 / 327 ms  |
| 1.000         | 1.000      | 58.000            | 0 / 0 / 0                            | 48 / 249 / 491 ms |

Provas válidas. Mesma limitação de escopo: clientes sintéticos em runner isolado, chegadas espaçadas e relógio acelerado. Os valores de rodadas aleatórias não são uma comparação controlada de performance nem uma promessa para a hospedagem pública. [JSON real](reports/evidence/access-operations-2026-10-17.json).
