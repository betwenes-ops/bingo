# Operação da demonstração

Somente créditos fictícios. O runtime mantém o dinheiro real desabilitado.

## Papéis e autenticação

Todas as rotas administrativas exigem sessão com MFA validado. `superadmin` opera todos os controles. `operator` cria/controla salas, agenda recorrência e habilita modalidades. `finance` solicita/aprova ajustes, consulta fundos e relatórios e executa conciliação. `support` bloqueia jogadores e responde atendimento. `auditor` consulta trilhas e relatórios. A promoção inicial continua sendo um comando de infraestrutura; alterações posteriores de papel usam `/v1/admin/users/:id/role`, exigem superadmin, motivo e revogam as sessões do usuário alterado.

## Créditos e prêmio fixo

No painel **Financeiro**, informe UUID do jogador, créditos inteiros positivos/negativos e motivo. O solicitante não pode aprovar sua própria solicitação. Outra conta com MFA e papel financeiro decide e justifica. A aprovação repetida não duplica lançamentos. Débito sem saldo reverte a transação e mantém a solicitação pendente. Nenhum ajuste altera registros anteriores.

Para abastecer o fundo fictício, deixe o usuário vazio. A API exige valor positivo e a mesma dupla aprovação. Consulte `/v1/admin/treasury` para saldos e reservas.

`POST /v1/admin/rooms` aceita `prizePolicy: "fixed"` e `fixedPrize` em centésimos de crédito. A abertura reserva o montante integral do fundo da casa em uma conta da rodada. Sem saldo, a criação reverte. Vendas não aumentam o prêmio fixo. Cancelamento anterior ao sorteio estorna compras e devolve a reserva; conclusão consome a reserva. Resultados concluídos não podem ser alterados.

## Rodadas e recorrência

`POST /v1/admin/rounds/:id/control` recebe `action` (`pause`, `resume`, `cancel`) e `reason`. Pausa bloqueia novas compras; o relógio de fechamento permanece o publicado. Cancelamento é aceito somente antes de começar o sorteio. `startsInSeconds` agenda a abertura de uma sala; a configuração publicada não pode ser editada.

`POST /v1/admin/schedules` recebe `config` (mesmo objeto de criação de sala), `intervalSeconds`. O worker cria salas em transações com lock e avança o próximo horário. `/v1/admin/schedules/:id/status` habilita/desabilita a recorrência. Falhas de agendamento são registradas e não interrompem o avanço das rodadas existentes.

Versões e modelos matemáticos publicados são imutáveis. `/v1/catalog` publica configurações e relatórios. `/v1/admin/catalog/availability` altera somente a disponibilidade para novas publicações, com motivo auditado. Rodadas já publicadas mantêm suas regras.

## Atendimento e dados pessoais

O perfil do jogador oferece histórico, download JSON dos próprios dados e abertura/leitura de atendimento privado. Operadores de suporte respondem por `/v1/admin/support/:id/reply`. `/v1/me/notifications` expõe notificações somente ao titular.

`POST /v1/me/anonymize` exige senha, confirmação literal `EXCLUIR MINHA CONTA` e TOTP quando habilitado. Substitui e-mail e senha, remove credenciais MFA/tokens/sessões, interrompe novas participações e remove identificação dos e-mails enfileirados. Razão, cartelas e auditoria preservam o UUID pseudônimo. Texto livre previamente enviado ao atendimento permanece retido: a política de retenção e eventual redação de dados sensíveis ainda requerem revisão antes de publicação pública. Não anunciar anonimização integral ou conformidade LGPD certificada.

## Backup e restauração

No ambiente local, com os serviços iniciados:

```sh
docker compose exec -T postgres pg_dump -U bingo -Fc bingo > bingo-backup.dump
docker compose exec -T postgres createdb -U bingo restore_check
docker compose exec -T postgres pg_restore -U bingo -d restore_check < bingo-backup.dump
docker compose exec -T postgres psql -U bingo -d restore_check -c 'SELECT count(*) FROM schema_migrations'
docker compose exec -T postgres dropdb -U bingo restore_check
```

O CI executa esses comandos em banco separado, após subir o Compose e testar HTTP da API, web e admin. Isso valida restauração estrutural; não substitui uma estratégia operacional de retenção, criptografia e armazenamento externo. Preserve separadamente a chave de criptografia de seeds para recuperar rodadas em andamento. Não copie dados pessoais para logs e não envie backups para o repositório.
