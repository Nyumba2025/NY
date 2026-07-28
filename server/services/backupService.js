const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const cron = require('node-cron');
const { createLogger } = require('../utils/logger');
const config = require('../utils/config');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);
const logger = createLogger('backup-service');

class BackupService {
    constructor() {
        this.backupPath = config.get('backup.path');
        this.retentionDays = config.get('backup.retentionDays');
        this.autoBackupSchedule = config.get('backup.schedule');
        this.isEnabled = config.get('backup.enabled');
        
        // Criar diretório de backups se não existir
        this.ensureBackupDirectory();
    }

    async ensureBackupDirectory() {
        try {
            await fs.mkdir(this.backupPath, { recursive: true });
            logger.info(`Diretório de backups verificado: ${this.backupPath}`);
        } catch (error) {
            logger.error('Erro ao criar diretório de backups:', error);
        }
    }

    async createBackup(type = 'auto', description = '') {
        try {
            if (!this.isEnabled && type !== 'manual') {
                logger.info('Backup automático desativado, ignorando...');
                return { success: false, message: 'Backup automático desativado' };
            }

            const timestamp = new Date().toISOString()
                .replace(/[:.]/g, '-')
                .replace('T', '_')
                .substring(0, 19);
            
            const filename = `backup_${type}_${timestamp}.zip`;
            const backupFile = path.join(this.backupPath, filename);
            
            // Criar arquivo ZIP
            const output = require('fs').createWriteStream(backupFile);
            const archive = archiver('zip', {
                zlib: { level: 9 } // Máxima compressão
            });
            
            return new Promise(async (resolve, reject) => {
                output.on('close', async () => {
                    logger.info(`Backup criado: ${filename} (${archive.pointer()} bytes)`);
                    
                    // Limpar backups antigos
                    await this.cleanOldBackups();
                    
                    // Registrar backup no log
                    await this.logBackup({
                        filename,
                        type,
                        description,
                        size: archive.pointer(),
                        timestamp: new Date().toISOString()
                    });
                    
                    resolve({
                        success: true,
                        filename,
                        path: backupFile,
                        size: archive.pointer(),
                        timestamp: new Date().toISOString()
                    });
                });
                
                archive.on('error', (err) => {
                    logger.error('Erro ao criar backup:', err);
                    reject(err);
                });
                
                archive.pipe(output);
                
                // Adicionar arquivos de dados
                const dataPath = config.get('paths.data');
                archive.directory(dataPath, 'data');
                
                // Adicionar arquivos JS gerados
                const jsPath = path.join(config.get('paths.public'), 'js');
                try {
                    await fs.access(jsPath);
                    archive.directory(jsPath, 'js');
                } catch (error) {
                    logger.warn('Diretório js não encontrado, ignorando...');
                }
                
                // Adicionar configurações
                const configFiles = [
                    '.env',
                    'package.json',
                    'package-lock.json'
                ];
                
                for (const file of configFiles) {
                    try {
                        await fs.access(file);
                        archive.file(file, { name: `config/${file}` });
                    } catch (error) {
                        // Arquivo pode não existir
                    }
                }
                
                // Adicionar metadados
                const metadata = {
                    type,
                    description,
                    timestamp: new Date().toISOString(),
                    version: require('../../package.json').version || '2.0.0',
                    system: {
                        node: process.version,
                        platform: process.platform,
                        arch: process.arch
                    },
                    files: [
                        'data/home.json',
                        'data/gallery.json', 
                        'data/menu.json',
                        'data/users.json',
                        'js/home-data.js',
                        'js/gallery-data.js',
                        'js/menu-data.js'
                    ]
                };
                
                archive.append(JSON.stringify(metadata, null, 2), { name: 'backup-info.json' });
                
                archive.finalize();
            });
        } catch (error) {
            logger.error('Erro ao criar backup:', error);
            throw error;
        }
    }

