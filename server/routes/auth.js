const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authService = require('../services/authService');
const { requireAuth, requireRole, verifyToken, generateCsrfToken, csrfProtection } = require('../middlewares/auth');
const { createLogger } = require('../utils/logger');
const rateLimit = require('express-rate-limit');

const logger = createLogger('auth-routes');

// Rate limiting para login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // 5 tentativas
    message: {
        success: false,
        message: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiting para registro
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3, // 3 registros por hora
    message: {
        success: false,
        message: 'Muitas tentativas de registro. Tente novamente mais tarde.'
    }
});

// Validadores
const loginValidator = [
    body('username')
        .trim()
        .notEmpty().withMessage('Nome de usuário ou email é obrigatório')
        .isLength({ min: 3 }).withMessage('Mínimo 3 caracteres'),
    body('password')
        .notEmpty().withMessage('Senha é obrigatória')
];

const registerValidator = [
    body('username')
        .trim()
        .notEmpty().withMessage('Nome de usuário é obrigatório')
        .isLength({ min: 3 }).withMessage('Mínimo 3 caracteres')
        .matches(/^[a-zA-Z0-9_]+$/).withMessage('Apenas letras, números e underscore'),
    body('email')
        .trim()
        .notEmpty().withMessage('Email é obrigatório')
        .isEmail().withMessage('Email inválido')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('Senha é obrigatória')
        .isLength({ min: 8 }).withMessage('Mínimo 8 caracteres')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Deve conter maiúscula, minúscula, número e caractere especial'),
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Senhas não conferem');
            }
            return true;
        }),
    body('fullName')
        .optional()
        .trim()
        .isLength({ min: 2 }).withMessage('Nome deve ter pelo menos 2 caracteres'),
    body('role')
        .optional()
        .isIn(['admin', 'editor', 'viewer']).withMessage('Role inválida')
];

const changePasswordValidator = [
    body('currentPassword')
        .notEmpty().withMessage('Senha atual é obrigatória'),
    body('newPassword')
        .notEmpty().withMessage('Nova senha é obrigatória')
        .isLength({ min: 8 }).withMessage('Mínimo 8 caracteres')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Deve conter maiúscula, minúscula, número e caractere especial'),
    body('confirmNewPassword')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Senhas não conferem');
            }
            return true;
        })
];

// Middleware para gerar token CSRF em rotas que precisam
router.use(generateCsrfToken);

