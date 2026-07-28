const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { requireAuth, requireRole, accessLogger } = require('../middlewares/auth');
const gitService = require('../services/gitService');
const backupService = require('../services/backupService');
const { createLogger } = require('../utils/logger');
const config = require('../utils/config');

const logger = createLogger('admin-api');
const dataDir = config.get('paths.data');
// Em produção (.exe) APP_BASE_PATH aponta para a pasta do executável;
// em desenvolvimento aponta para a raiz do projeto
const _appBase = process.env.APP_BASE_PATH || path.join(__dirname, '../..');
const jsDir = path.join(_appBase, 'public', 'js');

// Aplicar middlewares
router.use(accessLogger);
router.use(requireAuth);
router.use(requireRole('editor'));

// Inicializar arquivos se não existirem
async function initializeFiles() {
    const files = [
        {
            name: 'home.json',
            default: {
                hero: {
                    title: "Bem-vindo ao Restaurante Nyumba",
                    subtitle: "Autêntica cozinha moçambicana em Lisboa",
                    buttonText: "Ver Menu"
                },
                about: {
                    title: "A Nossa História",
                    description: "O Nyumba nasceu da paixão pela culinária tradicional moçambicana..."
                },
                services: [
                    {
                        title: "Comida Tradicional",
                        description: "Pratos autênticos preparados com ingredientes frescos"
                    },
                    {
                        title: "Ambiente Acolhedor",
                        description: "Um espaço familiar e confortável para todas as ocasiões"
                    }
                ],
                footer: {
                    copyright: "© 2024 Restaurante Nyumba. Todos os direitos reservados.",
                    contact: "Contacte-nos: +351 123 456 789 | info@nyumba.com"
                }
            }
        },
        {
            name: 'gallery.json',
            default: { items: [] }
        },
        {
            name: 'menu.json',
            default: { categories: [] }
        }
    ];

    for (const file of files) {
        const filePath = path.join(dataDir, file.name);
        try {
            await fs.access(filePath);
        } catch {
            await fs.writeFile(filePath, JSON.stringify(file.default, null, 2));
            logger.info(`Arquivo criado: ${file.name}`);
        }
    }
}

// Inicializar
(async () => {
    await initializeFiles();
})();

// Helper para atualizar arquivos JS
async function updateJsFile(dataType, data) {
    let jsContent = '';
    
    switch (dataType) {
        case 'home':
            jsContent = `var homeData = ${JSON.stringify(data, null, 2)};`;
            break;
        case 'gallery':
            jsContent = `var galleryItems = ${JSON.stringify(data.items || [], null, 2)};`;
            break;
        case 'menu':
            jsContent = `var menuItems = ${JSON.stringify(data.categories || [], null, 2)};`;
            break;
    }
    
    const jsPath = path.join(jsDir, `${dataType}-data.js`);
    await fs.writeFile(jsPath, jsContent);
}

// ========== HOME ==========
router.get('/home', async (req, res) => {
    try {
        const homePath = path.join(dataDir, 'home.json');
        let data = '{}';
        try {
            data = await fs.readFile(homePath, 'utf8');
        } catch (e) {
            // Arquivo no existe na primeira execuo, retorna default
            data = JSON.stringify({ hero: { title: '', subtitle: '' }, about: { title: '', text: '' }, features: [], testimonials: [] });
        }
        res.json(JSON.parse(data));
    } catch (error) {
        logger.error('Erro ao ler home:', error);
        res.status(500).json({ error: 'Erro ao ler dados da página principal' });
    }
});

router.post('/home', async (req, res) => {
    try {
        const homeData = req.body;
        const homePath = path.join(dataDir, 'home.json');
        
        // Criar backup antes de salvar
        await backupService.createBackup('home');
        
        // Salvar dados
        await fs.writeFile(homePath, JSON.stringify(homeData, null, 2));
        await updateJsFile('home', homeData);
        
        // Commit no Git
        await gitService.commit('Atualização da página principal', req.session.user.username);
        
        logger.info(`Home atualizado por ${req.session.user.username}`);
        res.json({ 
            success: true, 
            message: 'Página principal salva com sucesso!' 
        });
    } catch (error) {
        logger.error('Erro ao salvar home:', error);
        res.status(500).json({ error: 'Erro ao salvar página principal' });
    }
});

