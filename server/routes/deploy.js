const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { exec } = require('child_process');
const util = require('util');
const { createLogger } = require('../utils/logger');
const { requireAuth, requireRole } = require('../middlewares/auth');
const config = require('../utils/config');

const execPromise = util.promisify(exec);
const logger = createLogger('deploy-routes');

// Middleware para verificar webhook do GitHub
function verifyGitHubWebhook(req, res, next) {
    if (!config.get('deploy.enabled')) {
        return res.status(503).json({ 
            success: false, 
            message: 'Deploy desativado' 
        });
    }
    
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
        return res.status(401).json({ 
            success: false, 
            message: 'Assinatura não fornecida' 
        });
    }
    
    const hmac = crypto.createHmac('sha256', config.get('deploy.hookSecret'));
    const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');
    
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
        return res.status(401).json({ 
            success: false, 
            message: 'Assinatura inválida' 
        });
    }
    
    next();
}

// Webhook do GitHub para CI/CD
router.post('/webhook', verifyGitHubWebhook, async (req, res) => {
    try {
        const { ref, repository, pusher } = req.body;
        
        // Verificar se é a branch correta
        const deployBranch = config.get('deploy.branch');
        if (ref !== `refs/heads/${deployBranch}`) {
            return res.json({ 
                success: true, 
                message: 'Branch ignorada - não é a branch de deploy' 
            });
        }
        
        logger.info(`Deploy iniciado por ${pusher.name} (${pusher.email})`);
        
        // Registrar início do deploy
        await logDeploy({
            type: 'auto',
            user: pusher.name,
            email: pusher.email,
            repository: repository.full_name,
            branch: ref,
            commit: req.body.head_commit?.id,
            status: 'started'
        });
        
        // Executar deploy
        const results = [];
        const commands = [
            `cd ${config.get('deploy.targetPath')}`,
            'git pull origin ' + deployBranch,
            'npm install --production',
            'npm run build',
            'pm2 restart nyumba-admin || true'
        ];
        
        for (const cmd of commands) {
            try {
                const { stdout, stderr } = await execPromise(cmd);
                results.push({ 
                    command: cmd, 
                    success: true, 
                    stdout: stdout.substring(0, 500), // Limitar tamanho
                    stderr: stderr.substring(0, 500)
                });
            } catch (error) {
                results.push({ 
                    command: cmd, 
                    success: false, 
                    error: error.message 
                });
                break;
            }
        }
        
        const success = results.every(r => r.success);
        const status = success ? 'completed' : 'failed';
        
        // Registrar conclusão do deploy
        await logDeploy({
            type: 'auto',
            user: pusher.name,
            email: pusher.email,
            repository: repository.full_name,
            branch: ref,
            commit: req.body.head_commit?.id,
            status,
            results
        });
        
        if (success) {
            logger.info('Deploy automático concluído com sucesso');
            res.json({ 
                success: true, 
                message: 'Deploy realizado com sucesso',
                results 
            });
        } else {
            logger.error('Deploy automático falhou');
            res.status(500).json({ 
                success: false, 
                message: 'Deploy falhou',
                results 
            });
        }
    } catch (error) {
        logger.error('Erro no deploy automático:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro no deploy automático' 
        });
    }
});

// Deploy manual
router.post('/manual', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { action = 'deploy' } = req.body;
        
        logger.info(`Deploy manual iniciado por ${req.session.user.username}`);
        
        // Registrar início
        await logDeploy({
            type: 'manual',
            user: req.session.user.username,
            action,
            status: 'started'
        });
        
        let commands = [];
        const targetPath = config.get('deploy.targetPath') || process.cwd();
        
        switch (action) {
            case 'pull':
                commands = [
                    `cd ${targetPath}`,
                    `git pull origin ${config.get('deploy.branch')}`
                ];
                break;
            case 'install':
                commands = [
                    `cd ${targetPath}`,
                    'npm install --production'
                ];
                break;
            case 'build':
                commands = [
                    `cd ${targetPath}`,
                    'npm run build'
                ];
                break;
            case 'restart':
                commands = [
                    `cd ${targetPath}`,
                    'pm2 restart nyumba-admin || true'
                ];
                break;
            case 'deploy':
            default:
                commands = [
                    `cd ${targetPath}`,
                    `git pull origin ${config.get('deploy.branch')}`,
                    'npm install --production',
                    'npm run build',
                    'pm2 restart nyumba-admin || true'
                ];
        }
        
        const results = [];
        for (const cmd of commands) {
            try {
                const { stdout, stderr } = await execPromise(cmd);
                results.push({ 
                    command: cmd, 
                    success: true, 
                    stdout: stdout.substring(0, 500),
                    stderr: stderr.substring(0, 500)
                });
            } catch (error) {
                results.push({ 
                    command: cmd, 
                    success: false, 
                    error: error.message 
                });
                break;
            }
        }
        
        const success = results.every(r => r.success);
        const status = success ? 'completed' : 'failed';
        
        // Registrar conclusão
        await logDeploy({
            type: 'manual',
            user: req.session.user.username,
            action,
            status,
            results
        });
        
        logger.info(`Deploy manual concluído: ${action}`);
        
        res.json({ 
            success: true, 
            message: `Deploy manual (${action}) realizado`,
            status,
            results 
        });
    } catch (error) {
        logger.error('Erro no deploy manual:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro no deploy manual' 
        });
    }
});

