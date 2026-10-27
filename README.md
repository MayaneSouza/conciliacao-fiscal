# Site de conciliação fiscal

Site estático (sem servidor próprio): HTML + JavaScript no navegador, dados no Supabase (login, papéis e regras de acesso no banco).

## Publicar no GitHub Pages
1. Crie um repositório no GitHub (ex.: `conciliacao-fiscal`).
2. Envie **o conteúdo desta pasta** para a raiz do repositório (Add file → Upload files; inclua a pasta `js`, `css`, `index.html` e `.nojekyll`).
3. Settings → Pages → Build and deployment → Source: *Deploy from a branch* → Branch `main`, pasta `/ (root)` → Save.
4. O endereço fica `https://SEU-USUARIO.github.io/conciliacao-fiscal/`.
5. **Supabase → Authentication → URL Configuration**: em *Site URL* coloque esse endereço e adicione-o também em *Redirect URLs*. Sem isso os e-mails de convite e de redefinição de senha apontam para o lugar errado.
6. Supabase → Authentication → Sign In / Providers → Email: desligue *Allow new users to sign up* (só o administrador cria usuários) e mantenha *Confirm email* ligado.

## Segurança
- `js/config.js` guarda só a chave **publishable** (pública por desenho). A proteção é o RLS do banco (`db/`).
- Nunca coloque no repositório: chave secreta/`service_role`, senhas, certificados A1.
- Repositório público é seguro para esta chave; quem não tem login não vê dados.

## Usuários
Criar no Supabase (Authentication → Users → Add user / Invite). O usuário aparece na aba **Usuários** como inativo; o administrador define papel e grupos e ativa.

## Testes
- `tests/importers.test.mjs`: importadores x resultados do Python (ver cabeçalho do arquivo).
- Abrir `index.html?mock` mostra a interface com dados fictícios (sem Supabase), usada nos testes de tela.

## Limites conhecidos
- A leitura real das planilhas usa a SheetJS (CDN); testada apenas com a lógica dos importadores, não no navegador com arquivos reais.
- Vínculo de pedido (SLA): o painel "Status dos pedidos" do Confronto ainda não tem dados (aguarda a planilha de pedidos).