// ========== GALERIA ==========
router.get('/gallery', async (req, res) => {
    try {
        const galleryPath = path.join(dataDir, 'gallery.json');
        let data = '{"items":[]}';
        try {
            data = await fs.readFile(galleryPath, 'utf8');
        } catch (e) {
            // Arquivo no existe na primeira execuo
        }
        res.json(JSON.parse(data));
    } catch (error) {
        logger.error('Erro ao ler galeria:', error);
        res.status(500).json({ error: 'Erro ao ler dados da galeria' });
    }
});

router.post('/gallery', async (req, res) => {
    try {
        const galleryData = req.body;
        const galleryPath = path.join(dataDir, 'gallery.json');
        
        await backupService.createBackup('gallery');
        await fs.writeFile(galleryPath, JSON.stringify(galleryData, null, 2));
        await updateJsFile('gallery', galleryData);
        
        await gitService.commit('Atualização da galeria', req.session.user.username);
        
        logger.info(`Galeria atualizada por ${req.session.user.username}`);
        res.json({ 
            success: true, 
            message: 'Galeria salva com sucesso!' 
        });
    } catch (error) {
        logger.error('Erro ao salvar galeria:', error);
        res.status(500).json({ error: 'Erro ao salvar galeria' });
    }
});

// ========== MENU ==========
router.get('/menu', async (req, res) => {
    try {
        const menuPath = path.join(dataDir, 'menu.json');
        let data = '{"categories":[]}';
        try {
            data = await fs.readFile(menuPath, 'utf8');
        } catch (e) {
            // Arquivo no existe na primeira execuo
        }
        res.json(JSON.parse(data));
    } catch (error) {
        logger.error('Erro ao ler menu:', error);
        res.status(500).json({ error: 'Erro ao ler dados do menu' });
    }
});

router.post('/menu', async (req, res) => {
    try {
        const menuData = req.body;
        const menuPath = path.join(dataDir, 'menu.json');
        
        await backupService.createBackup('menu');
        await fs.writeFile(menuPath, JSON.stringify(menuData, null, 2));
        await updateJsFile('menu', menuData);
        
        await gitService.commit('Atualização do menu', req.session.user.username);
        
        logger.info(`Menu atualizado por ${req.session.user.username}`);
        res.json({ 
            success: true, 
            message: 'Menu salvo com sucesso!' 
        });
    } catch (error) {
        logger.error('Erro ao salvar menu:', error);
        res.status(500).json({ error: 'Erro ao salvar menu' });
    }
});

// ========== HISTÓRICO ==========
router.get('/history', async (req, res) => {
    try {
        const { limit = 20, page = 1 } = req.query;
        let history = { commits: [], total: 0 };
        
        try {
            history = await gitService.getHistory(parseInt(limit), parseInt(page));
        } catch (gitError) {
            logger.warn('Não foi possível obter histórico Git (pode não haver commits ainda): ' + gitError.message);
        }
        
        res.json({ 
            success: true, 
            history: history.commits,
            total: history.total,
            page: parseInt(page),
            pages: Math.ceil((history.total || 0) / parseInt(limit)) || 1
        });
    } catch (error) {
        logger.error('Erro geral ao obter histórico:', error);
        res.status(500).json({ error: 'Erro ao obter histórico' });
    }
});

router.get('/history/:hash', async (req, res) => {
    try {
        const { hash } = req.params;
        const commitDetails = await gitService.getCommitDetails(hash);
        
        res.json({ 
            success: true, 
            commit: commitDetails 
        });
    } catch (error) {
        logger.error('Erro ao obter detalhes do commit:', error);
        res.status(500).json({ error: 'Erro ao obter detalhes do commit' });
    }
});

router.post('/history/revert/:hash', async (req, res) => {
    try {
        const { hash } = req.params;
        const result = await gitService.revertToCommit(hash, req.session.user.username);
        
        // Recarregar dados dos arquivos revertidos
        const files = ['home.json', 'gallery.json', 'menu.json'];
        for (const file of files) {
            const filePath = path.join(dataDir, file);
            const dataType = file.replace('.json', '');
            const data = await fs.readFile(filePath, 'utf8');
            await updateJsFile(dataType, JSON.parse(data));
        }
        
        logger.info(`Revertido para commit ${hash.substring(0, 7)} por ${req.session.user.username}`);
        res.json({ 
            success: true, 
            message: 'Revertido com sucesso!',
            commit: result 
        });
    } catch (error) {
        logger.error('Erro ao reverter:', error);
        res.status(500).json({ error: 'Erro ao reverter commit' });
    }
});

