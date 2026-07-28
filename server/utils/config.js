const path = require('path');
const fs = require('fs').promises;
const { createLogger } = require('./logger');

const logger = createLogger('config');

// Diretório base: ao lado do .exe em produção, raiz do projeto em desenvolvimento
const appBase = process.env.APP_BASE_PATH || (typeof process.pkg !== 'undefined' ? path.dirname(process.execPath) : path.join(__dirname, '../..'));
// Ficheiros estáticos (public/) ficam embebidos no pkg; em dev usamos o caminho normal
const publicBase = typeof process.pkg !== 'undefined'
    ? path.join(__dirname, '../../public')   // virtual fs dentro do .exe
    : path.join(appBase, 'public');

class Config {
    constructor() {
        this.config = {
            server: {
                port: parseInt(process.env.PORT) || 3000,
                env: process.env.NODE_ENV || 'development',
                domain: process.env.DOMAIN || 'localhost',
                trustProxy: process.env.TRUST_PROXY || false
            },
            security: {
                sessionSecret: process.env.SESSION_SECRET || 'dev_secret_change_in_production',
                jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production',
                bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12,
                adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD || 'Admin123!',
                rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 15,
                rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100
            },
            database: {
                host: process.env.DB_HOST || 'localhost',
                user: process.env.DB_USER || 'nyumba_admin',
                password: process.env.DB_PASSWORD || '',
                name: process.env.DB_NAME || 'nyumba_db',
                port: parseInt(process.env.DB_PORT) || 3306,
                dialect: process.env.DB_DIALECT || 'mysql'
            },
            backup: {
                enabled: process.env.BACKUP_ENABLED === 'true',
                schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *',
                retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30,
                path: process.env.BACKUP_PATH || './data/backups'
            },
            deploy: {
                enabled: process.env.DEPLOY_ENABLED === 'true',
                branch: process.env.DEPLOY_BRANCH || 'main',
                hookSecret: process.env.DEPLOY_HOOK_SECRET || 'hook_secret',
                targetPath: process.env.DEPLOY_TARGET_PATH || '/var/www/nyumba'
            },
            email: {
                smtpHost: process.env.SMTP_HOST || '',
                smtpPort: parseInt(process.env.SMTP_PORT) || 587,
                smtpUser: process.env.SMTP_USER || '',
                smtpPassword: process.env.SMTP_PASSWORD || '',
                from: process.env.EMAIL_FROM || 'no-reply@nyumba.com',
                admin: process.env.EMAIL_ADMIN || 'admin@nyumba.com'
            },
            github: {
                token: process.env.GITHUB_TOKEN || '',
                repo: process.env.GITHUB_REPO || ''
            },
            paths: {
                data:    path.join(appBase, 'data'),
                temp:    path.join(appBase, 'temp'),
                logs:    path.join(appBase, 'logs'),
                public:  publicBase,
                uploads: path.join(appBase, 'uploads')
            }
        };
    }

    get(key) {
        return key.split('.').reduce((obj, part) => obj && obj[part], this.config);
    }

    set(key, value) {
        const parts = key.split('.');
        const last = parts.pop();
        const obj = parts.reduce((obj, part) => {
            if (!obj[part]) obj[part] = {};
            return obj[part];
        }, this.config);
        obj[last] = value;
    }

    getAll() {
        return this.config;
    }

    async validate() {
        const errors = [];

        // Validar configurações obrigatórias em produção
        if (this.config.server.env === 'production') {
            if (this.config.security.sessionSecret.includes('dev_secret') ||
                this.config.security.jwtSecret.includes('dev_jwt_secret')) {
                errors.push('As chaves secretas devem ser alteradas em produção');
            }
        }

        // Validar diretórios
        const requiredDirs = [
            this.config.paths.data,
            this.config.paths.temp,
            this.config.paths.logs,
            this.config.paths.uploads
        ];

        for (const dir of requiredDirs) {
            try {
                await fs.mkdir(dir, { recursive: true });
                logger.info(`Diretório verificado/criado: ${dir}`);
            } catch (error) {
                errors.push(`Não foi possível criar o diretório ${dir}: ${error.message}`);
            }
        }

        // Validar permissões de escrita
        const writeTestFiles = [
            path.join(this.config.paths.temp, '.write_test'),
            path.join(this.config.paths.logs, '.write_test')
        ];

        for (const testFile of writeTestFiles) {
            try {
                await fs.writeFile(testFile, 'test');
                await fs.unlink(testFile);
            } catch (error) {
                errors.push(`Sem permissão de escrita em ${path.dirname(testFile)}`);
            }
        }

        if (errors.length > 0) {
            logger.warn('Avisos de configuração:', { errors });
        }

        logger.info('Configuração validada com sucesso');
        return true;
    }

    async saveToFile() {
        const configFile = path.join(__dirname, '../../config.json');
        try {
            await fs.writeFile(
                configFile,
                JSON.stringify(this.config, null, 2)
            );
            logger.info('Configuração salva em arquivo');
        } catch (error) {
            logger.error('Erro ao salvar configuração:', error);
        }
    }

    async loadFromFile() {
        const configFile = path.join(__dirname, '../../config.json');
        try {
            const data = await fs.readFile(configFile, 'utf8');
            const fileConfig = JSON.parse(data);
            
            // Mesclar configurações (arquivo tem prioridade sobre env)
            this.mergeConfigs(fileConfig);
            logger.info('Configuração carregada do arquivo');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Erro ao carregar configuração do arquivo:', error);
            }
        }
    }

    mergeConfigs(newConfig) {
        const merge = (target, source) => {
            for (const key in source) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    if (!target[key]) target[key] = {};
                    merge(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        };

        merge(this.config, newConfig);
    }

    getDatabaseUrl() {
        const db = this.config.database;
        if (db.dialect === 'sqlite') {
            return `sqlite:${path.join(this.config.paths.data, 'nyumba.db')}`;
        }
        return `${db.dialect}://${db.user}:${db.password}@${db.host}:${db.port}/${db.name}`;
    }

    isProduction() {
        return this.config.server.env === 'production';
    }

    isDevelopment() {
        return this.config.server.env === 'development';
    }

    getCorsOptions() {
        return {
            origin: this.isProduction() 
                ? this.config.server.domain 
                : true,
            credentials: true,
            optionsSuccessStatus: 200
        };
    }

    getSessionOptions() {
        return {
            secret: this.config.security.sessionSecret,
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: this.isProduction(),
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000, // 24 horas
                sameSite: this.isProduction() ? 'strict' : 'lax'
            },
            name: 'nyumba.sid'
        };
    }

    getRateLimitOptions() {
        return {
            windowMs: this.config.security.rateLimitWindow * 60 * 1000,
            max: this.config.security.rateLimitMax,
            message: {
                success: false,
                message: 'Muitas requisições. Tente novamente mais tarde.'
            },
            standardHeaders: true,
            legacyHeaders: false
        };
    }
}

// Singleton
const config = new Config();

// Inicializar
(async () => {
    try {
        await config.loadFromFile();
        await config.validate();
        
        if (config.isDevelopment()) {
            logger.warn('Executando em modo de desenvolvimento');
            logger.warn('Configure variáveis de ambiente para produção');
        }
    } catch (error) {
        logger.error('Erro na inicialização da configuração:', error);
        process.exit(1);
    }
})();

module.exports = config;