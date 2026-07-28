// .env já foi carregado pelo launcher.js se estivermos no .exe
if (!process.env.APP_BASE_PATH) { require('dotenv').config(); }

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const { createLogger } = require('./utils/logger');
const backupService = require('./services/backupService');

const app = express();
const logger = createLogger('server');
const port = process.env.PORT || 3000;

// Criar diretórios necessários (usar caminhos absolutos para funcionar no .exe)
async function createDirectories() {
    const base = process.env.APP_BASE_PATH || path.join(__dirname, '..');
    const dirs = [
        path.join(base, 'data'),
        path.join(base, 'data', 'backups'),
        path.join(base, 'temp'),
        path.join(base, 'logs'),
        path.join(base, 'uploads')
    ];
    
    for (const dir of dirs) {
        try {
            await fs.mkdir(dir, { recursive: true });
            logger.info(`Diretório criado: ${dir}`);
        } catch (error) {
            // Ignorar erro se já existir
            if (error.code !== 'EEXIST') {
                logger.error(`Erro ao criar diretório ${dir}:`, error);
            }
        }
    }
}

// Middlewares de segurança
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
            connectSrc: ["'self'"]
        }
    }
}));
app.use(compression());
app.use(cors({
    origin: process.env.NODE_ENV === 'development' ? '*' : process.env.DOMAIN,
    credentials: true
}));

// Limite de requisições
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX),
    message: 'Muitas requisições. Tente novamente mais tarde.'
});
app.use('/api/', limiter);

// Session
const isPkgExe = typeof process.pkg !== 'undefined';
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret_dev',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,   // false: funciona com http://localhost no .exe
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
    }
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Desativar cache do browser para garantir carregamento dos ficheiros atualizados
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Ficheiros estáticos
// Dentro do .exe: public/ fica copiado ao lado do NyumbaAdmin.exe
// Em dev: dentro de public/ no projeto
const exeDir = process.env.APP_BASE_PATH || path.join(__dirname, '..');
const publicDir  = path.join(exeDir, 'public');
const uploadsDir = path.join(exeDir, 'uploads');

app.use(express.static(publicDir, { etag: false, maxAge: 0 }));
app.use('/uploads', express.static(uploadsDir));


// Rotas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/deploy', require('./routes/deploy'));

// Páginas
app.get('/admin', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(publicDir, 'login.html'));
});

app.get('/preview/:page?', (req, res) => {
    res.sendFile(path.join(publicDir, 'preview.html'));
});

app.get('/history', (req, res) => {
    res.sendFile(path.join(publicDir, 'history.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Inicializar
async function initialize() {
    try {
        await createDirectories();
        
        // Criar usuário admin inicial se não existir
        const authService = require('./services/authService');
        await authService.createInitialAdmin();
        
        // Iniciar backup automático
        if (process.env.BACKUP_ENABLED === 'true') {
            backupService.startAutoBackup();
            logger.info('Backup automático iniciado');
        }
        
        // Iniciar servidor
        app.listen(port, () => {
            logger.info(`Servidor rodando na porta ${port}`);
            logger.info(`Ambiente: ${process.env.NODE_ENV}`);
            logger.info(`Admin: http://localhost:${port}/admin`);
            logger.info(`Preview: http://localhost:${port}/preview`);
        });
    } catch (error) {
        logger.error('Erro ao inicializar servidor:', error);
        process.exit(1);
    }
}

// Gerenciar encerramento
process.on('SIGTERM', async () => {
    logger.info('Recebido SIGTERM, encerrando...');
    await backupService.createBackup('shutdown');
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('Recebido SIGINT, encerrando...');
    await backupService.createBackup('shutdown');
    process.exit(0);
});

// Iniciar
initialize();