// ========== BACKUP ==========
router.get('/backups', async (req, res) => {
    try {
        const backups = await backupService.listBackups();
        res.json({ 
            success: true, 
            backups 
        });
    } catch (error) {
        logger.error('Erro ao listar backups:', error);
        res.status(500).json({ error: 'Erro ao listar backups' });
    }
});

router.post('/backups/create', async (req, res) => {
    try {
        const { description = 'Backup manual' } = req.body;
        const backup = await backupService.createBackup('manual', description);
        
        logger.info(`Backup criado manualmente por ${req.session.user.username}: ${backup.filename}`);
        res.json({ 
            success: true, 
            message: 'Backup criado com sucesso!',
            backup 
        });
    } catch (error) {
        logger.error('Erro ao criar backup:', error);
        res.status(500).json({ error: 'Erro ao criar backup' });
    }
});

router.post('/backups/restore/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        await backupService.restoreBackup(filename);
        
        // Recarregar dados dos arquivos
        const files = ['home.json', 'gallery.json', 'menu.json'];
        for (const file of files) {
            const filePath = path.join(dataDir, file);
            const dataType = file.replace('.json', '');
            const data = await fs.readFile(filePath, 'utf8');
            await updateJsFile(dataType, JSON.parse(data));
        }
        
        logger.info(`Backup restaurado: ${filename} por ${req.session.user.username}`);
        res.json({ 
            success: true, 
            message: 'Backup restaurado com sucesso!' 
        });
    } catch (error) {
        logger.error('Erro ao restaurar backup:', error);
        res.status(500).json({ error: 'Erro ao restaurar backup' });
    }
});

router.delete('/backups/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        await backupService.deleteBackup(filename);
        
        logger.info(`Backup removido: ${filename} por ${req.session.user.username}`);
        res.json({ 
            success: true, 
            message: 'Backup removido com sucesso!' 
        });
    } catch (error) {
        logger.error('Erro ao remover backup:', error);
        res.status(500).json({ error: 'Erro ao remover backup' });
    }
});

// ========== PREVIEW ==========
router.post('/preview', async (req, res) => {
    try {
        const { type, data } = req.body;
        const tempPath = path.join(config.get('paths.temp'), 'preview.json');
        
        // Salvar dados temporários para preview
        await fs.writeFile(tempPath, JSON.stringify({ type, data, timestamp: Date.now() }, null, 2));
        
        res.json({ 
            success: true, 
            previewUrl: `/preview/${type}` 
        });
    } catch (error) {
        logger.error('Erro ao criar preview:', error);
        res.status(500).json({ error: 'Erro ao criar preview' });
    }
});

// ========== STATUS ==========
router.get('/status', async (req, res) => {
    try {
        const status = {
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                nodeVersion: process.version
            },
            git: await gitService.getStatus(),
            backups: await backupService.getStats(),
            lastBackup: await backupService.getLastBackup(),
            diskUsage: await getDiskUsage()
        };
        
        res.json({ success: true, status });
    } catch (error) {
        logger.error('Erro ao obter status:', error);
        res.status(500).json({ error: 'Erro ao obter status' });
    }
});

// Helper para uso do disco
async function getDiskUsage() {
    const fs = require('fs');
    const path = require('path');
    
    function getSize(dir) {
        let size = 0;
        
        function scan(currentPath) {
            const stats = fs.statSync(currentPath);
            if (stats.isFile()) {
                size += stats.size;
            } else if (stats.isDirectory()) {
                const items = fs.readdirSync(currentPath);
                items.forEach(item => {
                    scan(path.join(currentPath, item));
                });
            }
        }
        
        scan(dir);
        return size;
    }
    
    return {
        data: getSize(dataDir),
        backups: getSize(path.join(dataDir, 'backups')),
        temp: getSize(config.get('paths.temp'))
    };
}

module.exports = router;