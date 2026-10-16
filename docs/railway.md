# Operação pública no Railway

Estado observado em 2026-10-16. O repositório já está ligado a serviços públicos; isso não confirma todos os requisitos de operação.

- Jogador: https://bingoweb-production-8b1f.up.railway.app/
- API: https://bingoapi-production-e17b.up.railway.app
- Supabase: projeto `pjsngxhbxdykcydzcjhi`, schema privado `bingo`.

O proxy HTTP público voltou a responder 200. A API responde `/ready`. O cadastro permanece bloqueado corretamente por CAPTCHA sem configuração completa; o estado público de segurança informa `required: true, siteKey: null, ready: false`. Não foi criada conta pública de teste. Nenhum worker recente foi encontrado no banco. Não abrir vendas enquanto essa situação persistir.

## Serviços persistentes

Todos usam o Dockerfile da raiz e o repositório completo. Em projetos novos, os aplicativos Next respeitam `PORT` fornecida pela plataforma. O perfil do projeto Railway existente preserva as portas 3000/3001 às quais os domínios já estavam ligados; `NEXT_PORT` permite uma substituição explícita. Ao trocar a porta, atualize também a porta de destino do domínio no Railway. Configure o comando inicial de cada serviço:

| Serviço       | Comando                            | Domínio público                    |
| ------------- | ---------------------------------- | ---------------------------------- |
| Jogador       | `pnpm --filter @bingo/web start`   | Sim                                |
| Administração | `pnpm --filter @bingo/admin start` | Sim, acesso administrativo com MFA |
| API/WebSocket | `pnpm --filter @bingo/api start`   | Sim, HTTPS/WSS                     |
| Worker        | `pnpm --filter @bingo/api worker`  | Não                                |

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

A integração Railway não estava disponível nesta sessão para criar o worker ou gravar variáveis. Não foram inventados tokens, alterados CAPTCHA para bypass ou criadas contas verificadas por SQL. O banco é acessível pelo conector Supabase; SMTP, Redis, credencial restrita de execução e configuração dos serviços precisam de validação no destino. Consulte [runbooks](runbooks/operacao.md).