    async restoreBackup(filename) {
        try {
            const backupFile = path.join(this.backupPath, filename);
            
            // Verificar se o arquivo existe
            await fs.access(backupFile);
            
            // Criar backup atual antes de restaurar
            await this.createBackup('pre-restore', `Backup antes de restaurar ${filename}`);
            
            // Extrair arquivo ZIP
            const extractPath = path.join(config.get('paths.temp'), 'restore');
            await fs.mkdir(extractPath, { recursive: true });
            
            // Usar unzip nativo ou implementação alternativa
            try {
                await execPromise(`unzip -o "${backupFile}" -d "${extractPath}"`);
            } catch (error) {
                // Fallback para biblioteca zip-lib se unzip não estiver disponível
                const { extract } = require('zip-lib');
                await extract(backupFile, extractPath);
            }
            
            // Verificar metadados do backup
            const metadataPath = path.join(extractPath, 'backup-info.json');
            let metadata;
            try {
                const metadataContent = await fs.readFile(metadataPath, 'utf8');
                metadata = JSON.parse(metadataContent);
                logger.info(`Restaurando backup do tipo: ${metadata.type}`);
            } catch (error) {
                logger.warn('Metadados do backup não encontrados, continuando...');
            }
            
            // Restaurar arquivos
            const filesToRestore = [
                { source: 'data/home.json', dest: 'data/home.json' },
                { source: 'data/gallery.json', dest: 'data/gallery.json' },
                { source: 'data/menu.json', dest: 'data/menu.json' },
                { source: 'data/users.json', dest: 'data/users.json' },
                { source: 'js/home-data.js', dest: 'public/js/home-data.js' },
                { source: 'js/gallery-data.js', dest: 'public/js/gallery-data.js' },
                { source: 'js/menu-data.js', dest: 'public/js/menu-data.js' }
            ];
            
            for (const { source, dest } of filesToRestore) {
                const sourcePath = path.join(extractPath, source);
                const destPath = path.join(process.cwd(), dest);
                
                try {
                    await fs.access(sourcePath);
                    await fs.copyFile(sourcePath, destPath);
                    logger.info(`Arquivo restaurado: ${dest}`);
                } catch (err) {
                    if (err.code !== 'ENOENT') {
                        logger.warn(`Erro ao restaurar ${dest}:`, err.message);
                    }
                }
            }
            
            // Restaurar configurações se existirem
            const configDir = path.join(extractPath, 'config');
            try {
                await fs.access(configDir);
                const configFiles = await fs.readdir(configDir);
                
                for (const file of configFiles) {
                    const source = path.join(configDir, file);
                    const dest = path.join(process.cwd(), file);
                    await fs.copyFile(source, dest);
                    logger.info(`Configuração restaurada: ${file}`);
                }
            } catch (error) {
                // Diretório de configurações pode não existir
            }
            
            // Limpar diretório temporário
            await fs.rm(extractPath, { recursive: true, force: true });
            
            logger.info(`Backup restaurado: ${filename}`);
            
            // Registrar restauração
            await this.logRestoration(filename, metadata);
            
            return { 
                success: true, 
                message: 'Backup restaurado com sucesso',
                metadata 
            };
        } catch (error) {
            logger.error('Erro ao restaurar backup:', error);
            throw error;
        }
    }

    async listBackups() {
        try {
            const files = await fs.readdir(this.backupPath);
            const backups = [];
            
            for (const file of files) {
                if (file.endsWith('.zip')) {
                    const filePath = path.join(this.backupPath, file);
                    const stats = await fs.stat(filePath);
                    
                    // Tentar extrair metadados do arquivo
                    let metadata = {};
                    try {
                        // Usar unzip para extrair apenas o arquivo de metadados
                        const tempDir = path.join(config.get('paths.temp'), 'metadata');
                        await fs.mkdir(tempDir, { recursive: true });
                        
                        await execPromise(`unzip -p "${filePath}" backup-info.json > "${path.join(tempDir, 'metadata.json')}"`);
                        
                        const metadataContent = await fs.readFile(path.join(tempDir, 'metadata.json'), 'utf8');
                        metadata = JSON.parse(metadataContent);
                        
                        await fs.rm(tempDir, { recursive: true, force: true });
                    } catch (error) {
                        // Metadados não encontrados ou inválidos
                    }
                    
                    backups.push({
                        filename: file,
                        path: filePath,
                        size: stats.size,
                        created: stats.birthtime,
                        modified: stats.mtime,
                        type: metadata.type || 'unknown',
                        description: metadata.description || '',
                        version: metadata.version || 'unknown'
                    });
                }
            }
            
            // Ordenar por data de criação (mais recente primeiro)
            return backups.sort((a, b) => b.created - a.created);
        } catch (error) {
            logger.error('Erro ao listar backups:', error);
            return [];
        }
    }

    async deleteBackup(filename) {
        try {
            const filePath = path.join(this.backupPath, filename);
            await fs.unlink(filePath);
            logger.info(`Backup removido: ${filename}`);
            
            // Registrar deleção
            await this.logDeletion(filename);
            
            return { success: true };
        } catch (error) {
            logger.error('Erro ao remover backup:', error);
            throw error;
        }
    }

