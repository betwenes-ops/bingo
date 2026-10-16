# Operação pública no Railway

Estado observado em 2026-10-16. O repositório já está ligado a serviços públicos; isso não confirma todos os requisitos de operação.

- Jogador: https://bingoweb-production-8b1f.up.railway.app/
- API: https://bingoapi-production-e17b.up.railway.app
- Supabase: projeto `pjsngxhbxdykcydzcjhi`, schema privado `bingo`.

O proxy HTTP público voltou a responder 200. A API responde `/ready`. O cadastro permanece bloqueado corretamente por CAPTCHA sem configuração completa; o estado público de segurança informa `required: true, siteKey: null, ready: false`. Não foi criada conta pública de teste. Depois da conexão da integração Railway, o worker foi criado, concluiu o deploy e registra heartbeat saudável no Supabase. Redis 8.2 com volume persistente de 500 MB foi provisionado; o probe do worker confirmou autenticação e PING. Não abrir cadastros/vendas antes de configurar CAPTCHA e entrega real de e-mail.

## Serviços persistentes

Todos usam o Dockerfile da raiz e o repositório completo. Em projetos novos, os aplicativos Next respeitam `PORT` fornecida pela plataforma. O perfil do projeto Railway existente preserva as portas 3000/3001 às quais os domínios já estavam ligados; `NEXT_PORT` permite uma substituição explícita. Ao trocar a porta, atualize também a porta de destino do domínio no Railway. Configure o comando inicial de cada serviço:

| Serviço       | Comando                            | Domínio público                                         |
| ------------- | ---------------------------------- | ------------------------------------------------------- |
| Jogador       | `pnpm --filter @bingo/web start`   | Sim                                                     |
| Administração | `pnpm --filter @bingo/admin start` | Não nesta implantação; acesso privado e MFA obrigatório |
| API/WebSocket | `pnpm --filter @bingo/api start`   | Sim, HTTPS/WSS                                          |
| Worker        | `pnpm --filter @bingo/api worker`  | Não                                                     |

Para um novo deploy, aplique migrações com `pnpm db:migrate` usando credencial de migração em etapa separada antes de iniciar a versão dependente. O Supabase já contém as quatro migrações atuais. Não reaplicar bootstrap sobre schema existente. Não incluir banco ou chave de seeds na etapa de build. Certifique-se de que mudanças na raiz, packages e apps disparam novo deploy; filtros de arquivos que excluam Dockerfile/configuração podem manter versões antigas.

## Variáveis privadas e públicas

| Destino         | Variáveis e requisito                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API e worker    | `DATABASE_URL` com TLS e credencial restrita, `DATABASE_SCHEMA=bingo`, `REDIS_URL`, mesma `SEED_ENCRYPTION_KEY` persistente de 64 caracteres hexadecimais |
| API e worker    | `NODE_ENV=production`, `REAL_MONEY_ENABLED=false`, `TURNSTILE_BYPASS=false`, `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY`                                     |
| API e worker    | `PUBLIC_WEB_URL` com URL HTTPS do jogador, `ALLOWED_ORIGINS` com origens exatas do jogador e admin separadas por vírgulas, sem barra final                |
| Worker          | `SMTP_URL` do provedor e `MAIL_FROM` com remetente autorizado; mantenha as outras variáveis exigidas pela configuração compartilhada                      |
| Jogador e admin | `API_INTERNAL_URL` com URL acessível da API em runtime; pode ser a URL HTTPS pública                                                                      |
| Jogador         | `API_PUBLIC_URL` com URL HTTPS pública da API para conectar diretamente por WSS                                                                           |
| Jogador e admin | `TURNSTILE_SITE_KEY` pública, também pode vir do endpoint de configuração da API; nunca copiar o secret CAPTCHA para frontend                             |

O Dockerfile local deixa NODE_ENV em development para a demonstração Compose; o serviço público deve substituí-lo por production depois de configurar CAPTCHA. O bootstrap rejeita production sem secret ou com bypass. O perfil `deploy/railway-demo.json` apenas reconhece as origens exatas do projeto existente; não provisiona serviços nem substitui variáveis de uma implantação nova. Cookies tornam-se Secure quando a URL pública usa HTTPS.

