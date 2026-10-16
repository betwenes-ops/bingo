# ADR 0008 — Autonomia autorizada e limites da implementação inicial

Data: 2026-10-16. Status: aceito para execução; supersede a exigência de novas aprovações dos ADRs e instruções anteriores.

O usuário autorizou expressamente executar o máximo possível sem pedir novas aprovações. Relatórios, integridade e evidências continuam obrigatórios. Nenhum dinheiro real foi autorizado ou implementado.

Esta revisão implementa fatias verticais das fases, mas não declara os gates completos enquanto faltarem critérios. O estado persistido inicial resume abertura, sorteio e conclusão; o WS inicial usa replay do banco, com outbox publicada no Redis, ainda sem gateway consumidor. São limitações identificadas, não alteração definitiva dos requisitos.

Docker não existe no executor local e o PostgreSQL nativo não pode trocar de usuário nesse sandbox. A integração está configurada no GitHub Actions com Testcontainers e os resultados devem ser conferidos no workflow. Builds e testes locais são registrados separadamente. Não substituir o banco de produção por mocks para produzir um teste verde.

A tabela instant-75-v1 foi calculada por inclusão-exclusão sobre 15 máscaras, particionada pelo maior pagamento, com escala em bps e arredondamento por participação. Alterar a tabela exige nova versão e relatório. A simulação de 1.000.000 de partidas é evidência matemática, não teste de carga de usuários.
