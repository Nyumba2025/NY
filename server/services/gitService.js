const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs').promises;
const { createLogger } = require('../utils/logger');
const config = require('../utils/config');

const logger = createLogger('git-service');
const git = simpleGit({
    baseDir: process.cwd(),
    binary: 'git',
    maxConcurrentProcesses: 6
});

class GitService {
    constructor() {
        this.initializeGit();
    }

    async initializeGit() {
        try {
            const isRepo = await git.checkIsRepo();
            if (!isRepo) {
                await git.init();
                await this.createInitialCommit();
                logger.info('Repositório Git inicializado');
            }
        } catch (error) {
            logger.error('Erro ao inicializar Git:', error);
        }
    }

    async createInitialCommit() {
        try {
            // Adicionar arquivos iniciais
            await this.addInitialFiles();
            await git.commit('Initial commit - Nyumba Admin System');
            logger.info('Commit inicial criado');
        } catch (error) {
            logger.warn('Não foi possível criar commit inicial:', error.message);
        }
    }

    async addInitialFiles() {
        const initialFiles = [
            'package.json',
            'package-lock.json',
            'server/',
            'public/',
            'data/',
            '.env.example'
        ];
        
        for (const file of initialFiles) {
            try {
                await fs.access(file);
                await git.add(file);
            } catch (error) {
                // Arquivo pode não existir, ignorar
            }
        }
    }

    async commit(message, author) {
        try {
            // Adicionar todos os arquivos modificados
            await git.add(['./data/*', './public/js/*-data.js']);
            
            // Fazer commit
            const commitOptions = {};
            if (author) {
                commitOptions['--author'] = `${author} <${author}@nyumba.com>`;
            }
            
            await git.commit(message, commitOptions);
            
            // Push para o repositório remoto (se configurado)
            const remotes = await git.getRemotes();
            if (remotes.length > 0) {
                await git.push();
                logger.info(`Commit realizado e enviado: ${message}`);
            } else {
                logger.info(`Commit realizado: ${message}`);
            }
            
            return { success: true, message: 'Commit realizado' };
        } catch (error) {
            logger.error('Erro ao fazer commit:', error);
            return { success: false, error: error.message };
        }
    }

    async getHistory(limit = 20, page = 1) {
        try {
            const log = await git.log({
                maxCount: limit,
                skip: (page - 1) * limit
            });
            
            return {
                commits: log.all.map(commit => ({
                    hash: commit.hash,
                    shortHash: commit.hash.substring(0, 7),
                    author: commit.author_name,
                    email: commit.author_email,
                    date: commit.date,
                    message: commit.message,
                    body: commit.body
                })),
                total: log.total,
                latest: log.latest?.hash || null
            };
        } catch (error) {
            logger.error('Erro ao obter histórico:', error);
            throw error;
        }
    }

    async getCommitDetails(hash) {
        try {
            const show = await git.show([hash, '--stat', '--name-only']);
            const diff = await git.diff([`${hash}^`, hash, '--stat']);
            
            const filesChanged = await git.show([hash, '--name-only', '--format=']);
            const fileList = filesChanged.trim().split('\n').filter(f => f);
            
            return {
                hash,
                shortHash: hash.substring(0, 7),
                details: show,
                diffStat: diff,
                files: fileList
            };
        } catch (error) {
            logger.error('Erro ao obter detalhes do commit:', error);
            throw error;
        }
    }

    async revertToCommit(hash, author) {
        try {
            // Salvar estado atual
            await this.commit(`Backup antes de reverter para ${hash.substring(0, 7)}`, author);
            
            // Fazer checkout dos arquivos do commit específico
            const files = ['data/home.json', 'data/gallery.json', 'data/menu.json'];
            for (const file of files) {
                try {
                    await git.checkout([hash, '--', file]);
                } catch (error) {
                    logger.warn(`Não foi possível restaurar ${file}:`, error.message);
                }
            }
            
            // Commit da reversão
            await this.commit(`Revertido para commit ${hash.substring(0, 7)}`, author);
            
            return { 
                success: true, 
                message: `Revertido para commit ${hash.substring(0, 7)}` 
            };
        } catch (error) {
            logger.error('Erro ao reverter commit:', error);
            throw error;
        }
    }

    async getStatus() {
        try {
            const status = await git.status();
            const branch = await git.branch();
            
            return {
                currentBranch: branch.current,
                isClean: status.isClean(),
                files: {
                    modified: status.modified,
                    created: status.created,
                    deleted: status.deleted,
                    not_added: status.not_added
                },
                ahead: status.ahead,
                behind: status.behind
            };
        } catch (error) {
            logger.error('Erro ao obter status:', error);
            return { error: error.message };
        }
    }

    async addRemote(name, url) {
        try {
            await git.addRemote(name, url);
            logger.info(`Remote adicionado: ${name} - ${url}`);
            return { success: true };
        } catch (error) {
            logger.error('Erro ao adicionar remote:', error);
            return { success: false, error: error.message };
        }
    }

