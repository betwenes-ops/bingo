# Revisão de acesso e operação — 2026-10-17

O usuário pediu para deixar CAPTCHA por último e corrigir o restante primeiro. As chaves e a proteção pública foram preservadas. A validação dos fluxos autenticados usa ambiente CI isolado com usuários sintéticos e o bypass exclusivo desse ambiente; não foram criadas contas verificadas por SQL no banco público.

## Correções

- Login revalida senha, bloqueio e confirmação com o usuário travado antes de criar uma sessão. Se a credencial mudar enquanto o Argon2 verifica a senha antiga, o login é recusado. O custo do Argon2 permanece fora do bloqueio.
- Verificação de e-mail e troca de senha usam ordem de bloqueio consistente: usuário antes de consumir tokens. Dois links de recuperação simultâneos não mantêm tokens presos enquanto aguardam o mesmo usuário; somente uma troca pode concluir e os demais tokens são revogados.
- Foi adicionado reenvio de confirmação, protegido por origem, CAPTCHA existente e limite por IP. O backend limita a um envio por minuto por conta, serializa solicitações concorrentes e usa resposta genérica para contas inexistentes, verificadas ou bloqueadas. Confirmar novamente não concede novos créditos.
- Site e admin oferecem **Reenviar confirmação**, com somente e-mail; mudar entre modos limpa o token temporário e mensagens antigas.
- SMTP_URL passa por validação de URL, protocolo SMTP/SMTPS e hostname antes de iniciar serviços. O painel diferencia worker ativo de provedor externo de e-mail configurado; configuração externa não é apresentada como prova de entrega.
- A busca administrativa antes filtrava apenas os primeiros 100 usuários. Agora consulta toda a base por e-mail ou UUID e oferece páginas de 100, com ordenação determinística. Respostas antigas de requisições são descartadas para não sobrescrever uma busca mais recente.

## Validação

A bateria do commit a1ba06150c9534fdbb208b7d2df895ef83cfddf5 está em https://github.com/betwenes-ops/bingo/actions/runs/39025959363. Resultado integral: **aprovado**, com 32 testes locais, 27 de PostgreSQL e 12 de navegador (71 no total), além de build, lint, tipos, auditoria, Compose e restauração. Os estágios de 100, 500 e 1.000 clientes concluíram sem lacunas, duplicações ou divergências financeiras e com prova válida.

Os testes novos cobrem:

1. Reenvio após expiração, solicitações simultâneas, resposta sem enumeração de contas, recusa de token já consumido e crédito inicial único.
2. Alteração real da credencial em PostgreSQL enquanto um login aguarda um bloqueio, garantindo que a senha antiga não gere uma sessão.
3. Dois links de recuperação simultâneos: uma troca válida, outra TOKEN_INVALID, sem tokens de recuperação restantes.
4. Busca com mais de 100 contas de fixture: usuário antigo fora da primeira página, consulta por e-mail/UUID, páginas disjuntas e offset inválido recusado.
5. Navegador desktop/celular: reenvio com somente e-mail, retorno ao login, busca administrativa por e-mail e ID, MFA, recorrência, dupla aprovação, compra/sorteio/prêmio/prova e recuperação offline.

TypeScript, lint e formatação locais passaram. O teste local de configuração rejeita endereço SMTP sem hostname, protocolos impróprios e valores inválidos. A tela pública de reenvio foi inspecionada visualmente; não houve submissão com dados pessoais. Cinco serviços Railway foram observados em SUCCESS após os deploys.

## SMTP real no ambiente isolado

O job Compose 117378536276 da [execução 39026546077](https://github.com/betwenes-ops/bingo/actions/runs/39026546077) terminou em SUCCESS após o teste novo. O script `tests/compose/email-smoke.mjs` cadastrou uma conta descartável pelo HTTP, aguardou a mensagem enviada pelo worker via SMTP ao Mailpit real, consumiu o link recebido pela API, autenticou a conta e verificou crédito inicial único e recusa de replay. Ele usa somente loopback, exige CI=true e não imprime senha, token ou cookie.

Essa validação também usa a credencial SQL restrita do Compose. Não equivale a testar a credencial do banco público, SMTP externo ou reputação/entrega em caixas reais. Os resultados sanitizados estão em [evidence/access-operations-2026-10-17.json](evidence/access-operations-2026-10-17.json). O teste SMTP usa o mesmo código de produto da suíte integral aprovada acima, acrescido apenas do script de teste e da etapa CI. O resultado do job SMTP foi observado separadamente como SUCCESS.

## Operação ainda pendente

O envio real depende de SMTP_URL e MAIL_FROM de um provedor autorizado no ambiente privado. Não foi criado um SMTP fictício para apresentar confirmação como entregue. O CAPTCHA continua para a última etapa conforme pedido; por isso os botões públicos autenticados seguem indisponíveis enquanto a configuração de segurança não estiver pronta. Depois das credenciais externas será necessário verificar o cadastro e a rodada completos na hospedagem pública.

Revisão independente, observabilidade operacional completa, credencial SQL restrita comprovada, rotação de chaves e medições de capacidade/dispositivo continuam nos gates do STATUS. O projeto permanece restrito a créditos fictícios, sem depósitos ou saques.
