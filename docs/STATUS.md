# Estado verificável da entrega

Atualizado em 2026-10-17. [Bateria integral aprovada](https://github.com/betwenes-ops/bingo/actions/runs/39025959363), commit `a1ba06150c9534fdbb208b7d2df895ef83cfddf5`: **71 testes e carga progressiva até 1.000 clientes**. Reenvio de confirmação, concorrência de senha/tokens, diagnóstico SMTP e busca administrativa em toda a base foram corrigidos. O teste adicional de SMTP real com worker/Mailpit, confirmação, login e crédito único também passou no job Compose [39026546077](https://github.com/betwenes-ops/bingo/actions/runs/39026546077). [Relatório da revisão](reports/access-operations-2026-10-17.md).

| Verificação executada                                     | Resultado integral aprovado                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Instalação por lockfile, formatação, lint e TypeScript    | Passou                                                                     |
| Domínio, matemática, HTTP, segurança e proxy              | 32 testes passaram                                                         |
| PostgreSQL real/Testcontainers                            | 27 testes passaram                                                         |
| Navegador desktop/celular                                 | 12 testes passaram                                                         |
| Build, Compose e restauração estrutural                   | Passou                                                                     |
| Auditoria de dependências                                 | Sem vulnerabilidades conhecidas nessa execução                             |
| Carga isolada de 100, 500 e 1.000 clientes WS com compras | Sem lacunas, duplicação ou divergência financeira                          |
| SMTP completo no Compose                                  | Recebimento, confirmação, login, crédito único e recusa de replay passaram |
| Matemática exata × 1.000.000 de simulações                | Compatível com IC95% no relatório existente                                |

O navegador testa jogo completo, MFA administrativo, recorrência, aprovação financeira por segunda pessoa e recuperação offline. Redis já participa do fan-out com replay durável; a página usa conexão WSS direta com ticket temporário. Existem interfaces de operação, suporte, segurança/privacidade, sessões, notificações, PWA offline, áudio opcional e qualidade gráfica adaptativa. Fundos de prêmios fixos são reservados sem comprometer valores ainda reembolsáveis de outras rodadas.

## Hospedagem observada

[Jogador público](https://bingoweb-production-8b1f.up.railway.app/) e [API](https://bingoapi-production-e17b.up.railway.app/ready) respondem. O erro 500 do proxy de salas foi corrigido. Uma regressão 502 após a mudança de porta foi corrigida preservando as portas dos domínios existentes; o commit seguinte alterou pacotes observados pelos filtros e os deploys Railway web/admin concluíram com sucesso. HTTP público voltou a 200 para lobby, proxy de salas e configuração de segurança. O Supabase contém quatro migrações e 35/35 tabelas com RLS no schema privado; advisors de segurança sem avisos na última consulta. Nenhum usuário de teste foi criado no banco público.

**A operação pública não está concluída:** CAPTCHA obrigatório sem chave/configuração pronta impede cadastro; faltam SMTP_URL e MAIL_FROM reais para confirmação por e-mail. A integração Railway foi conectada: worker persistente criado, heartbeat saudável confirmado no Supabase e Redis 8.2 com volume provisionado. O probe do worker confirmou conexão autenticada ao Redis. Credencial SQL restrita e fluxo público completo ainda exigem validação. Após autorização explícita adicional do usuário, o admin foi publicado em https://bingoadmin-production.up.railway.app; a página responde 200 e operação administrativa sem sessão responde 401. A origem exata foi liberada na API; MFA continua obrigatório. [Passos concretos](railway.md).

## Gates ainda abertos

Não há certificação ou liberação de dinheiro real. Não foram medidos 5.000/10.000 participantes, capacidade real da hospedagem, 50 fps em celular intermediário, operação distribuída nem restauração do banco público. Coletor de métricas, canal de alertas, autenticação de serviço para scrape, rotação com chaveiro de seeds/MFA, CSP estrita com nonce, instrumentação distribuída completa e revisão independente continuam pendentes. Retenção de dados e entrega integral do briefing exigem revisão própria; os relatórios por fase preservam os gates históricos.

[Relatório da continuação](reports/completion-2026-10-16.md) · [Carga](load-test-results.md) · [Runbooks](runbooks/operacao.md) · [Supabase](supabase.md).
