const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../utils/logger');
const config = require('../utils/config');

const logger = createLogger('auth-service');
const usersFile = path.join(config.get('paths.data'), 'users.json');

class AuthService {
    constructor() {
        this.users = [];
        this.initialize();
    }

    async initialize() {
        try {
            await this.loadUsers();
            
            // Criar usuário admin inicial se não existir
            const adminExists = this.users.find(u => u.role === 'admin');
            if (!adminExists) {
                await this.createInitialAdmin();
            }
            
            logger.info('Auth service inicializado');
        } catch (error) {
            logger.error('Erro ao inicializar auth service:', error);
        }
    }

    async loadUsers() {
        try {
            const data = await fs.readFile(usersFile, 'utf8');
            this.users = JSON.parse(data);
            logger.info(`${this.users.length} usuários carregados`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.users = [];
                await this.saveUsers();
            } else {
                throw error;
            }
        }
    }

    async saveUsers() {
        try {
            await fs.writeFile(usersFile, JSON.stringify(this.users, null, 2));
        } catch (error) {
            logger.error('Erro ao salvar usuários:', error);
            throw error;
        }
    }

    async createInitialAdmin() {
        try {
            const adminExists = this.users.find(u => u.role === 'admin');
            if (adminExists) {
                logger.info('Usuário admin inicial já existe');
                return adminExists;
            }
            const adminPassword = config.get('security.adminInitialPassword');
            const hashedPassword = await bcrypt.hash(adminPassword, config.get('security.bcryptSaltRounds'));
            
            const adminUser = {
                id: this.generateId(),
                username: 'admin',
                email: 'admin@nyumba.com',
                password: hashedPassword,
                role: 'admin',
                active: true,
                createdAt: new Date().toISOString(),
                lastLogin: null,
                fullName: 'Administrador',
                avatar: null
            };
            
            this.users.push(adminUser);
            await this.saveUsers();
            
            logger.info('Usuário admin inicial criado');
            logger.warn(`Senha inicial: ${adminPassword} - ALTERE IMEDIATAMENTE!`);
            
            return adminUser;
        } catch (error) {
            logger.error('Erro ao criar admin inicial:', error);
            throw error;
        }
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    async registerUser(username, email, password, role = 'editor', fullName = '') {
        try {
            // Validar se usuário já existe
            const userExists = this.users.find(u => 
                u.username === username || u.email === email
            );
            
            if (userExists) {
                return {
                    success: false,
                    message: 'Usuário ou email já existe'
                };
            }

            // Validar força da senha
            const passwordValidation = this.validatePassword(password);
            if (!passwordValidation.valid) {
                return {
                    success: false,
                    message: passwordValidation.message
                };
            }

            // Hash da senha
            const hashedPassword = await bcrypt.hash(
                password, 
                config.get('security.bcryptSaltRounds')
            );

            // Criar usuário
            const newUser = {
                id: this.generateId(),
                username,
                email,
                password: hashedPassword,
                role: ['admin', 'editor', 'viewer'].includes(role) ? role : 'editor',
                active: true,
                createdAt: new Date().toISOString(),
                lastLogin: null,
                fullName: fullName || username,
                avatar: null,
                preferences: {
                    theme: 'light',
                    language: 'pt',
                    notifications: true
                }
            };

            this.users.push(newUser);
            await this.saveUsers();

            logger.info(`Usuário registrado: ${username} (${role})`);

            return {
                success: true,
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    email: newUser.email,
                    role: newUser.role,
                    fullName: newUser.fullName,
                    createdAt: newUser.createdAt
                }
            };
        } catch (error) {
            logger.error('Erro ao registrar usuário:', error);
            return {
                success: false,
                message: 'Erro ao registrar usuário'
            };
        }
    }

    validatePassword(password) {
        const minLength = 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        if (password.length < minLength) {
            return {
                valid: false,
                message: `Senha deve ter pelo menos ${minLength} caracteres`
            };
        }

        if (!hasUpperCase || !hasLowerCase) {
            return {
                valid: false,
                message: 'Senha deve conter letras maiúsculas e minúsculas'
            };
        }

        if (!hasNumbers) {
            return {
                valid: false,
                message: 'Senha deve conter números'
            };
        }

        if (!hasSpecialChar) {
            return {
                valid: false,
                message: 'Senha deve conter pelo menos um caractere especial'
            };
        }

        return { valid: true };
    }