    async cleanOldBackups() {
        try {
            const backups = await this.listBackups();
            const now = new Date();
            const cutoffDate = new Date(now.setDate(now.getDate() - this.retentionDays));
            
            let deletedCount = 0;
            
            for (const backup of backups) {
                if (backup.created < cutoffDate) {
                    await this.deleteBackup(backup.filename);
                    deletedCount++;
                }
            }
            
            if (deletedCount > 0) {
                logger.info(`${deletedCount} backups antigos removidos`);
            }
            
            return { deletedCount };
        } catch (error) {
            logger.error('Erro ao limpar backups antigos:', error);
            return { deletedCount: 0, error: error.message };
        }
    }

    async getStats() {
        try {
            const backups = await this.listBackups();
            const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
            
            const stats = {
                count: backups.length,
                totalSize,
                averageSize: backups.length > 0 ? totalSize / backups.length : 0,
                oldest: backups.length > 0 ? backups[backups.length - 1].created : null,
                newest: backups.length > 0 ? backups[0].created : null,
                enabled: this.isEnabled,
                schedule: this.autoBackupSchedule,
                retentionDays: this.retentionDays,
                byType: {}
            };
            
            // Estatísticas por tipo
            backups.forEach(backup => {
                const type = backup.type;
                if (!stats.byType[type]) {
                    stats.byType[type] = {
                        count: 0,
                        totalSize: 0
                    };
                }
                stats.byType[type].count++;
                stats.byType[type].totalSize += backup.size;
            });
            
            return stats;
        } catch (error) {
            logger.error('Erro ao obter estatísticas:', error);
            return { error: error.message };
        }
    }

    async getLastBackup() {
        try {
            const backups = await this.listBackups();
            return backups.length > 0 ? backups[0] : null;
        } catch (error) {
            logger.error('Erro ao obter último backup:', error);
            return null;
        }
    }

    startAutoBackup() {
        if (!this.isEnabled) {
            logger.info('Backup automático desativado');
            return;
        }
        
        cron.schedule(this.autoBackupSchedule, async () => {
            try {
                logger.info('Iniciando backup automático...');
                const result = await this.createBackup('auto', 'Backup automático agendado');
                logger.info('Backup automático concluído:', result);
            } catch (error) {
                logger.error('Erro no backup automático:', error);
            }
        });
        
        logger.info(`Backup automático agendado: ${this.autoBackupSchedule}`);
    }

    async exportToJson() {
        try {
            const timestamp = new Date().toISOString()
                .replace(/[:.]/g, '-')
                .replace('T', '_')
                .substring(0, 19);
            
            const exportFile = path.join(this.backupPath, `export_${timestamp}.json`);
            
            // Ler todos os dados
            const dataDir = config.get('paths.data');
            const files = ['home.json', 'gallery.json', 'menu.json', 'users.json'];
            const exportData = {
                metadata: {
                    exportDate: new Date().toISOString(),
                    version: require('../../package.json').version || '2.0.0',
                    type: 'full-export'
                },
                data: {}
            };
            
            for (const file of files) {
                const filePath = path.join(dataDir, file);
                try {
                    const content = await fs.readFile(filePath, 'utf8');
                    exportData.data[file.replace('.json', '')] = JSON.parse(content);
                } catch (error) {
                    logger.warn(`Arquivo ${file} não encontrado, ignorando...`);
                }
            }
            
            await fs.writeFile(exportFile, JSON.stringify(exportData, null, 2));
            
            logger.info(`Exportação JSON criada: ${exportFile}`);
            return { success: true, file: exportFile };
        } catch (error) {
            logger.error('Erro ao exportar para JSON:', error);
            throw error;
        }
    }

    async importFromJson(filename) {
        try {
            const importFile = path.join(this.backupPath, filename);
            const data = await fs.readFile(importFile, 'utf8');
            const importData = JSON.parse(data);
            
            // Validar estrutura
            if (!importData.data || !importData.metadata) {
                throw new Error('Arquivo de importação inválido');
            }
            
            // Criar backup antes de importar
            await this.createBackup('pre-import', `Backup antes de importar ${filename}`);
            
            // Salvar dados
            const dataDir = config.get('paths.data');
            const files = ['home.json', 'gallery.json', 'menu.json', 'users.json'];
            
            for (const file of files) {
                const key = file.replace('.json', '');
                if (importData.data[key]) {
                    const filePath = path.join(dataDir, file);
                    await fs.writeFile(filePath, JSON.stringify(importData.data[key], null, 2));
                    logger.info(`Arquivo importado: ${file}`);
                }
            }
            
            // Atualizar arquivos JS
            const updateJsFiles = require('../../server/routes/admin').updateJsFile;
            for (const file of ['home', 'gallery', 'menu']) {
                if (importData.data[file]) {
                    await updateJsFiles(file, importData.data[file]);
                }
            }
            
            logger.info(`Importação JSON realizada: ${filename}`);
            return { success: true, message: 'Importação realizada com sucesso' };
        } catch (error) {
            logger.error('Erro ao importar de JSON:', error);
            throw error;
        }
    }

