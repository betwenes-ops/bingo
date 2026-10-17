# Runbooks da demonstração

## Worker ausente ou sorteio atrasado

1. Consulte **Operação e suporte** no admin com MFA: worker deve ter atividade recente; observe atraso do sorteio e fila de eventos.
2. No Railway, confirme o serviço persistente com comando `pnpm --filter @bingo/api worker`, mesmo banco/schema e mesma chave de seeds da API. Ele não precisa de domínio público.
3. Reinicie o worker. Os advisory locks e a posição persistida permitem retomar. Não altere sequência, bolas, vencedores ou razão.
4. Confira avanço, prova final e conciliação. Se falhar, preserve IDs da rodada e logs sem segredos; não cancele um sorteio já iniciado nem tente corrigir resultados por SQL.

## Redis indisponível

O gateway continua consultando eventos duráveis uma vez por sala a cada segundo. A animação pode atrasar. A outbox permanece no banco para republicação. O sorteio e os e-mails têm processamento separado. Restaure o Redis, acompanhe queda da fila e ausência de lacunas no cliente. Publicação repetida é prevista e deduplicada por sequência.

## E-mail pendente

Confira SMTP_URL, MAIL_FROM e autorização do domínio remetente. O painel Operação e suporte indica quando não há servidor externo configurado; worker ativo não comprova entrega de e-mail. Depois de corrigir o provedor, contas sem confirmação podem usar Reenviar confirmação na tela de acesso, aguardando um minuto entre solicitações. Um link novo vale 30 minutos e confirmar uma conta novamente não gera outro crédito inicial. Mensagens têm até 12 tentativas com backoff de até uma hora. A falha de um destinatário não bloqueia os demais. Entrega externa deve ser verificada no provedor; enfileirar não significa entregar. Não copiar corpos, links de verificação ou tokens para logs. Para retentar mensagens esgotadas, o responsável pode alterar apenas os campos de tentativa/agendamento da outbox após corrigir o provedor; nunca criar novos créditos ou mudar a verificação da conta manualmente para simular entrega.

## Divergência financeira

Execute a conciliação com uma conta financeira com MFA. Preserve referências e resultados, interrompa novas vendas pelo controle administrativo e investigue razão versus cache. Não faça UPDATE/DELETE em lançamentos. Um ajuste aprovado por outra pessoa cria lançamento compensatório e fica auditado; ele não substitui a investigação de erro no motor. Rodadas concluídas e vencedores não podem ser alterados.

## Cancelamento anterior ao sorteio

Use o painel de operação, escolha a rodada, **Cancelar e estornar** e motivo. O backend admite somente estados anteriores ao sorteio. Compras são devolvidas e reservas fixas liberadas na mesma transação. Repetir o cancelamento não duplica reembolso. Valide carteiras, reservas e auditoria.

## Backup e restauração

Siga os comandos de [operations.md](../operations.md) em um banco de restauração separado. O CI valida dump/restore estrutural do ambiente Docker. Para Supabase, a frequência e retenção dependem do plano contratado e precisam ser verificadas no painel. Faça cópia externa criptografada e preserve a chave de seeds separadamente. Não restaurar sobre o banco ativo sem plano de recuperação e janela explícita.

## Segredos e sessões

Para incidente de sessão, encerre sessões pelo perfil ou bloqueie o usuário no admin; conexões WS são revalidadas a cada 20 segundos e novas conexões recusam sessão revogada. Tickets WS duram 30 segundos e ficam restritos à rodada. Tokens e query strings não são registrados no log HTTP.

Não altere SEED_ENCRYPTION_KEY isoladamente: ela protege seeds e MFA existentes. A versão atual usa uma chave única e ainda exige um procedimento de rotação com migração/chaveiro validado. Perder a chave torna os dados criptografados irrecuperáveis; não improvisar alterações nas regras imutáveis para contornar isso. Credenciais PostgreSQL, SMTP e CAPTCHA podem ser substituídas nas variáveis dos serviços correspondentes e verificadas após novo deploy.

## Métricas e alertas

`/metrics` exige sessão administrativa com MFA. Há métricas HTTP, conexões WS, espera por conexão no banco, worker, atraso do sorteio, outbox e e-mails esgotados. `infra/prometheus-alerts.yml` e `infra/grafana/bingo.json` são definições versionadas; não foi instalado um coletor ou canal de alerta na hospedagem. Automatizar scrape com autenticação de serviço é um gate ainda aberto. Não publicar as métricas sem autenticação para facilitar a coleta.
