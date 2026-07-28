================================================================================
  NYUMBA ADMIN — PAINEL DE GESTÃO DO RESTAURANTE NYUMBA
  Repositório GitHub: https://github.com/Nyumba2025/NY
================================================================================

ÍNDICE
------
  1. Visão Geral
  2. Requisitos
  3. Instalação e Arranque
  4. Primeiro Acesso
  5. Guia de Utilização do Painel
  6. Configuração da Ligação ao GitHub
  7. Fluxo de Trabalho: Editar Conteúdo e Publicar no GitHub
  8. Deploy Automático via Webhook
  9. Gestão de Utilizadores
  10. Backups
  11. Variáveis de Ambiente (.env)
  12. Estrutura do Projeto
  13. Segurança — Passos Obrigatórios em Produção


================================================================================
1. VISÃO GERAL
================================================================================

O Nyumba Admin é um CMS (Content Management System) dedicado ao website do
Restaurante Nyumba. Permite:

  • Editar conteúdo da página principal (hero, sobre nós, serviços, rodapé)
  • Gerir a galeria de imagens
  • Gerir o menu (categorias e pratos)
  • Fazer e restaurar backups dos dados
  • Publicar alterações no repositório GitHub (Nyumba2025/NY)
  • Gerir utilizadores e permissões
  • Monitorizar o estado do sistema


================================================================================
2. REQUISITOS
================================================================================

  • Node.js v18+ (testado com v26)
  • npm v8+
  • Git instalado e configurado
  • Acesso ao repositório https://github.com/Nyumba2025/NY
    (com permissões de push na branch main/master)


================================================================================
3. INSTALAÇÃO E ARRANQUE
================================================================================

--- Primeira vez ---

  1. Abra um terminal na pasta do projeto:
       cd "c:\Users\JFreire\AI APPs\nyumba-admin-app"

  2. Instale as dependências:
       npm install

  3. Configure o ficheiro .env (ver Secção 11)

  4. Inicie o servidor:
       npm run dev        (desenvolvimento, com hot-reload)
       npm start          (produção)

--- Arranques seguintes ---

  Basta executar:
    npm run dev

  O servidor fica disponível em: http://localhost:3000


================================================================================
4. PRIMEIRO ACESSO
================================================================================

  URL de Login: http://localhost:3000/login

  Credenciais iniciais:
    Utilizador : admin
    Senha      : Admin123!

  ⚠️  IMPORTANTE: Altere a senha imediatamente após o primeiro login!
      Painel → ícone do utilizador (canto superior direito) → Alterar Senha


================================================================================
5. GUIA DE UTILIZAÇÃO DO PAINEL
================================================================================

Aceda ao painel em: http://localhost:3000/admin

O menu lateral esquerdo dá acesso a todas as secções:

  ┌─────────────────────────────────────────────────────────────────┐
  │  SECÇÃO          │  O QUE FAZ                                   │
  ├─────────────────────────────────────────────────────────────────┤
  │  Dashboard       │  Visão geral: stats, atividade, ações rápidas│
  │  Página Principal│  Editar hero, sobre nós, serviços, rodapé    │
  │  Galeria         │  Adicionar/remover imagens do restaurante     │
  │  Menu            │  Gerir categorias e pratos                   │
  │  Preview         │  Visualizar o site antes de publicar         │
  │  Histórico       │  Ver commits Git do repositório              │
  │  Backup          │  Criar e restaurar backups dos dados         │
  │  Deploy          │  Publicar alterações no GitHub               │
  │  Utilizadores    │  Criar/gerir contas de acesso ao painel      │
  │  Configurações   │  Info do sistema e configurações             │
  └─────────────────────────────────────────────────────────────────┘

