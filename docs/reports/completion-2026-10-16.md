# Continuação e limites verificáveis — 2026-10-16

## Resultado

O código evoluiu para uma demonstração multiplayer operável em stack completa, com testes reais de navegador e PostgreSQL, mas ainda existem bloqueios concretos de configuração na implantação pública. Nenhum depósito, saque ou dinheiro real foi implementado ou habilitado.

## Correções e funcionalidades entregues

- Proxy HTTP em runtime removeu o erro público 500; origem HTTPS exata do projeto Railway passou a ser reconhecida sem permitir domínios genéricos. Cookies Secure, respostas sem cache e headers defensivos foram reforçados.
- WebSocket direto com ticket assinado de 30 segundos, vinculado à sessão/rodada, revalidação de sessão, sequência/replay e fallback durável. Redis desperta o gateway, sem tornar mensagens voláteis a fonte financeira.
- Worker separa avanço do jogo de e-mail/Redis, registra heartbeat e retenta mensagens com backoff. Uma falha de SMTP não deve congelar o sorteio. A quarta migração foi aplicada ao Supabase com RLS.
- Admin ganhou operação de rodadas, cancelamento/estorno, bloqueio de usuários, papéis, catálogo, recorrência, suporte e saúde. Financeiro mantém MFA e segunda pessoa para aprovar ajustes.
- Perfil ganhou gestão de sessões, notificações e desativação explícita. O histórico preserva rastreabilidade pseudônima conforme política documentada; não promete apagar lançamentos obrigatórios do razão.
- PWA fornece página offline sem armazenar APIs ou dados privados. Qualidade gráfica adaptativa respeita movimento reduzido; som é opcional e começa desativado. Há lembrete de sessão e limites acessíveis.
- CAPTCHA vem de configuração runtime; secret nunca é publicado. O formulário informa manutenção e impede submissão quando configuração está incompleta, sem introduzir bypass.
- Revisão financeira impede usar receitas de vendas ainda reembolsáveis para garantir prêmios de outra rodada. Travamento de usuários no sorteio concentra-se nos recebedores reais, com ordenação determinística.
- Inicialização Next respeita PORT em implantações novas e preserva as portas de destino dos domínios do projeto Railway existente. Uma regressão 502 durante a troca de porta foi detectada na verificação pública e recebeu correção específica, sem alterar as origens permitidas. O Railway inicialmente ignorou o commit por filtros de arquivos; atualizar os pacotes dos aplicativos acionou os deploys, ambos concluídos com sucesso. A checagem pública seguinte confirmou HTTP 200 para lobby, salas e configuração de segurança. Há scanner de padrões de segredos, definições de alertas/dashboard e runbooks. Essas definições não significam coletor ou alertas instalados.

## Evidências

[CI integral aprovado](https://github.com/betwenes-ops/bingo/actions/runs/38962117984): 31 testes locais, 23 integrações PostgreSQL e 10 testes de navegador; build, auditoria, Compose e backup/restauração aprovados. Inclui MFA, recorrência, segunda aprovação financeira e offline em desktop e celular. [Carga medida](../load-test-results.md) detalha os limites da simulação.

Essa bateria também aprovou o teste financeiro adicional, isolamento de schema Supabase e estágios de 100, 500 e 1.000 clientes. No estágio de 1.000, todos concluíram, com zero lacunas, duplicações ou divergências e p99 de entrega de 559 ms. Os percentis são do runner isolado com relógio acelerado, não da hospedagem pública.

O lobby público foi inspecionado visualmente: apresentação escura/dourada e estado vazio real, sem salas ou contadores fabricados. HTTP público confirmou disponibilidade da API e proxy. Supabase: 35 tabelas, todas com RLS, quatro migrações, zero usuários e zero workers recentes; advisors de segurança sem avisos. Essas consultas não substituem autenticação de aplicação nem teste de entrega de e-mail.

## Trabalho externo ainda necessário

Conectar a integração Railway e configurar/validar worker persistente, CAPTCHA do domínio, SMTP, Redis, credencial restrita e variáveis das quatro aplicações. Depois executar cadastro real com confirmação, MFA administrativo, compra, sorteio automático, premiação, prova e conciliação pelo site público. [Guia exato](../railway.md).

Não declarar 100% do briefing: permanecem gates de carga 5k/10k e capacidade da hospedagem, observabilidade operacional, chaveiro/rotação de seeds, revisão independente, retenção e medições em dispositivos reais. O escopo de testes já aprovado está distinguido do trabalho de operação pendente em [STATUS](../STATUS.md).
