# ADR 0009 — Hospedagem existente e configuração em runtime

Data: 2026-10-16. Status: aceito. Atualiza o estado de implantação do ADR 0005.

O usuário autorizou execução autônoma e forneceu Railway e Supabase existentes. Não é mais correto dizer que não existe deploy público. API, jogador e administração são serviços separados; worker persistente é obrigatório e ainda precisa estar ativo no destino. O Supabase permanece somente como persistência privada, sem acesso de carteira pelo navegador.

HTTP do navegador passa pelo proxy Next no mesmo domínio, preservando cookies e CSRF. O proxy lê API_INTERNAL_URL em runtime. WebSocket conecta diretamente à API pública usando um ticket HMAC de 30 segundos vinculado à sessão e rodada; não depende de cookie entre domínios. Redis apenas desperta a leitura de eventos duráveis; PostgreSQL é a fonte autoritativa.

Não liberar cadastro por bypass quando CAPTCHA estiver ausente. Não promover usuários por SQL para simular confirmação de e-mail. Não substituir chave de seeds existente. Não presumir configuração de serviços que a integração indisponível não permitiu verificar. Gates e comandos estão em docs/railway.md; a entrega pública segue condicionada à validação operacional.