// Rota de login
router.post('/login', loginLimiter, loginValidator, csrfProtection, async (req, res) => {
    try {
        // Validar entrada
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { username, password } = req.body;
        
        // Tentar login
        const result = await authService.login(username, password);
        
        if (result.success) {
            // Configurar sessão
            req.session.user = result.user;
            req.session.token = result.token;
            req.session.csrfToken = require('crypto').randomBytes(32).toString('hex');
            
            // Registrar login bem-sucedido
            logger.info(`Login realizado: ${username} (${result.user.role})`);
            
            res.json({
                success: true,
                user: result.user,
                token: result.token,
                csrfToken: req.session.csrfToken,
                message: 'Login realizado com sucesso'
            });
        } else {
            // Login falhou
            logger.warn(`Tentativa de login falhou: ${username}`);
            res.status(401).json({
                success: false,
                message: result.message || 'Credenciais inválidas'
            });
        }
    } catch (error) {
        logger.error('Erro no endpoint de login:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota de logout
router.post('/logout', (req, res) => {
    try {
        const username = req.session.user?.username || 'unknown';
        
        // Destruir sessão
        req.session.destroy((err) => {
            if (err) {
                logger.error('Erro ao destruir sessão:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Erro ao fazer logout'
                });
            }
            
            logger.info(`Logout realizado: ${username}`);
            res.clearCookie('connect.sid');
            res.json({
                success: true,
                message: 'Logout realizado com sucesso'
            });
        });
    } catch (error) {
        logger.error('Erro no endpoint de logout:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota para verificar sessão atual
router.get('/session', (req, res) => {
    try {
        if (req.session.user && req.session.token) {
            res.json({
                authenticated: true,
                user: req.session.user,
                csrfToken: req.session.csrfToken
            });
        } else {
            res.json({
                authenticated: false
            });
        }
    } catch (error) {
        logger.error('Erro ao verificar sessão:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota para verificar token JWT
router.post('/verify-token', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Token não fornecido'
            });
        }
        
        const result = await authService.verifyToken(token);
        
        if (result.success) {
            res.json({
                success: true,
                user: result.user,
                valid: true
            });
        } else {
            res.json({
                success: false,
                valid: false,
                message: result.message
            });
        }
    } catch (error) {
        logger.error('Erro ao verificar token:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota para alterar senha (requer autenticação)
router.post('/change-password', requireAuth, changePasswordValidator, csrfProtection, async (req, res) => {
    try {
        // Validar entrada
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { currentPassword, newPassword } = req.body;
        const username = req.session.user.username;
        
        // Alterar senha
        const result = await authService.changePassword(username, currentPassword, newPassword);
        
        if (result.success) {
            // Forçar logout após alteração de senha
            req.session.destroy(() => {
                logger.info(`Senha alterada e logout forçado: ${username}`);
                res.json({
                    success: true,
                    message: 'Senha alterada com sucesso. Faça login novamente.',
                    requiresReauth: true
                });
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        logger.error('Erro ao alterar senha:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota para registrar novo usuário (apenas admin)
router.post('/register', requireAuth, requireRole('admin'), registerLimiter, registerValidator, csrfProtection, async (req, res) => {
    try {
        // Validar entrada
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { username, email, password, role, fullName } = req.body;
        const adminUsername = req.session.user.username;
        
        // Registrar usuário
        const result = await authService.registerUser(
            username,
            email,
            password,
            role || 'editor',
            fullName
        );
        
        if (result.success) {
            logger.info(`Usuário registrado por ${adminUsername}: ${username} (${role || 'editor'})`);
            res.status(201).json({
                success: true,
                user: result.user,
                message: 'Usuário registrado com sucesso'
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        logger.error('Erro no registro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota para resetar senha (apenas admin)
router.post('/reset-password', requireAuth, requireRole('admin'), csrfProtection, async (req, res) => {
    try {
        const { username } = req.body;
        const adminUsername = req.session.user.username;
        
        if (!username) {
            return res.status(400).json({
                success: false,
                message: 'Nome de usuário é obrigatório'
            });
        }
        
        // Resetar senha
        const result = await authService.resetPassword(username);
        
        if (result.success) {
            logger.info(`Senha resetada por ${adminUsername}: ${username}`);
            res.json({
                success: true,
                message: 'Senha resetada com sucesso',
                temporaryPassword: result.temporaryPassword,
                warning: 'Esta senha deve ser compartilhada com segurança e alterada no primeiro login'
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        logger.error('Erro ao resetar senha:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota para obter lista de usuários (apenas admin)
router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const users = await authService.getAllUsers();
        res.json({
            success: true,
            users,
            count: users.length
        });
    } catch (error) {
        logger.error('Erro ao obter usuários:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota para obter informações de um usuário específico
router.get('/users/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const currentUser = req.session.user;
        
        // Usuários só podem ver seu próprio perfil, a menos que sejam admin
        if (currentUser.id !== id && currentUser.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Permissão insuficiente'
            });
        }
        
        const user = await authService.getUserById(id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }
        
        res.json({
            success: true,
            user
        });
    } catch (error) {
        logger.error('Erro ao obter usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota para atualizar usuário
router.put('/users/:id', requireAuth, csrfProtection, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const currentUser = req.session.user;
        
        // Verificar permissões
        if (currentUser.id !== id && currentUser.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Permissão insuficiente'
            });
        }
        
        // Admin pode alterar role, outros não
        if (updates.role && currentUser.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Apenas administradores podem alterar roles'
            });
        }
        
        // Não permitir desativar a si mesmo
        if (updates.active === false && currentUser.id === id) {
            return res.status(400).json({
                success: false,
                message: 'Não é possível desativar seu próprio usuário'
            });
        }
        
        const result = await authService.updateUser(id, updates);
        
        if (result.success) {
            // Se o usuário atualizou a si mesmo, atualizar sessão
            if (currentUser.id === id) {
                req.session.user = {
                    ...req.session.user,
                    ...result.user
                };
            }
            
            logger.info(`Usuário atualizado: ${id} por ${currentUser.username}`);
            res.json({
                success: true,
                user: result.user,
                message: 'Usuário atualizado com sucesso'
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        logger.error('Erro ao atualizar usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota para deletar/desativar usuário (apenas admin, soft delete)
router.delete('/users/:id', requireAuth, requireRole('admin'), csrfProtection, async (req, res) => {
    try {
        const { id } = req.params;
        const currentUserId = req.session.user.id;
        
        const result = await authService.deleteUser(id, currentUserId);
        
        if (result.success) {
            logger.info(`Usuário desativado: ${id} por ${req.session.user.username}`);
            res.json({
                success: true,
                message: result.message
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        logger.error('Erro ao deletar usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota para repor senha de um utilizador por ID (apenas admin)
router.post('/users/:id/reset-password', requireAuth, requireRole('admin'), csrfProtection, async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;
        const adminUsername = req.session.user.username;

        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Nova senha deve ter pelo menos 8 caracteres'
            });
        }

        // Buscar utilizador
        const user = await authService.getUserById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Utilizador não encontrado' });
        }

        const result = await authService.changePasswordAdmin(id, newPassword);

        if (result.success) {
            logger.info(`Senha reposta por ${adminUsername} para utilizador ${id}`);
            res.json({ success: true, message: 'Senha reposta com sucesso' });
        } else {
            res.status(400).json({ success: false, message: result.message });
        }
    } catch (error) {
        logger.error('Erro ao repor senha:', error);
        res.status(500).json({ success: false, message: 'Erro interno no servidor' });
    }
});


// Rota para buscar usuários (apenas admin)
router.get('/users/search/:query', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { query } = req.params;
        const { limit = 20 } = req.query;
        
        const users = await authService.searchUsers(query, parseInt(limit));
        
        res.json({
            success: true,
            users,
            count: users.length
        });
    } catch (error) {
        logger.error('Erro ao buscar usuários:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota para atualizar preferências do usuário
router.put('/preferences', requireAuth, csrfProtection, async (req, res) => {
    try {
        const preferences = req.body;
        const userId = req.session.user.id;
        
        const result = await authService.updatePreferences(userId, preferences);
        
        if (result.success) {
            // Atualizar preferências na sessão
            req.session.user.preferences = result.preferences;
            
            res.json({
                success: true,
                preferences: result.preferences,
                message: 'Preferências atualizadas com sucesso'
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        logger.error('Erro ao atualizar preferências:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota para obter sessões ativas (apenas admin)
router.get('/sessions', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const sessions = await authService.getActiveSessions();
        
        res.json({
            success: true,
            sessions,
            count: sessions.length
        });
    } catch (error) {
        logger.error('Erro ao obter sessões:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota para revogar sessão (apenas admin)
router.delete('/sessions/:sessionId', requireAuth, requireRole('admin'), csrfProtection, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'ID do usuário é obrigatório'
            });
        }
        
        const result = await authService.revokeSession(userId, sessionId);
        
        res.json({
            success: result.success,
            message: result.message
        });
    } catch (error) {
        logger.error('Erro ao revogar sessão:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota para revogar todas as sessões de um usuário (apenas admin)
router.delete('/sessions/user/:userId', requireAuth, requireRole('admin'), csrfProtection, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await authService.revokeAllSessions(userId);
        
        res.json({
            success: result.success,
            message: result.message
        });
    } catch (error) {
        logger.error('Erro ao revogar todas as sessões:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Rota para refresh de token CSRF
router.get('/csrf-token', (req, res) => {
    try {
        if (!req.session.csrfToken) {
            req.session.csrfToken = require('crypto').randomBytes(32).toString('hex');
        }
        
        res.json({
            success: true,
            csrfToken: req.session.csrfToken
        });
    } catch (error) {
        logger.error('Erro ao gerar token CSRF:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    }
});

// Health check para autenticação
router.get('/health', (req, res) => {
    res.json({
        service: 'authentication',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        features: {
            login: true,
            registration: true,
            passwordReset: true,
            sessionManagement: true,
            csrfProtection: true
        }
    });
});

module.exports = router;