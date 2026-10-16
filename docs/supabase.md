# Supabase do bingo

Projeto dedicado existente: `bingo` (`pjsngxhbxdykcydzcjhi`), região `us-east-1`, PostgreSQL 17. Schema privado `bingo`, com 34 tabelas, as três migrações da aplicação e RLS em todas as tabelas. Não foram alterados os schemas `auth`, `storage` ou `public`, nem as permissões dos serviços do Supabase.

O banco preserva a autenticação da API Fastify. Não utiliza Supabase Auth nem acesso de carteira pelo navegador. As roles `anon` e `authenticated` não possuem USAGE no schema `bingo`. O papel `bingo_runtime` não possui LOGIN, BYPASSRLS nem privilégios de migração; há políticas de acesso somente para o backend, que continua responsável por validar cada sessão, papel e titularidade.

## Ligação da API e worker

Configure no ambiente privado do servidor:

- `DATABASE_URL`: conexão PostgreSQL do projeto com credencial de execução e TLS validado. Use conexão direta ou pooler em modo sessão para serviços persistentes. A credencial não deve aparecer no repositório, frontend ou logs.
- `DATABASE_SCHEMA=bingo`.
- A chave persistente `SEED_ENCRYPTION_KEY`, Redis e SMTP continuam necessários; preserve a chave para recuperar rodadas.

A API e o worker ainda não foram implantados publicamente nem conectados ao projeto com uma credencial de execução. O conector não fornece a senha PostgreSQL. A role criada é NOLOGIN, portanto não constitui uma credencial pronta para uso. Não usar o proprietário `postgres` como usuário permanente da aplicação. A credencial restrita deve ser provisionada no destino durante a implantação.

`deploy/supabase-bootstrap.sql` registra a instalação reproduzível em schema novo. Execute o arquivo integralmente dentro de uma transação, após conferir o destino; a instalação rejeita schema existente. Os arquivos originais continuam em `apps/api/migrations`, e `schema_migrations` já contém os nomes corretos para que o runner da aplicação não tente reaplicar a base. Migrações futuras devem preservar RLS/políticas/permissões no schema privado.

## Verificações realizadas no serviço

- 34/34 tabelas com RLS; três migrações da aplicação registradas.
- Zero usuários cadastrados; nenhuma conta/senha de demonstração criada no serviço.
- Acesso de schema para `anon` e `authenticated`: ambos falsos.
- Transação contábil balanceada aceita e mutação do razão rejeitada por `APPEND_ONLY`; teste feito pela conexão administrativa e integralmente revertido. Nenhum lançamento de teste permaneceu.
- Advisors de segurança executados após a instalação. Consulte o relatório mais recente no projeto; não equivale a uma certificação independente.
- Teste da conta runtime pela conexão MCP não foi concluído: SET ROLE não é permitido sem associação de papéis. A tentativa de conceder o papel à conexão administrativa foi bloqueada pela revisão automática e não foi aplicada. A verificação de ponta a ponta com a credencial de execução permanece para a implantação.

## Histórico da revisão automática

A proposta inicial de instalar em `public` e revogar permissões gerais foi bloqueada. Foi substituída por instalação em schema privado sem mudanças às permissões existentes. A concessão do papel runtime a `postgres`, proposta apenas para testar a role, também foi bloqueada e abandonada; nenhuma associação foi alterada. O banco foi verificado com testes transacionais administrativos e consultas de permissões, sem contornar esses bloqueios.

O Supabase atende à persistência. O motor persistente, WebSocket e worker continuam exigindo hospedagem própria; não foram movidos para Edge Functions.
