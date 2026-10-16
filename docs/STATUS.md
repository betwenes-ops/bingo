# Estado verificável da entrega

Atualizado em 2026-10-16. [CI verde do código](https://github.com/betwenes-ops/bingo/actions/runs/38916686004), commit 325af8bd23916f338e9f440cfc147a622de340d7.

| Verificação executada                                  | Resultado                                              |
| ------------------------------------------------------ | ------------------------------------------------------ |
| Instalação por lockfile, formatação, lint e TypeScript | Passou                                                 |
| Domínio, matemática, HTTP e verificador independente   | 24 testes passaram                                     |
| PostgreSQL real/Testcontainers                         | 19 testes passaram                                     |
| Navegador: desktop e celular, incluindo jogo completo  | 6 testes passaram                                      |
| Build das aplicações/pacotes                           | Passou                                                 |
| Auditoria de dependências                              | Sem vulnerabilidades conhecidas na execução registrada |
| Compose API/web/admin e backup/restauração             | Passou                                                 |
| Matemática exata × 1.000.000 de simulações             | Compatível com IC95%                                   |

A demonstração permite cadastro, confirmação, login, créditos fictícios, compra, sorteio, premiação, carteira e verificação. O bingo individual liquida antes da animação e publica tabela/probabilidades. O admin exige MFA e oferece salas, usuários, auditoria, conciliação e dupla aprovação financeira. Há versões imutáveis, prêmio fixo reservado, estornos, estados completos, agendamento/recorrência e APIs de suporte/privacidade. O perfil oferece histórico, atendimento e download de dados.

O Compose completo e uma restauração estrutural de backup passaram em CI. Dinheiro real, deploy público, carga progressiva, observabilidade completa, fan-out Redis no gateway, interfaces de todos os controles e acabamento integral continuam pendentes. O teste de navegador ainda não cobre todos os novos formulários administrativos. Os relatórios fase-0.md até fase-8.md descrevem gates abertos. O projeto não está certificado e não foi medida capacidade de 10.000 jogadores.

[Relatório desta continuação](reports/operations-2026-10-16.md) · [Guia de operação](operations.md).

Nenhuma nova aprovação é necessária para continuar implementando: o usuário autorizou execução autônoma. Definição de destino, acesso e orçamento de hospedagem permanece pendência de implantação; nenhum custo foi contratado.

## Persistência gerenciada

O projeto Supabase `bingo` recebeu as três migrações da aplicação em schema privado, 34 tabelas com RLS e bloqueio de acesso por `anon`/`authenticated`. Advisors de segurança: sem avisos após a configuração. Testes administrativos de balanceamento/imutabilidade foram revertidos integralmente. A conexão da API/worker com credencial restrita e o deploy público ainda não foram realizados. [Detalhes](supabase.md).
