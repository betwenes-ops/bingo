# Fase 7 — Admin e jogo responsável

Atualização: 2026-10-17. Gate integral ainda aberto; consulte [STATUS](../STATUS.md) e o relatório mais recente de acesso/operação. Execução autônoma autorizada pelo usuário.

## Implementado

Painel com MFA e papéis de operador, financeiro, suporte e auditor; publicação/recorrência de salas, pausa e cancelamento anterior ao sorteio com estorno; catálogo imutável, bloqueio de usuários, mudança de papéis, auditoria, conciliação, CSV financeiro e ajustes com segunda pessoa. Perfil possui limites, pausa, exclusão explícita, sessões, notificações, atendimento e exportação própria. O painel distingue worker ativo de provedor de e-mail configurado.

A busca de usuários foi corrigida para consultar toda a base por e-mail ou ID, com páginas de 100 e ordenação estável. O teste de banco cria mais de 100 contas de fixture para assegurar que uma conta antiga continua acessível. O navegador verifica busca por e-mail/ID e dupla aprovação financeira.

## Validação e limites

Testes de PostgreSQL verificam RBAC, CSRF, concorrência, idempotência, limites, exclusão, estorno e conciliação. O fluxo do admin com MFA, recorrência e segunda pessoa é executado em desktop e celular. IDs, execuções e resultados estão no STATUS e relatórios vinculados; existência do teste não equivale a aprovação de uma execução em andamento.

Acesso público exige as chaves reais de Turnstile e credenciais de e-mail, ainda não configuradas na última observação. Por instrução do usuário, CAPTCHA fica para a última etapa. Nenhuma proteção pública foi desativada para apresentar o cadastro como concluído. A revisão independente, política de retenção, fluxos de maior volume e observabilidade operacional completa continuam abertos. Dinheiro real não faz parte desta entrega.
