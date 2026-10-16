# RNG v1 — contrato público reproduzível

Algoritmo: hmac-sha256-fy-v1. Vetor completo em rng-v1-vector.json. A implementação Node está em packages/domain/src/rng.ts e a implementação independente WebCrypto em apps/web/lib/verifier.ts.

1. O servidor gera 32 bytes CSPRNG e os representa por 64 caracteres hexadecimais minúsculos. O commitment é SHA-256 dos **bytes UTF-8 desse texto hexadecimal**, não do buffer bruto de 32 bytes.
2. A chave HMAC-SHA256 é o buffer de 32 bytes decodificado do hexadecimal. Cada bloco é HMAC da mensagem UTF-8 `hmac-sha256-fy-v1\n<context>\n<counter>`. As duas separações são caracteres LF. Counter começa em 0, decimal sem padding.
3. Ler os oito inteiros uint32 big-endian de cada bloco na ordem. Só gerar o bloco seguinte após consumir o atual; counter incrementa uma vez por bloco.
4. Para obter inteiro em [0,bound), calcular limit=floor(2^32/bound)*bound. Descartar valores >=limit; retornar value%bound dos aceitos. Não usar módulo sem rejeição.
5. Fisher-Yates começa na lista [1,...,N], percorre i=N-1 até 1, sorteia j em [0,i] e troca posições. Contexto efetivo do sorteio é `draw:<context>`; cartelas usam contextos `card:...` separados.
6. Multiplayer: context é o texto JSON do array [algorithmVersion,roundId,manifestHash,0]. O manifesto é o array público {id,card} em ordem UUID crescente retornado pelo banco, serializado por JSON.stringify com a ordem de propriedades publicada na prova. A mesma representação recebida deve ser preservada; nesta versão não se assume RFC 8785. A prova inclui manifesto e context originais para reprodução.
7. Individual: context é o array JSON [algorithmVersion,"instant",commitmentId,clientSeed,0]. Cartela 75 gerada pelo Fisher-Yates de cada coluna, com centro livre. Revelam-se as primeiras 30 bolas; paga somente o maior padrão da tabela da versão. O verificador refaz também a cartela e o pagamento inteiro.
8. A seed nunca é revelada antes da liquidação. Seqüência futura e texto cifrado não são enviados aos clientes antes do fim. A prova multiplayer fica disponível somente após COMPLETED.

A cifra interna usa AES-256-GCM com IV CSPRNG de 12 bytes, formato ivHex:tagHex:ciphertextHex. A chave fica fora do banco. A versão inicial ainda não inclui identificação de chave e procedimento automatizado de rotação; isso é pendência operacional.

Commit-reveal prova consistência posterior com um compromisso publicado; não prova que o operador desconhecia a seed, não evita todo aborto seletivo e não equivale a certificação independente. Entropia externa independente exige outro protocolo versionado.
