================================================================================
  GUIA DE UTILIZAÇÃO - NY_Admin
  Gestão de Conteúdos para o site NY (https://github.com/Nyumba2025/NY)
================================================================================

Este documento explica como iniciar, configurar a ligação ao repositório GitHub
e como utilizar a aplicação NY_Admin no seu dia a dia.

--------------------------------------------------------------------------------
 1. INICIAR A APLICAÇÃO
--------------------------------------------------------------------------------
- Para iniciar a aplicação, basta abrir o ficheiro executável `NY_Admin.exe` que 
  se encontra na pasta `dist/`.
- Ao executar, irá abrir-se automaticamente uma janela com o painel de gestão.
- As suas credenciais iniciais de acesso (caso seja a primeira vez) são:
    • Utilizador : admin
    • Senha      : Admin123!
  (Nota: recomenda-se a alteração desta senha após o primeiro acesso)

--------------------------------------------------------------------------------
 2. COMO CONFIGURAR O REPOSITÓRIO GITHUB
--------------------------------------------------------------------------------
A aplicação envia as suas modificações de conteúdo diretamente para o site através 
do GitHub. Para isso, o seu ambiente tem de estar configurado.

A. Credenciais Globais do Git (No seu computador)
  Para que o painel consiga fazer a comunicação, garanta que tem o Git configurado
  e acesso (token/palavra-passe) à conta Nyumba2025. Se utilizar a linha de 
  comandos pela primeira vez para fazer "Push", as credenciais ficarão guardadas.

B. Usar o GitHub Desktop (Método mais fácil)
  Se preferir não usar a linha de comandos, pode usar a aplicação GitHub Desktop:
  1. Transfira e instale o GitHub Desktop (https://desktop.github.com/).
  2. Abra a aplicação e faça Login com a conta que tem acesso ao site Nyumba2025.
  3. Ao fazer isto, o seu computador fica automaticamente autorizado! O botão 
     "Deploy" do NY_Admin passará a funcionar sem pedir mais palavras-passe.
  
  (Opcional) Pode usar o próprio GitHub Desktop para gerir o site:
  - Escolha "Add Local Repository" e selecione a pasta da aplicação NY_Admin.
  - Verá os ficheiros alterados sempre que gravar algo no painel.
  - Pode escrever um resumo ("Commit") e clicar em "Push" para o colocar online.

C. Caminho do Repositório (No ficheiro .env)
  Se estiver a correr a aplicação sem ser pela versão compilada ou precisar 
  de alterar o caminho local onde os ficheiros do site se encontram guardados,
  pode editar/criar o ficheiro `.env` na pasta raiz e adicionar:
    DEPLOY_TARGET_PATH=C:\caminho\para\a\sua\pasta\local\do\NY
    DEPLOY_BRANCH=main
    DEPLOY_ENABLED=true

  Também pode ajustar esta configuração diretamente no painel de administração 
  através da área "Configurações" -> "Deploy".

--------------------------------------------------------------------------------
 3. GUIA RÁPIDO DE UTILIZAÇÃO (FLUXO DE TRABALHO)
--------------------------------------------------------------------------------
Sempre que precisar de atualizar o site (ex: ementa, fotos, textos), siga este 
processo:

PASSO 1: Editar
- Vá ao menu lateral e clique no que quer alterar (ex: "Menu" ou "Galeria").
- Efetue as alterações desejadas e clique em "Guardar".

PASSO 2: Pré-visualizar (Opcional)
- Clique em "Preview" para garantir que a aparência está do seu agrado antes 
  de lançar o site ao público.

PASSO 3: Sincronizar (Deploy)
- Para colocar online as suas mudanças, aceda ao menu "Deploy".
- Primeiro clique em "Git Pull" para evitar conflitos (sincronizar atualizações
  que possam ter sido feitas por outro administrador).
- Clique em "Deploy" para iniciar o carregamento da nova versão para o GitHub. 
  A publicação poderá demorar alguns minutos.

--------------------------------------------------------------------------------
 4. BACKUPS E PREVENÇÃO
--------------------------------------------------------------------------------
- O NY_Admin tem um sistema de segurança: na área "Backup" é possível criar
  um ponto de restauro manual. Recomendamos que crie um backup antes de
  fazer grandes reestruturações no conteúdo do site.
- Se o carregamento correr mal, pode ir ao menu "Histórico" (onde vê todo
  o registo de atividade) ou restaurar um backup existente.
