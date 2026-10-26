# Minha Barbearia

App (PWA) para barbeiro autonomo: inicia o atendimento, finaliza com o valor e acompanha tudo no dashboard e na gestao. Tem login com e-mail e senha.

## Arquivos

- `index.html` - telas de login e do app
- `styles.css` - visual
- `app.js` - toda a logica (login, atendimentos, dashboard, gestao)
- `firebase-config.js` - **voce precisa colar os dados do seu Firebase aqui**
- `manifest.json`, `sw.js`, `icon*.png/svg` - instalacao como app e uso offline

## Passo a passo

1. Acesse https://console.firebase.google.com e crie um projeto.
2. **Authentication** > Metodo de login > ative **E-mail/senha**.
3. **Realtime Database** > Criar banco de dados (modo bloqueado serve).
4. Na aba **Regras** do Realtime Database, cole isto e publique (cada usuario so enxerga os proprios dados):

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```

5. **Configuracoes do projeto** > Seus apps > adicione um app da **Web** (`</>`) e copie o objeto `firebaseConfig` para o `firebase-config.js`. Confira se o `databaseURL` esta preenchido.
6. Rode em um servidor (nao abre direto pelo arquivo, por causa dos modulos JS):

```
python -m http.server 8080
```

   e abra http://localhost:8080. Crie sua conta na tela de login.

7. Para usar no celular, publique a pasta (Firebase Hosting, Netlify, Vercel ou GitHub Pages - precisa ser HTTPS). No Chrome do celular: menu > **Instalar app**.

Se o login der erro de dominio nao autorizado, va em Authentication > Configuracoes > Dominios autorizados e adicione o dominio onde publicou.

## Como os dados ficam salvos

```
users/{uid}/
  servicos/{id}       nome, preco, ativo, ordem
  atendimentos/{id}   servicoId, servicoNome, cliente, inicio, fim, valor, gorjeta, pagamento, status
  despesas/{id}       descricao, valor, categoria, data (AAAA-MM-DD)
  ativo               atendimento em andamento (sobrevive a fechar o app)
```

No primeiro login sao criados 4 servicos de exemplo (Corte, Barba, Corte + barba, Sobrancelha). Edite os precos em **Gestao > Servicos**.

## O que cada tela faz

- **Atender**: escolhe o servico (ou valor livre), nome do cliente opcional, **Iniciar atendimento**.
- **Em atendimento**: cronometro, trocar servico, cancelar ou **Finalizar**. Se fechar o app, o atendimento continua rodando.
- **Finalizar**: valor cobrado (ja vem o da tabela), gorjeta e forma de pagamento.
- **Dashboard**: hoje / semana / mes com faturamento, atendimentos, ticket medio, despesas, lucro, grafico e servicos mais feitos.
- **Gestao**: atendimentos por dia (com excluir e lancamento manual), cadastro de servicos e despesas.