Como editar conteúdo:
  1. Clique na secção pretendida (ex: "Página Principal")
  2. Edite os campos desejados
  3. Clique em "Guardar" (os dados são gravados em data/*.json)
  4. Clique em "Preview" para ver o resultado antes de publicar
  5. Vá a "Deploy" para publicar as alterações no GitHub


================================================================================
6. CONFIGURAÇÃO DA LIGAÇÃO AO GITHUB
================================================================================

Para que o painel possa fazer push/pull para https://github.com/Nyumba2025/NY,
é necessário configurar as credenciais Git no servidor onde a app corre.

--- Opção A: Token de Acesso Pessoal (recomendado) ---

  1. Crie um Personal Access Token (PAT) no GitHub:
       GitHub → Settings → Developer settings → Personal access tokens
       → Generate new token (classic)
       → Selecione scope: "repo" (acesso completo ao repositório)
       → Copie o token gerado

  2. Configure o Git para usar o token:
       git config --global credential.helper store

  3. Na primeira operação Git (pull/push), introduza:
       Username: o seu utilizador GitHub (ex: Nyumba2025)
       Password: o token copiado no passo 1

  4. O token fica guardado para futuras operações.

--- Opção B: Chave SSH ---

  1. Gere uma chave SSH (se não tiver):
       ssh-keygen -t ed25519 -C "admin@nyumba.com"

  2. Adicione a chave pública ao GitHub:
       GitHub → Settings → SSH and GPG keys → New SSH key
       Copie o conteúdo de: ~/.ssh/id_ed25519.pub

  3. Clone o repositório via SSH:
       git clone git@github.com:Nyumba2025/NY.git

--- Configuração do caminho do repositório no painel ---

  No ficheiro .env, adicione ou edite:
    DEPLOY_TARGET_PATH=C:\caminho\para\o\repositorio\Nyumba
    DEPLOY_BRANCH=main
    DEPLOY_ENABLED=true

  Ou pelo painel: Configurações → Deploy → Caminho do Repositório


================================================================================
7. FLUXO DE TRABALHO: EDITAR CONTEÚDO E PUBLICAR NO GITHUB
================================================================================

Fluxo recomendado para atualizar o website:

  PASSO 1 — Editar conteúdo no painel
    • Aceda ao painel: http://localhost:3000/admin
    • Edite as secções desejadas (Página Principal, Galeria, Menu, etc.)
    • Guarde as alterações em cada secção

  PASSO 2 — Verificar o resultado
    • Clique em "Preview" no menu lateral
    • O site é mostrado numa janela de pré-visualização

  PASSO 3 — Criar um Backup (opcional mas recomendado)
    • Clique em "Backup" → "Criar Backup"
    • Introduza uma descrição (ex: "Antes de publicar menu de verão")
    • Clique em "Criar"

  PASSO 4 — Publicar no GitHub
    • Clique em "Deploy" no menu lateral
    • Clique em "Git Pull" para sincronizar com o repositório remoto primeiro
    • Clique em "Deploy" para fazer push das alterações para o GitHub
    
    OU, pelo terminal, na pasta do repositório Nyumba:
      git add .
      git commit -m "Atualização do conteúdo pelo painel admin"
      git push origin main

  PASSO 5 — Verificar o deploy
    • A secção "Histórico" mostra os commits do repositório
    • A secção "Deploy" mostra o estado do último deploy


================================================================================
8. DEPLOY AUTOMÁTICO VIA WEBHOOK (CI/CD)
================================================================================

O painel suporta deploy automático quando há um push no GitHub.

--- Configuração do Webhook no GitHub ---

  1. Aceda ao repositório: https://github.com/Nyumba2025/Nyumba
  2. Settings → Webhooks → Add webhook
  3. Preencha:
       Payload URL : https://SEU-DOMINIO.com/api/deploy/webhook
       Content type: application/json
       Secret      : o valor de DEPLOY_HOOK_SECRET no seu .env
       Events      : "Just the push event"
  4. Clique em "Add webhook"

--- Configuração no .env ---

  DEPLOY_ENABLED=true
  DEPLOY_BRANCH=main
  DEPLOY_HOOK_SECRET=uma_chave_secreta_segura_aqui
  DEPLOY_TARGET_PATH=/caminho/para/repositorio/Nyumba
  DOMAIN=SEU-DOMINIO.com

Após configuração, cada push para a branch "main" do GitHub irá
automaticamente: git pull → npm install → npm run build → pm2 restart

⚠️  O webhook só funciona se o servidor estiver acessível publicamente
    (não funciona em localhost). Use um serviço como ngrok para testes locais:
      ngrok http 3000
      Payload URL: https://XXXX.ngrok.io/api/deploy/webhook


================================================================================
9. GESTÃO DE UTILIZADORES
================================================================================

Aceda a: Painel → Utilizadores

  Criar novo utilizador:
    • Clique em "Novo Utilizador"
    • Preencha nome, email, utilizador e senha
    • Escolha o role:
        admin  → acesso total (incluindo deploy, utilizadores, configurações)
        editor → pode editar conteúdo mas não gerir utilizadores/deploy

  Repor senha:
    • Na tabela de utilizadores, clique em "Repor Senha"
    • Introduza a nova senha

  Desativar utilizador:
    • Clique em "Eliminar" — o utilizador é desativado (não apagado)

  Alterar a sua própria senha:
    • Clique no ícone do utilizador (canto superior direito)
    • Selecione "Alterar Senha"
    • Introduza a senha atual e a nova senha


================================================================================
10. BACKUPS
================================================================================

Os backups guardam todos os dados do CMS (conteúdo, galeria, menu, utilizadores).
São armazenados em: data/backups/

  Criar backup manual:
    • Painel → Backup → "Criar Backup"
    • Introduza uma descrição e clique em "Criar"

  Backup automático:
    • Configurado para correr diariamente às 02:00 (BACKUP_SCHEDULE no .env)
    • Retenção: 30 dias (BACKUP_RETENTION_DAYS no .env)

  Restaurar backup:
    • Painel → Backup → clique em "Restaurar" na linha do backup desejado

  Exportar/Importar:
    • "Exportar" faz download do backup como ficheiro .zip
    • "Importar" permite carregar um backup de outro servidor


================================================================================
11. VARIÁVEIS DE AMBIENTE (.env)
================================================================================

Ficheiro: c:\Users\JFreire\AI APPs\nyumba-admin-app\.env

  PORT=3000                          # Porta do servidor
  NODE_ENV=development               # development | production
  DOMAIN=localhost                   # Domínio público em produção

  SESSION_SECRET=chave_secreta       # Chave para sessões (mude em produção!)
  JWT_SECRET=chave_jwt               # Chave JWT (mude em produção!)
  ADMIN_INITIAL_PASSWORD=Admin123!   # Senha inicial do admin

  BACKUP_ENABLED=true                # Ativar backup automático
  BACKUP_SCHEDULE=0 2 * * *         # Cron: diário às 02:00
  BACKUP_RETENTION_DAYS=30           # Dias de retenção dos backups

  RATE_LIMIT_WINDOW=15               # Janela de rate limit (minutos)
  RATE_LIMIT_MAX=100                 # Máx. requisições por janela

  # Deploy (adicione estas linhas para ativar)
  DEPLOY_ENABLED=true
  DEPLOY_BRANCH=main
  DEPLOY_HOOK_SECRET=segredo_webhook
  DEPLOY_TARGET_PATH=C:\caminho\para\Nyumba


================================================================================
12. ESTRUTURA DO PROJETO
================================================================================

  nyumba-admin-app/
  ├── server/
  │   ├── server.js              # Entrada principal
  │   ├── routes/
  │   │   ├── auth.js            # Autenticação e gestão de utilizadores
  │   │   ├── admin.js           # CRUD de conteúdo, galeria, menu, backups
  │   │   └── deploy.js          # Deploy, webhook GitHub, rollback
  │   ├── services/
  │   │   ├── authService.js     # Lógica de autenticação
  │   │   └── backupService.js   # Lógica de backups
  │   ├── middlewares/
  │   │   └── auth.js            # Middleware de autenticação
  │   └── utils/
  │       ├── config.js          # Gestão de configuração
  │       └── logger.js          # Sistema de logs
  ├── public/
  │   ├── admin.html             # Painel de administração (SPA)
  │   ├── login.html             # Página de login
  │   ├── css/
  │   │   └── admin.css          # Estilos do painel
  │   ├── js/
  │   │   ├── admin.js           # Lógica do painel
  │   │   └── auth.js            # Lógica de autenticação frontend
  │   └── uploads/               # Imagens carregadas
  ├── data/                      # Dados persistidos (JSON)
  │   ├── users.json
  │   ├── home.json
  │   ├── gallery.json
  │   ├── menu.json
  │   └── backups/
  ├── logs/                      # Logs do servidor
  ├── .env                       # Variáveis de ambiente
  ├── nodemon.json               # Configuração do nodemon
  ├── package.json
  └── README.txt                 # Este ficheiro


================================================================================
13. SEGURANÇA — PASSOS OBRIGATÓRIOS EM PRODUÇÃO
================================================================================

  ❶ Altere TODAS as chaves secretas no .env:
       SESSION_SECRET → string aleatória longa (min. 64 caracteres)
       JWT_SECRET     → string aleatória longa (min. 64 caracteres)
       DEPLOY_HOOK_SECRET → string aleatória

  ❷ Altere a senha do admin imediatamente após o primeiro login

  ❸ Em produção, defina NODE_ENV=production no .env
       (ativa cookies seguros, desativa logs de debug)

  ❹ Use HTTPS — configure um proxy reverso (nginx/caddy) com certificado SSL

  ❺ Restrinja o acesso ao painel por IP se possível (firewall)

  ❻ Faça backup regular dos ficheiros data/*.json


================================================================================
  Suporte: admin@nyumba.com
  GitHub: https://github.com/Nyumba2025/Nyumba
================================================================================
