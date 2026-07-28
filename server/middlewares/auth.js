const jwt = require('jsonwebtoken');
const { createLogger } = require('../utils/logger');
const config = require('../utils/config');
const authService = require('../services/authService');

const logger = createLogger('auth-middleware');

// Middleware de autenticação básica (sessão)
function requireAuth(req, res, next) {
    if (!req.session.user) {
        logger.warn('Tentativa de acesso não autorizado (sessão):', req.path);
        return res.status(401).json({ 
            success: false, 
            message: 'Não autenticado' 
        });
    }
    
    // Verificar se o usuário ainda existe e está ativo
    const user = authService.users.find(u => 
        u.id === req.session.user.id && u.active
    );
    
    if (!user) {
        req.session.destroy();
        return res.status(401).json({ 
            success: false, 
            message: 'Sessão expirada' 
        });
    }
    
    // Atualizar dados do usuário na sessão se necessário
    req.session.user = {
        ...req.session.user,
        role: user.role,
        fullName: user.fullName,
        email: user.email
    };
    
    next();
}

// Middleware para verificar token JWT (para API)
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Token não fornecido' 
        });
    }
    
    try {
        const decoded = jwt.verify(token, config.get('security.jwtSecret'));
        
        // Verificar se o usuário ainda existe e está ativo
        const user = authService.users.find(u => 
            u.id === decoded.id && u.active
        );
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Token inválido - usuário não encontrado' 
            });
        }
        
        req.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            fullName: user.fullName
        };
        
        next();
    } catch (error) {
        logger.error('Erro na verificação do token:', error);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                message: 'Token expirado' 
            });
        }
        
        return res.status(401).json({ 
            success: false, 
            message: 'Token inválido' 
        });
    }
}

// Middleware para verificar role específica
function requireRole(requiredRole) {
    return (req, res, next) => {
        const user = req.session.user || req.user;
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Não autenticado' 
            });
        }
        
        // Hierarquia de roles: admin > editor > viewer
        const roleHierarchy = {
            'viewer': 1,
            'editor': 2,
            'admin': 3
        };
        
        const userRoleLevel = roleHierarchy[user.role] || 0;
        const requiredRoleLevel = roleHierarchy[requiredRole] || 0;
        
        if (userRoleLevel < requiredRoleLevel) {
            logger.warn(`Tentativa de acesso não autorizado (role: ${requiredRole}):`, user.username);
            return res.status(403).json({ 
                success: false, 
                message: 'Permissão insuficiente' 
            });
        }
        
        next();
    };
}

// Middleware para logging de acesso
function accessLogger(req, res, next) {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const user = req.session?.user?.username || req.user?.username || 'anonymous';
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const method = req.method;
        const url = req.originalUrl;
        const status = res.statusCode;
        const userAgent = req.headers['user-agent'] || '';
        
        const logMessage = `${method} ${url} ${status} - ${user} - ${ip} - ${duration}ms`;
        
        // Log diferente para erros
        if (status >= 400) {
            logger.warn(logMessage, { 
                userAgent,
                body: method !== 'GET' ? req.body : undefined
            });
        } else {
            logger.access(logMessage);
        }
    });
    
    next();
}

// Middleware para prevenir ataques CSRF
function csrfProtection(req, res, next) {
    // Métodos seguros (não precisam de CSRF)
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        return next();
    }
    
    // Verificar token CSRF
    const csrfToken = req.headers['x-csrf-token'] || req.body._csrf;
    const sessionToken = req.session.csrfToken;
    
    if (!csrfToken || csrfToken !== sessionToken) {
        logger.warn('Tentativa de CSRF detectada', {
            ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            userAgent: req.headers['user-agent']
        });
        
        return res.status(403).json({ 
            success: false, 
            message: 'Token CSRF inválido' 
        });
    }
    
    next();
}

// Gerar token CSRF
function generateCsrfToken(req, res, next) {
    if (!req.session.csrfToken) {
        req.session.csrfToken = require('crypto').randomBytes(32).toString('hex');
    }
    
    // Adicionar token à resposta para uso do cliente
    res.locals.csrfToken = req.session.csrfToken;
    next();
}

// Middleware para validação de input básica
function validateInput(rules) {
    return (req, res, next) => {
        const errors = {};
        
        for (const field in rules) {
            const rule = rules[field];
            const value = req.body[field];
            
            // Verificar se é obrigatório
            if (rule.required && (!value || value.trim() === '')) {
                errors[field] = errors[field] || [];
                errors[field].push('Campo obrigatório');
            }
            
            // Verificar tipo
            if (value && rule.type) {
                let isValid = true;
                
                switch (rule.type) {
                    case 'email':
                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        isValid = emailRegex.test(value);
                        break;
                    case 'number':
                        isValid = !isNaN(Number(value));
                        break;
                    case 'boolean':
                        isValid = typeof value === 'boolean' || 
                                 value === 'true' || value === 'false' ||
                                 value === '1' || value === '0';
                        break;
                    case 'array':
                        isValid = Array.isArray(value);
                        break;
                    case 'object':
                        isValid = typeof value === 'object' && !Array.isArray(value);
                        break;
                }
                
                if (!isValid) {
                    errors[field] = errors[field] || [];
                    errors[field].push(`Tipo inválido. Esperado: ${rule.type}`);
                }
            }
            
            // Verificar comprimento mínimo
            if (value && rule.minLength && value.length < rule.minLength) {
                errors[field] = errors[field] || [];
                errors[field].push(`Mínimo ${rule.minLength} caracteres`);
            }
            
            // Verificar comprimento máximo
            if (value && rule.maxLength && value.length > rule.maxLength) {
                errors[field] = errors[field] || [];
                errors[field].push(`Máximo ${rule.maxLength} caracteres`);
            }
            
            // Verificar padrão regex
            if (value && rule.pattern) {
                const regex = new RegExp(rule.pattern);
                if (!regex.test(value)) {
                    errors[field] = errors[field] || [];
                    errors[field].push('Formato inválido');
                }
            }
            
            // Validação personalizada
            if (value && rule.validate) {
                const validationResult = rule.validate(value, req.body);
                if (validationResult !== true) {
                    errors[field] = errors[field] || [];
                    errors[field].push(validationResult);
                }
            }
        }
        
        if (Object.keys(errors).length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Erro de validação',
                errors
            });
        }
        
        next();
    };
}

