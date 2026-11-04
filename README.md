## Criar contas dos clientes

O app nao tem cadastro: as contas sao criadas manualmente.

1. Firebase > **Authentication** > Usuarios > **Adicionar usuario** (e-mail e senha) e passe os dados para o cliente.
2. Para impedir que alguem crie conta por fora do app (a chave do Firebase e publica), va em **Authentication** > Configuracoes > **Acoes do usuario** e desmarque **Ativar criacao (inscricao)**.

No primeiro login, o app pede o nome da barbearia. Ele aparece no topo da tela inicial e pode ser trocado tocando nele.