// Status do deploy
router.get('/status', requireAuth, async (req, res) => {
    try {
        const targetPath = config.get('deploy.targetPath') || process.cwd();
        
        // Obter informações do Git
        let gitStatus = {};
        try {
            const { stdout: branchStdout } = await execPromise(`cd ${targetPath} && git branch --show-current`);
            const { stdout: commitStdout } = await execPromise(`cd ${targetPath} && git log --oneline -1`);
            const { stdout: statusStdout } = await execPromise(`cd ${targetPath} && git status --short`);
            
            gitStatus = {
                branch: branchStdout.trim(),
                lastCommit: commitStdout.trim(),
                changes: statusStdout.trim().split('\n').filter(line => line)
            };
        } catch (error) {
            gitStatus = { error: error.message };
        }
        
        // Obter status do PM2
        let pm2Status = {};
        try {
            const { stdout } = await execPromise('pm2 status nyumba-admin --no-color');
            const lines = stdout.split('\n');
            const appLine = lines.find(line => line.includes('nyumba-admin'));
            
            if (appLine) {
                const parts = appLine.split(/\s+/).filter(p => p);
                pm2Status = {
                    name: parts[1],
                    status: parts[8],
                    cpu: parts[9],
                    memory: parts[10]
                };
            }
        } catch (error) {
            pm2Status = { error: error.message };
        }
        
        // Obter últimos deploys
        const deployLogs = await getDeployLogs(10);
        
        // Verificar se há atualizações disponíveis
        let updatesAvailable = false;
        try {
            const { stdout } = await execPromise(`cd ${targetPath} && git fetch origin && git status -uno`);
            updatesAvailable = stdout.includes('Your branch is behind');
        } catch (error) {
            // Ignorar erro
        }
        
        res.json({
            success: true,
            status: {
                enabled: config.get('deploy.enabled'),
                branch: config.get('deploy.branch'),
                targetPath: config.get('deploy.targetPath'),
                git: gitStatus,
                pm2: pm2Status,
                updatesAvailable,
                lastDeploy: deployLogs[0] || null,
                stats: {
                    totalDeploys: deployLogs.length,
                    successful: deployLogs.filter(d => d.status === 'completed').length,
                    failed: deployLogs.filter(d => d.status === 'failed').length
                }
            }
        });
    } catch (error) {
        logger.error('Erro ao obter status do deploy:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao obter status' 
        });
    }
});

// Configuração do deploy
router.get('/config', requireAuth, requireRole('admin'), (req, res) => {
    try {
        res.json({
            success: true,
            config: {
                enabled: config.get('deploy.enabled'),
                branch: config.get('deploy.branch'),
                hookSecret: config.get('deploy.hookSecret') ? '***' : '',
                targetPath: config.get('deploy.targetPath'),
                webhookUrl: config.get('server.domain') ? 
                    `https://${config.get('server.domain')}/api/deploy/webhook` : 
                    `http://localhost:${config.get('server.port')}/api/deploy/webhook`
            }
        });
    } catch (error) {
        logger.error('Erro ao obter configuração:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao obter configuração' 
        });
    }
});

