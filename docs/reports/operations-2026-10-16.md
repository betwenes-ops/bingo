# Continuação: integridade e operação

## Alterações entregues

- Migração 0003: papéis financeiros/suporte, versões e modelos matemáticos imutáveis, máquina de estados completa, snapshots, reservas, dupla aprovação, atendimento, notificações e recorrência.
- Ajustes com solicitante diferente do aprovador, aprovação idempotente, bloqueio de saldo negativo e auditoria. Interface financeira no admin.
- Prêmio fixo reservado antes da abertura, fundo fictício com dupla aprovação, cancelamento com estorno e liberação da reserva.
- Padrões configuráveis 75/80, prêmios sequenciais 90, regras/versionamento congelados, trilha das transições e snapshots periódicos.
- Agendamento de abertura e recorrência transacional; falha de agendamento não interrompe rodadas em andamento.
- APIs administrativas de bloqueio/papéis, disponibilidade de jogos, relatórios/CSV e atendimento; papéis e MFA validados nas mutações.
- Histórico, atendimento e download pessoal no perfil; APIs de notificações, rotação de sessão e desativação pseudonimizada com senha/MFA.
- CI adicional: build e inicialização do Compose completo, HTTP de API/web/admin e backup/restauração em banco separado.

## Validação

O CI do commit de código 325af8bd23916f338e9f440cfc147a622de340d7 está em https://github.com/betwenes-ops/bingo/actions/runs/38916686004. Os resultados finais ficam em STATUS.md. Testes de integração usam PostgreSQL real e incluem novos cenários de dupla aprovação, estorno de prêmio fixo, imutabilidade, isolamento do atendimento/exportação, desativação e conclusão verificável de bingo 80 e 90. Os testes de navegador existentes validam os fluxos completos do jogador em desktop e celular; ainda não cobrem todos os novos formulários administrativos.

## Limites que permanecem

A entrega não encerra todos os gates de PROJECT_BRIEF.md. O gateway WebSocket ainda usa replay por consulta, sem consumir o fan-out Redis publicado pelo worker. Carga progressiva, observabilidade completa, filas mais sofisticadas, PWA, áudio/cenas avançados, medição real de desempenho e revisões independentes continuam abertos. Parte dos controles administrativos e a desativação ainda estão disponíveis somente pela API. Textos livres de atendimento permanecem retidos; não há alegação de anonimização integral ou conformidade certificada.

A restauração estrutural do banco testada em CI não substitui política de backups externos, retenção e recuperação com a chave de seeds. Não existe deploy público: destino, acesso e orçamento de hospedagem não estão configurados. Nenhum serviço pago foi contratado. Dinheiro real permanece desabilitado.