// Middleware para sanitização básica
function sanitizeInput(req, res, next) {
    if (req.body) {
        for (const key in req.body) {
            if (typeof req.body[key] === 'string') {
                // Remover tags HTML perigosas
                req.body[key] = req.body[key]
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/on\w+="[^"]*"/g, '')
                    .replace(/on\w+='[^']*'/g, '')
                    .replace(/on\w+=\w+/g, '')
                    .trim();
                
                // Limitar comprimento para strings muito longas
                if (req.body[key].length > 10000) {
                    req.body[key] = req.body[key].substring(0, 10000);
                }
            }
        }
    }
    
    next();
}

// Middleware para rate limiting por IP
function rateLimitByIp(maxRequests, windowMinutes) {
    const requests = new Map();
    
    return (req, res, next) => {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const now = Date.now();
        const windowMs = windowMinutes * 60 * 1000;
        
        // Limpar requisições antigas
        for (const [key, data] of requests.entries()) {
            if (now - data.timestamp > windowMs) {
                requests.delete(key);
            }
        }
        
        // Contar requisições deste IP
        if (!requests.has(ip)) {
            requests.set(ip, { count: 1, timestamp: now });
        } else {
            const data = requests.get(ip);
            data.count++;
            data.timestamp = now;
        }
        
        const ipData = requests.get(ip);
        
        if (ipData.count > maxRequests) {
            logger.warn(`Rate limit excedido para IP: ${ip}`);
            return res.status(429).json({
                success: false,
                message: 'Muitas requisições. Tente novamente mais tarde.'
            });
        }
        
        // Adicionar headers de rate limit
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', maxRequests - ipData.count);
        res.setHeader('X-RateLimit-Reset', Math.ceil((ipData.timestamp + windowMs) / 1000));
        
        next();
    };
}

// Middleware para compressão de resposta (simplificado)
function compressionMiddleware(req, res, next) {
    const acceptEncoding = req.headers['accept-encoding'] || '';
    
    if (acceptEncoding.includes('gzip')) {
        res.setHeader('Content-Encoding', 'gzip');
        // Em produção, use um middleware de compressão real
    }
    
    next();
}

// Middleware para CORS personalizado
function corsMiddleware(req, res, next) {
    const allowedOrigins = [
        config.get('server.domain'),
        'http://localhost:3000',
        'http://localhost:8080'
    ];
    
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin) || config.isDevelopment()) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 
            'Content-Type, Authorization, X-CSRF-Token, X-Requested-With');
        res.setHeader('Access-Control-Expose-Headers', 
            'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');
    }
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
}

// Middleware para cache control
function cacheControlMiddleware(req, res, next) {
    if (req.method === 'GET') {
        // Cache por 5 minutos para arquivos estáticos
        res.setHeader('Cache-Control', 'public, max-age=300');
    } else {
        // Não cachear respostas de API
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    
    next();
}

// Middleware para segurança de headers
function securityHeadersMiddleware(req, res, next) {
    // Prevenir clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Prevenir MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Política de referrer
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions Policy
    res.setHeader('Permissions-Policy', 
        'camera=(), microphone=(), geolocation=(), payment=()');
    
    // Content Security Policy (básica)
    if (config.isProduction()) {
        res.setHeader('Content-Security-Policy',
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: https:; " +
            "font-src 'self'; " +
            "connect-src 'self'; " +
            "frame-ancestors 'none';"
        );
    }
    
    next();
}

// Middleware para validação de tamanho de payload
function payloadSizeLimit(maxSizeMB) {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    
    return (req, res, next) => {
        const contentLength = parseInt(req.headers['content-length'] || '0');
        
        if (contentLength > maxSizeBytes) {
            return res.status(413).json({
                success: false,
                message: `Payload muito grande. Máximo: ${maxSizeMB}MB`
            });
        }
        
        next();
    };
}

module.exports = {
    requireAuth,
    verifyToken,
    requireRole,
    accessLogger,
    csrfProtection,
    generateCsrfToken,
    validateInput,
    sanitizeInput,
    rateLimitByIp,
    compressionMiddleware,
    corsMiddleware,
    cacheControlMiddleware,
    securityHeadersMiddleware,
    payloadSizeLimit
};