    async setupAutoPush() {
        try {
            // Configurar push automático
            await git.addConfig('push.auto', 'true');
            await git.addConfig('push.default', 'current');
            
            logger.info('Push automático configurado');
            return { success: true };
        } catch (error) {
            logger.error('Erro ao configurar push automático:', error);
            return { success: false, error: error.message };
        }
    }

    async createBranch(name) {
        try {
            await git.checkoutLocalBranch(name);
            logger.info(`Branch criado: ${name}`);
            return { success: true, branch: name };
        } catch (error) {
            logger.error('Erro ao criar branch:', error);
            return { success: false, error: error.message };
        }
    }

    async mergeBranch(branchName) {
        try {
            await git.merge([branchName]);
            logger.info(`Branch ${branchName} mesclado`);
            return { success: true };
        } catch (error) {
            logger.error('Erro ao mesclar branch:', error);
            return { success: false, error: error.message };
        }
    }

    async getBranches() {
        try {
            const branches = await git.branch(['-a']);
            return {
                local: branches.all.filter(b => !b.includes('remotes/')),
                remote: branches.all.filter(b => b.includes('remotes/')).map(b => b.replace('remotes/', '')),
                current: branches.current
            };
        } catch (error) {
            logger.error('Erro ao obter branches:', error);
            return { error: error.message };
        }
    }

    async getFileHistory(filePath, limit = 10) {
        try {
            const log = await git.log({
                file: filePath,
                maxCount: limit
            });
            
            return log.all.map(commit => ({
                hash: commit.hash,
                shortHash: commit.hash.substring(0, 7),
                author: commit.author_name,
                date: commit.date,
                message: commit.message
            }));
        } catch (error) {
            logger.error(`Erro ao obter histórico do arquivo ${filePath}:`, error);
            return [];
        }
    }

    async getChangesBetweenCommits(oldHash, newHash) {
        try {
            const diff = await git.diff([oldHash, newHash, '--stat']);
            const diffDetailed = await git.diff([oldHash, newHash]);
            
            return {
                stat: diff,
                detailed: diffDetailed
            };
        } catch (error) {
            logger.error('Erro ao obter diferenças entre commits:', error);
            throw error;
        }
    }

    async tagCommit(tagName, message = '') {
        try {
            await git.addTag(tagName);
            if (message) {
                await git.addAnnotatedTag(tagName, message);
            }
            
            // Push das tags
            const remotes = await git.getRemotes();
            if (remotes.length > 0) {
                await git.pushTags();
            }
            
            logger.info(`Tag criada: ${tagName}`);
            return { success: true, tag: tagName };
        } catch (error) {
            logger.error('Erro ao criar tag:', error);
            return { success: false, error: error.message };
        }
    }

    async getTags() {
        try {
            const tags = await git.tags();
            return tags.all;
        } catch (error) {
            logger.error('Erro ao obter tags:', error);
            return [];
        }
    }

    async cleanupBranches() {
        try {
            // Remover branches locais mescladas
            await git.branch(['--merged']).then((branches) => {
                const current = branches.current;
                branches.all.forEach(branch => {
                    if (branch !== current && !branch.includes('*')) {
                        git.branch(['-d', branch]).catch(() => {
                            // Ignorar erros em branches não mescladas completamente
                        });
                    }
                });
            });
            
            logger.info('Branches limpas');
            return { success: true };
        } catch (error) {
            logger.error('Erro ao limpar branches:', error);
            return { success: false, error: error.message };
        }
    }

    async getContributors() {
        try {
            const log = await git.log({ '--format': '%aN|%aE' });
            const contributors = new Map();
            
            log.all.forEach(commit => {
                const [name, email] = commit.hash.split('|');
                if (!contributors.has(email)) {
                    contributors.set(email, {
                        name,
                        email,
                        commits: 1,
                        firstCommit: commit.date,
                        lastCommit: commit.date
                    });
                } else {
                    const contributor = contributors.get(email);
                    contributor.commits++;
                    if (new Date(commit.date) < new Date(contributor.firstCommit)) {
                        contributor.firstCommit = commit.date;
                    }
                    if (new Date(commit.date) > new Date(contributor.lastCommit)) {
                        contributor.lastCommit = commit.date;
                    }
                }
            });
            
            return Array.from(contributors.values()).sort((a, b) => b.commits - a.commits);
        } catch (error) {
            logger.error('Erro ao obter contribuidores:', error);
            return [];
        }
    }

    async getStats() {
        try {
            const status = await this.getStatus();
            const contributors = await this.getContributors();
            const branches = await this.getBranches();
            const tags = await this.getTags();
            
            return {
                status,
                contributors: {
                    total: contributors.length,
                    list: contributors.slice(0, 5) // Top 5 contribuidores
                },
                branches: {
                    total: branches.local.length + branches.remote.length,
                    current: branches.current,
                    local: branches.local.length,
                    remote: branches.remote.length
                },
                tags: {
                    total: tags.length,
                    latest: tags[tags.length - 1] || null
                }
            };
        } catch (error) {
            logger.error('Erro ao obter estatísticas do Git:', error);
            return { error: error.message };
        }
    }
}

module.exports = new GitService();