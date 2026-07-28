const winston = require('winston');
const path = require('path');
const fs = require('fs').promises;

// Garantir que o diretório de logs existe
async function ensureLogDirectory() {
    const logDir = path.join(__dirname, '../../logs');
    try {
        await fs.mkdir(logDir, { recursive: true });
    } catch (error) {
        console.error('Erro ao criar diretório de logs:', error);
    }
}

// Formato personalizado para logs
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, module, ...meta }) => {
        const moduleStr = module ? ` [${module}]` : '';
        let metaStr = '';
        
        if (Object.keys(meta).length > 0) {
            // Remover stack trace para logs não-error
            if (level !== 'error') {
                delete meta.stack;
            }
            if (Object.keys(meta).length > 0) {
                metaStr = ' ' + JSON.stringify(meta);
            }
        }
        
        return `${timestamp} ${level.toUpperCase()}${moduleStr}: ${message}${metaStr}`;
    })
);

// Transportes (destinos dos logs)
const transports = {
    console: new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            logFormat
        ),
        level: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
    }),
    
    file: new winston.transports.File({
        filename: path.join(__dirname, '../../logs/error.log'),
        level: 'error',
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }),
    
    combined: new winston.transports.File({
        filename: path.join(__dirname, '../../logs/combined.log'),
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }),
    
    access: new winston.transports.File({
        filename: path.join(__dirname, '../../logs/access.log'),
        level: 'info',
        format: winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.printf(({ timestamp, message }) => {
                return `${timestamp}: ${message}`;
            })
        ),
        maxsize: 5242880,
        maxFiles: 10
    })
};

// Criar logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'nyumba-admin' },
    transports: [
        transports.console,
        transports.file,
        transports.combined
    ]
});

// Logger específico para acesso HTTP
const accessLogger = winston.createLogger({
    level: 'info',
    transports: [transports.access]
});

// Logger para backup
const backupLogger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
        new winston.transports.File({
            filename: path.join(__dirname, '../../logs/backup.log'),
            format: winston.format.combine(
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss'
                }),
                winston.format.printf(({ timestamp, level, message }) => {
                    return `${timestamp} ${level.toUpperCase()}: ${message}`;
                })
            ),
            maxsize: 5242880,
            maxFiles: 5
        }),
        transports.console
    ]
});

// Logger para deploy
const deployLogger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
        new winston.transports.File({
            filename: path.join(__dirname, '../../logs/deploy.log'),
            format: winston.format.combine(
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss'
                }),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    let metaStr = '';
                    if (Object.keys(meta).length > 0) {
                        metaStr = ' ' + JSON.stringify(meta);
                    }
                    return `${timestamp} ${level.toUpperCase()}: ${message}${metaStr}`;
                })
            ),
            maxsize: 5242880,
            maxFiles: 5
        }),
        transports.console
    ]
});

// Inicializar diretório de logs
ensureLogDirectory().catch(console.error);

/**
 * Cria um logger com módulo específico
 * @param {string} module - Nome do módulo
 * @returns {Object} Logger configurado
 */
function createLogger(module) {
    return {
        error: (message, meta) => logger.error(message, { module, ...meta }),
        warn: (message, meta) => logger.warn(message, { module, ...meta }),
        info: (message, meta) => logger.info(message, { module, ...meta }),
        debug: (message, meta) => logger.debug(message, { module, ...meta }),
        
        // Log de acesso HTTP
        access: (message) => accessLogger.info(message),
        
        // Log de backup
        backup: {
            info: (message, meta) => backupLogger.info(message, { module, ...meta }),
            error: (message, meta) => backupLogger.error(message, { module, ...meta }),
            warn: (message, meta) => backupLogger.warn(message, { module, ...meta })
        },
        
        // Log de deploy
        deploy: {
            info: (message, meta) => deployLogger.info(message, { module, ...meta }),
            error: (message, meta) => deployLogger.error(message, { module, ...meta }),
            warn: (message, meta) => deployLogger.warn(message, { module, ...meta })
        }
    };
}

/**
 * Middleware para log de acesso HTTP
 */
function httpLogger(req, res, next) {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const user = req.session?.user?.username || 'anonymous';
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        const logMessage = `${req.method} ${req.originalUrl} ${res.statusCode} - ${user} - ${ip} - ${duration}ms`;
        accessLogger.info(logMessage);
    });
    
    next();
}

/**
 * Limpa logs antigos
 * @param {number} days - Dias a manter
 */
async function cleanupOldLogs(days = 30) {
    const logDir = path.join(__dirname, '../../logs');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    try {
        const files = await fs.readdir(logDir);
        
        for (const file of files) {
            const filePath = path.join(logDir, file);
            const stats = await fs.stat(filePath);
            
            if (stats.mtime < cutoffDate) {
                await fs.unlink(filePath);
                logger.info(`Log antigo removido: ${file}`);
            }
        }
    } catch (error) {
        logger.error('Erro ao limpar logs antigos:', error);
    }
}

// Agendar limpeza de logs (semanal)
if (process.env.NODE_ENV === 'production') {
    setInterval(() => {
        cleanupOldLogs(30).catch(error => {
            console.error('Erro na limpeza de logs:', error);
        });
    }, 7 * 24 * 60 * 60 * 1000); // 7 dias
}

module.exports = {
    createLogger,
    httpLogger,
    cleanupOldLogs,
    logger: createLogger('system')
};