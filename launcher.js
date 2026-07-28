/**
 * launcher.js — Ponto de entrada do executável NyumbaAdmin.exe
 *
 * Quando empacotado com `pkg`:
 *   - Detecta que está a correr como .exe (process.pkg !== undefined)
 *   - Define os caminhos de dados/logs no diretório real ao lado do .exe
 *   - Carrega .env do diretório real (cria um default se não existir)
 *   - Arranca o servidor Express
 *   - Abre o browser automaticamente no painel de administração
 */

'use strict';

const path  = require('path');
const fs    = require('fs');

// ─── Detectar ambiente pkg ───────────────────────────────────────────────────
const isPkg = typeof process.pkg !== 'undefined';

// Diretório onde o .exe está (ou raiz do projeto em dev)
const baseDir = isPkg
    ? path.dirname(process.execPath)
    : path.join(__dirname);

// Expor para config.js e server.js
process.env.APP_BASE_PATH = baseDir;

// ─── Carregar (ou criar) .env ────────────────────────────────────────────────
const envPath = path.join(baseDir, '.env');

if (!fs.existsSync(envPath)) {
    // Criar .env padrão ao lado do .exe na primeira execução
    const defaultEnv = [
        'PORT=3000',
        'NODE_ENV=production',
        'DOMAIN=localhost',
        'SESSION_SECRET=' + randomSecret(48),
        'JWT_SECRET='     + randomSecret(48),
        'ADMIN_INITIAL_PASSWORD=Admin123!',
        'BACKUP_ENABLED=true',
        'BACKUP_SCHEDULE=0 2 * * *',
        'BACKUP_RETENTION_DAYS=30',
        'RATE_LIMIT_WINDOW=15',
        'RATE_LIMIT_MAX=100',
        'DEPLOY_ENABLED=false',
        'DEPLOY_BRANCH=main',
    ].join('\n');

    fs.writeFileSync(envPath, defaultEnv, 'utf8');
    console.log('[NyumbaAdmin] Ficheiro .env criado em: ' + envPath);
}

require('dotenv').config({ path: envPath });

// ─── Criar diretórios de dados se não existirem ──────────────────────────────
const dirs = [
    path.join(baseDir, 'data'),
    path.join(baseDir, 'data', 'backups'),
    path.join(baseDir, 'temp'),
    path.join(baseDir, 'logs'),
    path.join(baseDir, 'uploads'),
];

for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// ─── Arrancar o servidor ──────────────────────────────────────────────────────
const port = parseInt(process.env.PORT) || 3000;

console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║        NYUMBA ADMIN — A arrancar...          ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');
console.log('  URL: http://localhost:' + port + '/admin');
console.log('  Utilizador: admin');
console.log('  Pasta de dados: ' + baseDir);
console.log('');

require('./server/server.js');

// ─── Abrir o browser automaticamente ─────────────────────────────────────────
if (isPkg) {
    const { exec } = require('child_process');
    setTimeout(function () {
        exec('start http://localhost:' + port + '/admin');
        console.log('[NyumbaAdmin] Browser aberto em http://localhost:' + port + '/admin');
    }, 3000);
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function randomSecret(len) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let result = '';
    for (let i = 0; i < len; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}