    async logBackup(backupInfo) {
        try {
            const logEntry = {
                type: 'backup',
                action: 'created',
                timestamp: new Date().toISOString(),
                ...backupInfo
            };
            
            await fs.appendFile(
                path.join(config.get('paths.logs'), 'backup.log'),
                JSON.stringify(logEntry) + '\n'
            );
        } catch (error) {
            logger.error('Erro ao registrar backup no log:', error);
        }
    }

    async logRestoration(filename, metadata) {
        try {
            const logEntry = {
                type: 'backup',
                action: 'restored',
                timestamp: new Date().toISOString(),
                filename,
                metadata
            };
            
            await fs.appendFile(
                path.join(config.get('paths.logs'), 'backup.log'),
                JSON.stringify(logEntry) + '\n'
            );
        } catch (error) {
            logger.error('Erro ao registrar restauração no log:', error);
        }
    }

    async logDeletion(filename) {
        try {
            const logEntry = {
                type: 'backup',
                action: 'deleted',
                timestamp: new Date().toISOString(),
                filename
            };
            
            await fs.appendFile(
                path.join(config.get('paths.logs'), 'backup.log'),
                JSON.stringify(logEntry) + '\n'
            );
        } catch (error) {
            logger.error('Erro ao registrar deleção no log:', error);
        }
    }

    async getBackupLogs(limit = 100) {
        try {
            const logFile = path.join(config.get('paths.logs'), 'backup.log');
            try {
                const data = await fs.readFile(logFile, 'utf8');
                const lines = data.trim().split('\n');
                const logs = lines.map(line => JSON.parse(line)).slice(-limit).reverse();
                return logs;
            } catch (error) {
                if (error.code === 'ENOENT') {
                    return [];
                }
                throw error;
            }
        } catch (error) {
            logger.error('Erro ao obter logs de backup:', error);
            return [];
        }
    }

    async verifyBackup(filename) {
        try {
            const backupFile = path.join(this.backupPath, filename);
            
            // Verificar se o arquivo existe
            await fs.access(backupFile);
            
            // Verificar integridade do ZIP
            const { exec } = require('child_process');
            await new Promise((resolve, reject) => {
                exec(`unzip -t "${backupFile}"`, (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error('Arquivo ZIP corrompido'));
                    } else {
                        resolve();
                    }
                });
            });
            
            // Extrair metadados
            const tempDir = path.join(config.get('paths.temp'), 'verify');
            await fs.mkdir(tempDir, { recursive: true });
            
            await execPromise(`unzip -p "${backupFile}" backup-info.json > "${path.join(tempDir, 'metadata.json')}"`);
            
            const metadataContent = await fs.readFile(path.join(tempDir, 'metadata.json'), 'utf8');
            const metadata = JSON.parse(metadataContent);
            
            // Limpar diretório temporário
            await fs.rm(tempDir, { recursive: true, force: true });
            
            return {
                success: true,
                valid: true,
                metadata,
                message: 'Backup verificado com sucesso'
            };
        } catch (error) {
            return {
                success: false,
                valid: false,
                error: error.message,
                message: 'Falha na verificação do backup'
            };
        }
    }

    async getDiskUsage() {
        try {
            const { exec } = require('child_process');
            const util = require('util');
            const execPromise = util.promisify(exec);
            
            // Obter uso de disco do diretório de backups
            const { stdout } = await execPromise(`du -sh "${this.backupPath}"`);
            const [size] = stdout.split('\t');
            
            // Obter espaço livre
            const { stdout: dfStdout } = await execPromise(`df -h "${this.backupPath}" | tail -1`);
            const dfParts = dfStdout.split(/\s+/);
            
            return {
                backupSize: size,
                totalSpace: dfParts[1],
                usedSpace: dfParts[2],
                freeSpace: dfParts[3],
                usagePercentage: dfParts[4]
            };
        } catch (error) {
            logger.error('Erro ao obter uso de disco:', error);
            return { error: error.message };
        }
    }
}

module.exports = new BackupService();