# Fase 8 — Validação e publicação

Atualização: 2026-10-17. Gate integral ainda aberto. Execução autônoma autorizada pelo usuário.

## Implementado e observado

CI instala por lockfile, verifica padrões de segredos, formatação, lint, tipos, testes locais, PostgreSQL real, navegador desktop/celular, build, auditoria, Compose completo e restauração estrutural de backup. Os artefatos incluem evidências de navegador e carga. [Carga medida](../load-test-results.md) registra estágios de 100, 500 e 1.000 clientes com compras e prova final, sem divergências na execução registrada; não é medição da capacidade da hospedagem pública.

Railway possui jogador, API/WebSocket, administração, worker persistente e Redis autenticado com volume. Todos foram observados em SUCCESS e o heartbeat do worker foi comprovado no Supabase. Endereços e instruções atuais estão em [railway.md](../railway.md). O admin foi publicado após autorização explícita adicional; não foi criada conta padrão nem removido MFA. O banco usa schema privado com RLS. Existem runbooks e definições versionadas de métricas/alertas, ainda sem coletor/canal de alerta implantados.

## Gates abertos

Envio real de e-mails, configuração final de Turnstile e fluxo público autenticado de ponta a ponta aguardam credenciais externas. A interface pública disponível não comprova cadastro e entrega de e-mail. Continuam pendentes autenticação de serviço para coleta de métricas, observabilidade distribuída, chaveiro/rotação de seeds e MFA, revisão independente, comprovação da credencial SQL restrita e restauração do banco público.

Não foram medidos 5.000/10.000 participantes, CPU/RAM sob carga da hospedagem, operação distribuída, redes móveis ou 50 fps em dispositivo-alvo. Não há certificação ou promessa de capacidade. Os relatórios distinguem dados medidos de testes apenas configurados. Dinheiro real permanece indisponível.