## Critérios antes de disponibilizar cadastros e vendas

1. `/ready` retorna 200 e `/api/v1/rooms` no jogador também. `/api/security-config` deve informar `ready: true` e a chave pública correta.
2. Worker aparece saudável no admin e em `bingo.worker_heartbeats`, Redis conecta e a outbox esvazia.
3. Uma conta própria recebe o e-mail real de verificação, confirma e recebe exatamente um crédito inicial. Verificar recuperação, logout e revogação sem expor tokens.
4. Promover uma conta verificada com `pnpm --filter @bingo/api exec tsx src/promote-admin.ts EMAIL` em terminal privado do serviço; ativar TOTP. Não existe admin/senha padrão.
5. Criar uma rodada de créditos fictícios pelo admin, comprar com contas de teste, acompanhar início automático, final, carteira, prova e conciliação. Validar que reconexão retoma eventos sem duplicar compra.
6. Verificar backup restaurável, retenção do plano, limites de recursos, logs, domínio remetente e alertas. As definições em infra ainda precisam de coletor e destino de alerta.

A integração Railway foi conectada e utilizada: worker e Redis foram criados; referências privadas ligam banco e chave de seeds existentes da API ao worker, sem revelar os valores ao conector. API e worker usam REDIS_URL do serviço Redis. Web/admin receberam a URL da API e PORT explícita 3000/3001, compatível com healthchecks e domínio existente, além de NODE_ENV=production no Next. Filtros de deploy agora incluem apps, packages, scripts, deploy e arquivos de configuração do workspace. Não foram inventados tokens, alterados CAPTCHA para bypass ou criadas contas verificadas por SQL. A credencial SQL restrita ainda deve ser comprovada; o conector OAuth retorna nomes de variáveis sem valores, portanto não permite inspecionar a credencial existente. Consulte [runbooks](runbooks/operacao.md).

## Ativação restante: credenciais externas

Insira os segredos diretamente na aba Variables do serviço Railway; não os publique em GitHub, screenshots ou conversa.

1. Cloudflare Turnstile: criar/configurar widget para `bingoweb-production-8b1f.up.railway.app`. Na API, definir `TURNSTILE_SITE_KEY` pública, `TURNSTILE_SECRET` privada e `TURNSTILE_BYPASS=false`. O frontend consulta a chave pública em runtime; não precisa rebuild para trocar a chave. Nunca usar chaves de teste para declarar proteção pública pronta.
2. Provedor de e-mail: definir `SMTP_URL` com autenticação/TLS e `MAIL_FROM` com remetente autorizado na API e no worker. Também é possível definir na API e referenciar no worker com `${{@bingo/api.SMTP_URL}}` e `${{@bingo/api.MAIL_FROM}}` depois de existirem. O Mailpit local não entrega mensagens reais.
3. Após existirem as chaves, definir `NODE_ENV=production` na API e worker, `TURNSTILE_BYPASS=false`, e fornecer as duas variáveis Turnstile ao worker pela configuração compartilhada. O worker não expõe login, mas a configuração atual comum valida CAPTCHA no modo production. Não substituir DATABASE_URL ou SEED_ENCRYPTION_KEY durante essa ativação.
4. Confirmar `/api/security-config` com required/ready verdadeiros, criar conta própria pelo site, verificar recebimento real de e-mail, executar a rodada completa e conciliação. Esses passos públicos continuam pendentes e não foram simulados por SQL.

### Administração privada

A criação de um domínio público para o admin foi bloqueada pela revisão automática: a autorização geral de concluir a hospedagem não foi considerada autorização específica para expor esse painel sensível. Nenhum domínio alternativo ou proxy público foi criado para contornar o bloqueio. O serviço continua privado. A API permite a origem exata `http://localhost:3001` para uso privado por encaminhamento autenticado, além do domínio público do jogador; não foi habilitado wildcard. Publicar o painel requer confirmação explícita do usuário e inclusão da origem HTTPS exata resultante.