router.put('/config', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { 
            enabled, 
            branch, 
            hookSecret,
            targetPath
        } = req.body;
        
        // Validar entrada
        if (enabled !== undefined && typeof enabled !== 'boolean') {
            return res.status(400).json({ 
                success: false, 
                message: 'Campo enabled deve ser booleano' 
            });
        }
        
        if (branch && typeof branch !== 'string') {
            return res.status(400).json({ 
                success: false, 
                message: 'Campo branch deve ser string' 
            });
        }
        
        if (targetPath && typeof targetPath !== 'string') {
            return res.status(400).json({ 
                success: false, 
                message: 'Campo targetPath deve ser string' 
            });
        }
        
        // Atualizar configuração
        if (enabled !== undefined) config.set('deploy.enabled', enabled);
        if (branch) config.set('deploy.branch', branch);
        if (hookSecret) config.set('deploy.hookSecret', hookSecret);
        if (targetPath) config.set('deploy.targetPath', targetPath);
        
        // Salvar configuração
        await config.saveToFile();
        
        logger.info(`Configuração de deploy atualizada por ${req.session.user.username}`);
        
        res.json({
            success: true,
            message: 'Configuração atualizada',
            config: {
                enabled: config.get('deploy.enabled'),
                branch: config.get('deploy.branch'),
                hookSecret: config.get('deploy.hookSecret') ? '***' : '',
                targetPath: config.get('deploy.targetPath')
            }
        });
    } catch (error) {
        logger.error('Erro ao atualizar configuração:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao atualizar configuração' 
        });
    }
});

// Rollback do deploy
router.post('/rollback/:commit', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { commit } = req.params;
        const targetPath = config.get('deploy.targetPath') || process.cwd();
        
        logger.info(`Rollback iniciado para commit ${commit} por ${req.session.user.username}`);
        
        // Registrar início
        await logDeploy({
            type: 'rollback',
            user: req.session.user.username,
            commit,
            status: 'started'
        });
        
        const commands = [
            `cd ${targetPath}`,
            `git checkout ${commit}`,
            'npm install --production',
            'npm run build',
            'pm2 restart nyumba-admin'
        ];
        
        const results = [];
        for (const cmd of commands) {
            try {
                const { stdout, stderr } = await execPromise(cmd);
                results.push({ 
                    command: cmd, 
                    success: true, 
                    stdout: stdout.substring(0, 500),
                    stderr: stderr.substring(0, 500)
                });
            } catch (error) {
                results.push({ 
                    command: cmd, 
                    success: false, 
                    error: error.message 
                });
                break;
            }
        }
        
        const success = results.every(r => r.success);
        const status = success ? 'completed' : 'failed';
        
        // Registrar conclusão
        await logDeploy({
            type: 'rollback',
            user: req.session.user.username,
            commit,
            status,
            results
        });
        
        if (success) {
            logger.info(`Rollback concluído para commit ${commit}`);
            res.json({ 
                success: true, 
                message: `Rollback realizado para commit ${commit.substring(0, 7)}`,
                results 
            });
        } else {
            logger.error(`Rollback falhou para commit ${commit}`);
            res.status(500).json({ 
                success: false, 
                message: 'Rollback falhou',
                results 
            });
        }
    } catch (error) {
        logger.error('Erro no rollback:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro no rollback' 
        });
    }
});

// Histórico de deploys
router.get('/history', requireAuth, async (req, res) => {
    try {
        const { limit = 50, page = 1 } = req.query;
        const logs = await getDeployLogs(parseInt(limit), parseInt(page));
        
        res.json({
            success: true,
            history: logs,
            count: logs.length,
            page: parseInt(page),
            total: await getDeployLogCount()
        });
    } catch (error) {
        logger.error('Erro ao obter histórico:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao obter histórico' 
        });
    }
});

// Helper: Registrar deploy no log
async function logDeploy(data) {
    try {
        const logEntry = {
            timestamp: new Date().toISOString(),
            ...data
        };
        
        const fs = require('fs').promises;
        await fs.appendFile(
            path.join(config.get('paths.logs'), 'deploy.log'),
            JSON.stringify(logEntry) + '\n'
        );
    } catch (error) {
        logger.error('Erro ao registrar deploy no log:', error);
    }
}

// Helper: Obter logs de deploy
async function getDeployLogs(limit = 50, page = 1) {
    try {
        const logFile = path.join(config.get('paths.logs'), 'deploy.log');
        const fs = require('fs').promises;
        
        try {
            const data = await fs.readFile(logFile, 'utf8');
            const lines = data.trim().split('\n');
            const start = (page - 1) * limit;
            const end = start + limit;
            const paginatedLines = lines.slice(-end).slice(-limit);
            return paginatedLines.map(line => JSON.parse(line)).reverse();
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    } catch (error) {
        logger.error('Erro ao obter logs de deploy:', error);
        return [];
    }
}

// Helper: Obter contagem total de logs
async function getDeployLogCount() {
    try {
        const logFile = path.join(config.get('paths.logs'), 'deploy.log');
        const fs = require('fs').promises;
        
        try {
            const data = await fs.readFile(logFile, 'utf8');
            return data.trim().split('\n').length;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return 0;
            }
            throw error;
        }
    } catch (error) {
        logger.error('Erro ao contar logs de deploy:', error);
        return 0;
    }
}

const path = require('path');

module.exports = router;