    async login(username, password) {
        try {
            // Buscar usuário (por username ou email)
            const user = this.users.find(u => 
                (u.username === username || u.email === username) && u.active
            );

            if (!user) {
                logger.warn(`Tentativa de login falhou - usuário não encontrado: ${username}`);
                return {
                    success: false,
                    message: 'Credenciais inválidas'
                };
            }

            // Verificar senha
            const passwordMatch = await bcrypt.compare(password, user.password);
            if (!passwordMatch) {
                logger.warn(`Tentativa de login falhou - senha incorreta: ${username}`);
                return {
                    success: false,
                    message: 'Credenciais inválidas'
                };
            }

            // Atualizar último login
            user.lastLogin = new Date().toISOString();
            await this.saveUsers();

            // Gerar token JWT
            const token = jwt.sign(
                {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    email: user.email
                },
                config.get('security.jwtSecret'),
                { expiresIn: '24h' }
            );

            logger.info(`Login realizado: ${username} (${user.role})`);

            return {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    fullName: user.fullName,
                    avatar: user.avatar,
                    preferences: user.preferences
                },
                token
            };
        } catch (error) {
            logger.error('Erro no login:', error);
            return {
                success: false,
                message: 'Erro no servidor'
            };
        }
    }

    async verifyToken(token) {
        try {
            const decoded = jwt.verify(token, config.get('security.jwtSecret'));
            const user = this.users.find(u => u.id === decoded.id && u.active);
            
            if (!user) {
                return { success: false, message: 'Usuário não encontrado' };
            }

            return {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    fullName: user.fullName
                }
            };
        } catch (error) {
            logger.error('Erro na verificação do token:', error);
            return { success: false, message: 'Token inválido' };
        }
    }

    async changePassword(username, currentPassword, newPassword) {
        try {
            const user = this.users.find(u => u.username === username && u.active);
            
            if (!user) {
                return {
                    success: false,
                    message: 'Usuário não encontrado'
                };
            }

            // Verificar senha atual
            const passwordMatch = await bcrypt.compare(currentPassword, user.password);
            if (!passwordMatch) {
                return {
                    success: false,
                    message: 'Senha atual incorreta'
                };
            }

            // Validar nova senha
            const passwordValidation = this.validatePassword(newPassword);
            if (!passwordValidation.valid) {
                return {
                    success: false,
                    message: passwordValidation.message
                };
            }

            // Atualizar senha
            user.password = await bcrypt.hash(
                newPassword,
                config.get('security.bcryptSaltRounds')
            );
            user.updatedAt = new Date().toISOString();

            await this.saveUsers();

            logger.info(`Senha alterada: ${username}`);

            return {
                success: true,
                message: 'Senha alterada com sucesso'
            };
        } catch (error) {
            logger.error('Erro ao alterar senha:', error);
            return {
                success: false,
                message: 'Erro ao alterar senha'
            };
        }
    }

    async resetPassword(username) {
        try {
            const user = this.users.find(u => u.username === username && u.active);
            
            if (!user) {
                return {
                    success: false,
                    message: 'Usuário não encontrado'
                };
            }

            // Gerar senha temporária
            const tempPassword = this.generateTempPassword();
            const hashedPassword = await bcrypt.hash(
                tempPassword,
                config.get('security.bcryptSaltRounds')
            );

            // Atualizar senha
            user.password = hashedPassword;
            user.updatedAt = new Date().toISOString();
            user.forcePasswordChange = true;

            await this.saveUsers();

            logger.info(`Senha resetada: ${username}`);

            return {
                success: true,
                message: 'Senha resetada com sucesso',
                temporaryPassword: tempPassword
            };
        } catch (error) {
            logger.error('Erro ao resetar senha:', error);
            return {
                success: false,
                message: 'Erro ao resetar senha'
            };
        }
    }

    generateTempPassword() {
        const length = 10;
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let password = '';
        
        for (let i = 0; i < length; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        return password;
    }

    async getAllUsers() {
        try {
            return this.users.map(user => ({
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                fullName: user.fullName,
                active: user.active,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
            }));
        } catch (error) {
            logger.error('Erro ao obter usuários:', error);
            throw error;
        }
    }

    async getUserById(id) {
        try {
            const user = this.users.find(u => u.id === id);
            if (!user) {
                return null;
            }

            return {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                fullName: user.fullName,
                active: user.active,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
                preferences: user.preferences
            };
        } catch (error) {
            logger.error('Erro ao obter usuário:', error);
            throw error;
        }
    }

    async updateUser(id, updates) {
        try {
            const userIndex = this.users.findIndex(u => u.id === id);
            if (userIndex === -1) {
                return {
                    success: false,
                    message: 'Usuário não encontrado'
                };
            }

            // Não permitir alterar alguns campos diretamente
            const allowedUpdates = ['fullName', 'email', 'role', 'active', 'preferences', 'avatar'];
            const user = this.users[userIndex];

            // Verificar permissões (apenas admin pode alterar role)
            if (updates.role && updates.role !== user.role) {
                // Esta verificação será feita no middleware
            }

            // Aplicar atualizações
            allowedUpdates.forEach(field => {
                if (updates[field] !== undefined) {
                    user[field] = updates[field];
                }
            });

            user.updatedAt = new Date().toISOString();
            await this.saveUsers();

            logger.info(`Usuário atualizado: ${user.username}`);

            return {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    fullName: user.fullName,
                    active: user.active
                }
            };
        } catch (error) {
            logger.error('Erro ao atualizar usuário:', error);
            return {
                success: false,
                message: 'Erro ao atualizar usuário'
            };
        }
    }

    async deleteUser(id, currentUserId) {
        try {
            const userIndex = this.users.findIndex(u => u.id === id);
            if (userIndex === -1) {
                return {
                    success: false,
                    message: 'Usuário não encontrado'
                };
            }

            const user = this.users[userIndex];

            // Não permitir deletar a si mesmo
            if (id === currentUserId) {
                return {
                    success: false,
                    message: 'Não é possível deletar seu próprio usuário'
                };
            }

            // Não permitir deletar o último admin
            if (user.role === 'admin') {
                const adminCount = this.users.filter(u => u.role === 'admin' && u.active).length;
                if (adminCount <= 1) {
                    return {
                        success: false,
                        message: 'Não é possível deletar o último administrador'
                    };
                }
            }

            // Marcar como inativo (soft delete)
            user.active = false;
            user.deletedAt = new Date().toISOString();
            await this.saveUsers();

            logger.info(`Usuário desativado: ${user.username}`);

            return {
                success: true,
                message: 'Usuário desativado com sucesso'
            };
        } catch (error) {
            logger.error('Erro ao deletar usuário:', error);
            return {
                success: false,
                message: 'Erro ao deletar usuário'
            };
        }
    }

    async searchUsers(query, limit = 20) {
        try {
            const searchTerm = query.toLowerCase();
            const results = this.users.filter(user => 
                user.active && (
                    user.username.toLowerCase().includes(searchTerm) ||
                    user.email.toLowerCase().includes(searchTerm) ||
                    user.fullName?.toLowerCase().includes(searchTerm)
                )
            ).slice(0, limit);

            return results.map(user => ({
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                fullName: user.fullName,
                lastLogin: user.lastLogin
            }));
        } catch (error) {
            logger.error('Erro ao buscar usuários:', error);
            throw error;
        }
    }

    async updatePreferences(userId, preferences) {
        try {
            const user = this.users.find(u => u.id === userId);
            if (!user) {
                return {
                    success: false,
                    message: 'Usuário não encontrado'
                };
            }

            user.preferences = {
                ...user.preferences,
                ...preferences
            };
            user.updatedAt = new Date().toISOString();

            await this.saveUsers();

            return {
                success: true,
                preferences: user.preferences
            };
        } catch (error) {
            logger.error('Erro ao atualizar preferências:', error);
            return {
                success: false,
                message: 'Erro ao atualizar preferências'
            };
        }
    }

    async getActiveSessions() {
        // Em uma implementação real, você teria um armazenamento de sessões
        // Por enquanto, retornaremos uma lista vazia
        return [];
    }

    async revokeSession(userId, sessionId) {
        // Em uma implementação real, você revogaria a sessão
        return { success: true, message: 'Sessão revogada' };
    }

    async revokeAllSessions(userId) {
        // Em uma implementação real, você revogaria todas as sessões
        return { success: true, message: 'Todas as sessões revogadas' };
    }

    // Alterar senha do próprio utilizador (valida senha atual)
    async changePassword(username, currentPassword, newPassword) {
        try {
            const user = this.users.find(u => u.username === username && u.active);
            if (!user) {
                return { success: false, message: 'Utilizador não encontrado' };
            }

            const isValid = await bcrypt.compare(currentPassword, user.password);
            if (!isValid) {
                return { success: false, message: 'Senha atual incorreta' };
            }

            const hashed = await bcrypt.hash(newPassword, config.get('security.bcryptSaltRounds'));
            user.password = hashed;
            user.updatedAt = new Date().toISOString();
            await this.saveUsers();

            logger.info(`Senha alterada para: ${username}`);
            return { success: true };
        } catch (error) {
            logger.error('Erro ao alterar senha:', error);
            return { success: false, message: 'Erro ao alterar senha' };
        }
    }

    // Repor senha de qualquer utilizador (apenas admin, sem validar senha atual)
    async changePasswordAdmin(userId, newPassword) {
        try {
            const user = this.users.find(u => u.id === userId);
            if (!user) {
                return { success: false, message: 'Utilizador não encontrado' };
            }

            const hashed = await bcrypt.hash(newPassword, config.get('security.bcryptSaltRounds'));
            user.password = hashed;
            user.updatedAt = new Date().toISOString();
            await this.saveUsers();

            logger.info(`Senha reposta para utilizador: ${userId}`);
            return { success: true };
        } catch (error) {
            logger.error('Erro ao repor senha:', error);
            return { success: false, message: 'Erro ao repor senha' };
        }
    }
}

module.exports = new AuthService();