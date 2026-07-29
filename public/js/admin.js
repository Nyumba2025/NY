// Variáveis globais
let homeData = {};
let galleryData = { items: [] };
let menuData = { categories: [] };
let currentUser = null;
let unsavedChanges = false;
let currentHistoryPage = 1;
let historyTotalPages = 1;

// Elementos DOM
const loadingOverlay = document.getElementById('loadingOverlay');
const usernameSpan = document.getElementById('username');
const dropdownMenu = document.getElementById('dropdownMenu');

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    // Verificar autenticação
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) {
        window.location.href = '/login';
        return;
    }
    
    try {
        // Carregar dados do usuário
        await loadUserData();
        
        // Carregar dados iniciais
        await loadInitialData();
    } catch(e) {
        console.error('Erro na inicialização:', e);
    } finally {
        // Esconder loading — sempre, mesmo em caso de erro
        hideLoading();
    }
    
    // Iniciar polling de status
    startStatusPolling();
    
    // Prevenir navegação acidental
    window.addEventListener('beforeunload', (e) => {
        if (unsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
});

// ==================== AUTENTICAÇÃO ====================
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/session');
        const data = await response.json();
        
        if (data.authenticated) {
            currentUser = data.user;
            return true;
        }
        return false;
    } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        return false;
    }
}

async function loadUserData() {
    if (currentUser) {
        usernameSpan.textContent = currentUser.username;
        
        // Mostrar/ocultar menus baseados no role
        if (currentUser.role !== 'admin') {
            document.getElementById('deployMenuItem').classList.add('hidden');
            document.getElementById('usersMenuItem').classList.add('hidden');
        }
    }
}

async function logout() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        window.location.href = '/login';
    } catch (error) {
        showToast('Erro ao fazer logout', 'error');
    }
}

function changePassword() {
    // Limpar formulário
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
    
    // Mostrar modal
    showModal('passwordModal');
}

async function submitPasswordChange() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    
    if (newPassword !== confirmNewPassword) {
        showToast('As senhas não conferem', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            },
            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Senha alterada com sucesso', 'success');
            closeModal('passwordModal');
            
            if (data.requiresReauth) {
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            }
        } else {
            showToast(data.message || 'Erro ao alterar senha', 'error');
        }
    } catch (error) {
        showToast('Erro ao alterar senha', 'error');
    }
}

// ==================== NAVEGAÇÃO ====================
function openSection(sectionId) {
    try {
        console.log('openSection chamada para:', sectionId);
        
        // Esconder todas as seções
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        
        // Remover active de todos os itens do menu
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Mostrar seção selecionada
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');
        } else {
            console.warn('Seção não encontrada por ID:', sectionId);
        }
        
        // Ativar item do menu correspondente
        document.querySelectorAll('.menu-item').forEach(item => {
            const attrClick = item.getAttribute('onclick') || '';
            const dataSec = item.getAttribute('data-section') || '';
            if (dataSec === sectionId || attrClick.includes(`'${sectionId}'`)) {
                item.classList.add('active');
            }
        });
        
        // Carregar dados específicos da seção
        switch(sectionId) {
            case 'dashboard':
                loadDashboardData();
                break;
            case 'principal':
                loadHomeData();
                break;
            case 'gallery':
                loadGalleryData();
                break;
            case 'menu':
                loadWeeklyMenuData();
                break;
            case 'alacarte':
                loadAlacarteData();
                break;
            case 'history':
                loadHistory();
                break;
            case 'backup':
                loadBackupData();
                break;
            case 'deploy':
                loadDeployData();
                break;
            case 'users':
                if (typeof loadUsersData === 'function') loadUsersData();
                break;
            case 'settings':
                if (typeof loadSystemInfo === 'function') loadSystemInfo();
                break;
        }
    } catch(err) {
        console.error('Erro em openSection:', err);
    }
}


function toggleDropdown() {
    const menu = document.getElementById('dropdownMenu');
    if (menu) {
        menu.classList.toggle('show');
    }
}

// Fechar dropdown ao clicar fora
document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-dropdown')) {
        const menu = document.getElementById('dropdownMenu');
        if (menu) menu.classList.remove('show');
    }
});

// Listener de delegação global à prova de falhas para navegação e botões
document.addEventListener('click', (e) => {
    // Interceptar cliques em itens de menu lateral ou botões com data-section ou onclick openSection
    const menuItem = e.target.closest('.menu-item') || e.target.closest('.action-btn');
    if (menuItem) {
        const dataSec = menuItem.getAttribute('data-section');
        const onclickAttr = menuItem.getAttribute('onclick') || '';
        const match = onclickAttr.match(/openSection\s*\(\s*'([^']+)'\s*\)/);
        const sectionId = dataSec || (match ? match[1] : null);
        
        if (sectionId) {
            e.preventDefault();
            e.stopPropagation();
            openSection(sectionId);
            return false;
        }
    }

    // Interceptar clique no botão do perfil (canto superior direito)
    const userBtn = e.target.closest('.user-btn');
    if (userBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleDropdown();
        return false;
    }
});

// ==================== CARREGAMENTO DE DADOS ====================
async function loadInitialData() {
    // Carregar todos os dados base em paralelo
    await Promise.all([
        loadHomeData(),
        loadWeeklyMenuData(),
        loadAlacarteData(),
        loadGalleryData()
    ]);
    // Atualizar o dashboard
    await loadDashboardData();
}

async function loadHomeData() {
    try {
        const response = await fetch('/api/admin/home');
        homeData = await response.json();
        
        // Preencher formulário com os dados reais
        document.getElementById('concept-title').value = homeData.conceptTitle || 'O CONCEITO';
        document.getElementById('concept-text').value = homeData.conceptText || '';
        document.getElementById('concept-text-en').value = homeData.conceptTextEn || '';
        
        document.getElementById('social-title').value = homeData.socialCallTitle || 'A NOSSA CASA É A SUA';
        document.getElementById('social-text').value = homeData.socialCallText || '';
        
        document.getElementById('info-location').value = homeData.location || 'FEIMA - MAPUTO';
        document.getElementById('info-address').value = homeData.address || 'Av. Mártires da Machava';
        document.getElementById('info-hours').value = homeData.hoursDetail || 'Aberto todos os dias\n09:00 – 22:00';
        
        document.getElementById('info-phone').value = homeData.phone || '+258 84 669 5390';
        document.getElementById('info-email').value = homeData.email || 'nyumba.maputo@gmail.com';
        document.getElementById('info-whatsapp').value = homeData.whatsappNumber || '258846695390';
        document.getElementById('info-instagram').value = homeData.instagramUrl || 'https://www.instagram.com/nyumbafoodconcept';
        document.getElementById('info-facebook').value = homeData.facebookUrl || 'https://www.facebook.com/people/Nyumbafoodconcept/61578702685238/';
        document.getElementById('info-tripadvisor').value = homeData.tripadvisorUrl || 'https://www.tripadvisor.pt/Restaurant_Review-g293819-d33987869-Reviews-Nyumba_Food_Concept-Maputo_Maputo_Province.html';
        document.getElementById('info-googlemaps').value = homeData.googleMapsUrl || 'https://www.google.com/maps/place/NYUMBA+Food+Concept/@-25.96897,32.593179,17z/data=!4m8!3m7!1s0x1ee69bfe2dccc6a7:0xe72f04de0d760ff5!8m2!3d-25.96897!4d32.593179!9m1!1b1!16s%2Fg%2F11vsw0q663';
        document.getElementById('info-footer').value = homeData.footer || 'Nyumba Food Concept © 2026 | José Freire • Criação';
        
    } catch (error) {
        console.error('Erro ao carregar dados do conceito:', error);
    }
}

async function loadGalleryData() {
    try {
        const response = await fetch('/api/admin/gallery');
        galleryData = await response.json();
        renderGalleryEditor();
    } catch (error) {
        console.error('Erro ao carregar galeria:', error);
        galleryData = { items: [] };
    }
}

async function loadMenuData() {
    try {
        const response = await fetch('/api/admin/menu');
        menuData = await response.json();
        renderMenuEditor();
    } catch (error) {
        console.error('Erro ao carregar menu:', error);
        menuData = { categories: [] };
    }
}

// ==================== DASHBOARD ====================
async function loadDashboardData() {
    try {
        const [homeStatus, galleryStatus, menuStatus, backupStatus] = await Promise.all([
            fetch('/api/admin/home').then(r => r.ok).catch(() => false),
            fetch('/api/admin/gallery').then(r => r.ok).catch(() => false),
            fetch('/api/admin/menu').then(r => r.ok).catch(() => false),
            fetch('/api/admin/backups').then(r => r.ok ? r.json() : {backups:[]}).then(d => d.backups?.length || 0).catch(() => 0)
        ]);
        
        document.getElementById('homeStatus').textContent = homeStatus ? 'Ativo' : 'Erro';
        document.getElementById('galleryStatus').textContent = galleryStatus ? `${galleryData.items.length} imagens` : 'Erro';
        document.getElementById('menuStatus').textContent = menuStatus ? `${menuData.categories.length} categorias` : 'Erro';
        document.getElementById('backupStatus').textContent = `${backupStatus} backups`;
        
        // Carregar atividades recentes
        await loadRecentActivity();
        
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
    }
}

async function loadRecentActivity() {
    try {
        const response = await fetch('/api/admin/history?limit=5');
        const data = await response.json();
        
        if (data.success) {
            const activityList = document.getElementById('activityList');
            activityList.innerHTML = '';
            
            data.history.forEach(commit => {
                const item = document.createElement('div');
                item.className = 'activity-item success';
                item.innerHTML = `
                    <div class="activity-dot"></div>
                    <div class="activity-content">
                        <p>${commit.message}</p>
                        <small>${new Date(commit.date).toLocaleDateString()} - ${commit.author}</small>
                    </div>
                `;
                activityList.appendChild(item);
            });
        }
    } catch (error) {
        console.error('Erro ao carregar atividades:', error);
    }
}

function startStatusPolling() {
    setInterval(async () => {
        await checkSystemStatus();
    }, 30000);
}

async function checkSystemStatus() {
    try {
        const response = await fetch('/api/admin/status');
        const data = await response.json();
        
        if (data.success) {
            // Atualizar status no dashboard se necessário
        }
    } catch (error) {
        console.error('Erro ao verificar status:', error);
    }
}

// ==================== PÁGINA PRINCIPAL ====================
function renderServices() {
    const container = document.getElementById('services-container');
    container.innerHTML = '';
    
    if (!homeData.services || homeData.services.length === 0) {
        homeData.services = [];
        container.innerHTML = '<p class="text-center">Nenhum serviço adicionado.</p>';
        return;
    }
    
    homeData.services.forEach((service, index) => {
        const serviceDiv = document.createElement('div');
        serviceDiv.className = 'form-section';
        serviceDiv.innerHTML = `
            <h4>Serviço ${index + 1}</h4>
            <div class="form-group">
                <label>Título</label>
                <input type="text" class="form-control service-title" data-index="${index}" 
                    value="${service.title || ''}" placeholder="Título do serviço">
            </div>
            <div class="form-group">
                <label>Descrição</label>
                <textarea class="form-control service-description" data-index="${index}" 
                    placeholder="Descrição do serviço">${service.description || ''}</textarea>
            </div>
            <button class="btn btn-danger" onclick="removeService(${index})">
                <i class="fas fa-trash"></i> Remover Serviço
            </button>
        `;
        container.appendChild(serviceDiv);
    });
    
    // Vincular eventos
    setTimeout(() => {
        document.querySelectorAll('.service-title').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.index);
                if (!homeData.services[index]) homeData.services[index] = {};
                homeData.services[index].title = e.target.value;
                setUnsavedChanges(true);
            });
        });
        
        document.querySelectorAll('.service-description').forEach(textarea => {
            textarea.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.index);
                if (!homeData.services[index]) homeData.services[index] = {};
                homeData.services[index].description = e.target.value;
                setUnsavedChanges(true);
            });
        });
    }, 100);
}

function addService() {
    if (!homeData.services) {
        homeData.services = [];
    }
    homeData.services.push({
        title: '',
        description: ''
    });
    renderServices();
    setUnsavedChanges(true);
}

function removeService(index) {
    if (confirm('Remover este serviço?')) {
        homeData.services.splice(index, 1);
        renderServices();
        setUnsavedChanges(true);
    }
}

async function saveHomeData() {
    try {
        homeData = {
            conceptTitle: document.getElementById('concept-title').value,
            conceptText: document.getElementById('concept-text').value,
            conceptTextEn: document.getElementById('concept-text-en').value,
            socialCallTitle: document.getElementById('social-title').value,
            socialCallText: document.getElementById('social-text').value,
            location: document.getElementById('info-location').value,
            address: document.getElementById('info-address').value,
            hoursDetail: document.getElementById('info-hours').value,
            phone: document.getElementById('info-phone').value,
            email: document.getElementById('info-email').value,
            whatsappNumber: document.getElementById('info-whatsapp').value,
            instagramUrl: document.getElementById('info-instagram').value,
            facebookUrl: document.getElementById('info-facebook').value,
            tripadvisorUrl: document.getElementById('info-tripadvisor').value,
            googleMapsUrl: document.getElementById('info-googlemaps').value,
            footer: document.getElementById('info-footer').value
        };
        
        const response = await fetch('/api/admin/home', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            },
            body: JSON.stringify(homeData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Informações do Conceito salvas com sucesso!', 'success');
            setUnsavedChanges(false);
        } else {
            showToast(result.error || 'Erro ao salvar informações', 'error');
        }
    } catch (error) {
        showToast('Erro ao salvar informações', 'error');
    }
}

function previewHome() {
    // Salvar dados temporariamente para preview
    const tempData = {
        ...homeData,
        hero: {
            title: document.getElementById('hero-title').value,
            subtitle: document.getElementById('hero-subtitle').value,
            buttonText: document.getElementById('hero-button').value
        },
        about: {
            title: document.getElementById('about-title').value,
            description: document.getElementById('about-description').value
        },
        footer: {
            copyright: document.getElementById('footer-copyright').value,
            contact: document.getElementById('footer-contact').value
        }
    };
    
    // Enviar para preview
    fetch('/api/admin/preview', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify({
            type: 'home',
            data: tempData
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.open(data.previewUrl, '_blank');
        }
    })
    .catch(error => {
        showToast('Erro ao gerar preview', 'error');
    });
}

function resetHomeForm() {
    if (unsavedChanges && !confirm('Descartar alterações não salvas?')) {
        return;
    }
    loadHomeData();
    setUnsavedChanges(false);
}

// ==================== GALERIA ====================
function renderGalleryEditor() {
    const container = document.getElementById('gallery-editor');
    container.innerHTML = '';
    
    if (!galleryData.items || galleryData.items.length === 0) {
        container.innerHTML = `
            <div class="text-center">
                <p>Nenhuma imagem na galeria.</p>
                <button class="btn btn-primary" onclick="addGalleryItem()">
                    <i class="fas fa-plus"></i> Adicionar Primeira Imagem
                </button>
            </div>
        `;
        return;
    }
    
    const galleryDiv = document.createElement('div');
    galleryDiv.className = 'form-container';
    
    galleryData.items.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'form-section';
        itemDiv.innerHTML = `
            <h4>Imagem ${index + 1}</h4>
            <div class="form-group">
                <label>URL da Imagem</label>
                <input type="text" class="form-control gallery-src" data-index="${index}" 
                    value="${item.src || ''}" placeholder="https://exemplo.com/imagem.jpg">
                <div class="form-hint">Use uma URL externa ou caminho relativo para a imagem</div>
            </div>
            <div class="form-group">
                <label>Legenda</label>
                <textarea class="form-control gallery-caption" data-index="${index}" 
                    placeholder="Descrição da imagem">${item.caption || ''}</textarea>
            </div>
            <div class="form-actions">
                <button class="btn btn-danger" onclick="removeGalleryItem(${index})">
                    <i class="fas fa-trash"></i> Remover
                </button>
            </div>
        `;
        galleryDiv.appendChild(itemDiv);
    });
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'form-actions';
    actionsDiv.innerHTML = `
        <button class="btn btn-primary" onclick="saveGalleryData()">
            <i class="fas fa-save"></i> Salvar Galeria
        </button>
        <button class="btn btn-outline" onclick="addGalleryItem()">
            <i class="fas fa-plus"></i> Adicionar Imagem
        </button>
        <button class="btn btn-outline" onclick="previewGallery()">
            <i class="fas fa-eye"></i> Visualizar
        </button>
    `;
    
    container.appendChild(galleryDiv);
    container.appendChild(actionsDiv);
    
    // Vincular eventos
    setTimeout(() => {
        document.querySelectorAll('.gallery-src').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.index);
                if (!galleryData.items[index]) galleryData.items[index] = {};
                galleryData.items[index].src = e.target.value;
                setUnsavedChanges(true);
            });
        });
        
        document.querySelectorAll('.gallery-caption').forEach(textarea => {
            textarea.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.index);
                if (!galleryData.items[index]) galleryData.items[index] = {};
                galleryData.items[index].caption = e.target.value;
                setUnsavedChanges(true);
            });
        });
    }, 100);
}

function addGalleryItem() {
    if (!galleryData.items) {
        galleryData.items = [];
    }
    galleryData.items.push({ src: '', caption: '' });
    renderGalleryEditor();
    setUnsavedChanges(true);
}

function removeGalleryItem(index) {
    if (confirm('Remover esta imagem?')) {
        galleryData.items.splice(index, 1);
        renderGalleryEditor();
        setUnsavedChanges(true);
    }
}

async function saveGalleryData() {
    try {
        const response = await fetch('/api/admin/gallery', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            },
            body: JSON.stringify(galleryData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Galeria salva com sucesso!', 'success');
            setUnsavedChanges(false);
        } else {
            showToast(result.message || 'Erro ao salvar', 'error');
        }
    } catch (error) {
        showToast('Erro ao salvar galeria', 'error');
    }
}

function previewGallery() {
    fetch('/api/admin/preview', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify({
            type: 'gallery',
            data: galleryData
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.open(data.previewUrl, '_blank');
        }
    })
    .catch(error => {
        showToast('Erro ao gerar preview', 'error');
    });
}

// ==================== MENU SEMANAL ====================
let weeklyMenuData = {};

async function loadWeeklyMenuData() {
    try {
        const response = await fetch('/api/admin/menu');
        weeklyMenuData = await response.json();
        renderWeeklyMenuEditor();
    } catch (error) {
        console.error('Erro ao carregar menu semanal:', error);
    }
}

function renderWeeklyMenuEditor() {
    const container = document.getElementById('weekly-menu-container');
    if (!container) return;
    container.innerHTML = '';

    // Botões de Ação no topo
    const topActions = document.createElement('div');
    topActions.className = 'form-actions';
    topActions.style.cssText = 'margin-bottom: 20px; display: flex; gap: 12px; flex-wrap: wrap;';
    topActions.innerHTML = `
        <button type="button" class="btn btn-primary btn-lg" onclick="saveWeeklyMenuData(); return false;">
            <i class="fas fa-save"></i> Guardar Menu Semanal
        </button>
        <button type="button" class="btn btn-success btn-lg" onclick="publishToGitHub(); return false;" style="background: #27ae60;">
            <i class="fab fa-github"></i> Publicar no GitHub
        </button>
    `;
    container.appendChild(topActions);

    const daysMap = {
        '1': 'Segunda-feira',
        '2': 'Terça-feira',
        '3': 'Quarta-feira',
        '4': 'Quinta-feira',
        '5': 'Sexta-feira'
    };

    Object.keys(daysMap).forEach(dayKey => {
        const dayData = weeklyMenuData[dayKey] || {
            pt: daysMap[dayKey].split('-')[0],
            en: 'Day',
            sopa: { pt: '', en: '', p: '180MT' },
            pratos: [],
            sobremesa: { pt: '', en: '', p: '180MT' }
        };

        const dayCard = document.createElement('div');
        dayCard.className = 'form-section';
        dayCard.style.marginBottom = '25px';

        let pratosHtml = '';
        (dayData.pratos || []).forEach((prato, idx) => {
            pratosHtml += `
                <div class="prato-item-card" style="border: 1px solid rgba(0,0,0,0.1); padding: 15px; border-radius: 8px; margin-bottom: 12px; background: #fafafa;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <strong>Prato Principal ${idx + 1}</strong>
                        <button type="button" class="btn btn-danger btn-sm" onclick="removePratoSemanal('${dayKey}', ${idx}); return false;">
                            <i class="fas fa-trash"></i> Remover
                        </button>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div class="form-group">
                            <label>Nome (Português)</label>
                            <input type="text" class="form-control" value="${prato.pt || ''}" onchange="updatePratoSemanal('${dayKey}', ${idx}, 'pt', this.value)">
                        </div>
                        <div class="form-group">
                            <label>Nome (Inglês)</label>
                            <input type="text" class="form-control" value="${prato.en || ''}" onchange="updatePratoSemanal('${dayKey}', ${idx}, 'en', this.value)">
                        </div>
                        <div class="form-group">
                            <label>Descrição (Português)</label>
                            <input type="text" class="form-control" value="${prato.d_pt || ''}" onchange="updatePratoSemanal('${dayKey}', ${idx}, 'd_pt', this.value)">
                        </div>
                        <div class="form-group">
                            <label>Descrição (Inglês)</label>
                            <input type="text" class="form-control" value="${prato.d_en || ''}" onchange="updatePratoSemanal('${dayKey}', ${idx}, 'd_en', this.value)">
                        </div>
                        <div class="form-group" style="grid-column: span 2;">
                            <label>Preço (ex: 500MT)</label>
                            <input type="text" class="form-control" value="${prato.p || ''}" onchange="updatePratoSemanal('${dayKey}', ${idx}, 'p', this.value)">
                        </div>
                    </div>
                </div>
            `;
        });

        dayCard.innerHTML = `
            <h3 style="color:#d35400;"><i class="fas fa-calendar-day"></i> ${daysMap[dayKey]}</h3>
            
            <div style="background: rgba(217, 108, 6, 0.08); padding: 12px; border-radius: 8px; margin-bottom: 15px; border: 1px solid rgba(217, 108, 6, 0.2);">
                <h4 style="margin-top: 0; color: #D96C06;"><i class="fas fa-bowl-food"></i> Sopa do Dia</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr 120px; gap: 10px;">
                    <div class="form-group">
                        <label>Nome (PT)</label>
                        <input type="text" class="form-control" value="${dayData.sopa?.pt || ''}" onchange="updateSopaSemanal('${dayKey}', 'pt', this.value)">
                    </div>
                    <div class="form-group">
                        <label>Nome (EN)</label>
                        <input type="text" class="form-control" value="${dayData.sopa?.en || ''}" onchange="updateSopaSemanal('${dayKey}', 'en', this.value)">
                    </div>
                    <div class="form-group">
                        <label>Preço</label>
                        <input type="text" class="form-control" value="${dayData.sopa?.p || ''}" onchange="updateSopaSemanal('${dayKey}', 'p', this.value)">
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 15px;">
                <h4 style="margin-top: 0;"><i class="fas fa-utensils"></i> Pratos Principais</h4>
                ${pratosHtml || '<p style="opacity: 0.6; font-style: italic;">Nenhum prato adicionado.</p>'}
                <button type="button" class="btn btn-outline btn-sm" onclick="addPratoSemanal('${dayKey}'); return false;" style="margin-top: 5px;">
                    <i class="fas fa-plus"></i> Adicionar Prato Principal
                </button>
            </div>

            <div style="background: rgba(0, 0, 0, 0.03); padding: 12px; border-radius: 8px; border: 1px solid rgba(0, 0, 0, 0.08);">
                <h4 style="margin-top: 0;"><i class="fas fa-ice-cream"></i> Sobremesa do Dia</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr 120px; gap: 10px;">
                    <div class="form-group">
                        <label>Nome (PT)</label>
                        <input type="text" class="form-control" value="${dayData.sobremesa?.pt || ''}" onchange="updateSobremesaSemanal('${dayKey}', 'pt', this.value)">
                    </div>
                    <div class="form-group">
                        <label>Nome (EN)</label>
                        <input type="text" class="form-control" value="${dayData.sobremesa?.en || ''}" onchange="updateSobremesaSemanal('${dayKey}', 'en', this.value)">
                    </div>
                    <div class="form-group">
                        <label>Preço</label>
                        <input type="text" class="form-control" value="${dayData.sobremesa?.p || ''}" onchange="updateSobremesaSemanal('${dayKey}', 'p', this.value)">
                    </div>
                </div>
            </div>
        `;

        container.appendChild(dayCard);
    });

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'form-actions';
    actionsDiv.style.cssText = 'margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap;';
    actionsDiv.innerHTML = `
        <button type="button" class="btn btn-primary btn-lg" onclick="saveWeeklyMenuData(); return false;">
            <i class="fas fa-save"></i> Guardar Menu Semanal
        </button>
        <button type="button" class="btn btn-success btn-lg" onclick="publishToGitHub(); return false;" style="background: #27ae60;">
            <i class="fab fa-github"></i> Publicar no GitHub
        </button>
    `;
    container.appendChild(actionsDiv);
}

function updateSopaSemanal(dayKey, field, val) {
    if (!weeklyMenuData[dayKey]) weeklyMenuData[dayKey] = { sopa: {}, pratos: [], sobremesa: {} };
    if (!weeklyMenuData[dayKey].sopa) weeklyMenuData[dayKey].sopa = {};
    weeklyMenuData[dayKey].sopa[field] = val;
    setUnsavedChanges(true);
}

function updateSobremesaSemanal(dayKey, field, val) {
    if (!weeklyMenuData[dayKey]) weeklyMenuData[dayKey] = { sopa: {}, pratos: [], sobremesa: {} };
    if (!weeklyMenuData[dayKey].sobremesa) weeklyMenuData[dayKey].sobremesa = {};
    weeklyMenuData[dayKey].sobremesa[field] = val;
    setUnsavedChanges(true);
}

function updatePratoSemanal(dayKey, idx, field, val) {
    if (!weeklyMenuData[dayKey] || !weeklyMenuData[dayKey].pratos[idx]) return;
    weeklyMenuData[dayKey].pratos[idx][field] = val;
    setUnsavedChanges(true);
}

function addPratoSemanal(dayKey) {
    if (!weeklyMenuData[dayKey]) weeklyMenuData[dayKey] = { pt: '', en: '', sopa: { pt: '', en: '', p: '180MT' }, pratos: [], sobremesa: { pt: '', en: '', p: '180MT' } };
    if (!weeklyMenuData[dayKey].pratos) weeklyMenuData[dayKey].pratos = [];
    weeklyMenuData[dayKey].pratos.push({ pt: '', en: '', d_pt: '', d_en: '', p: '500MT' });
    renderWeeklyMenuEditor();
    setUnsavedChanges(true);
}

function removePratoSemanal(dayKey, idx) {
    if (confirm('Remover este prato principal?')) {
        weeklyMenuData[dayKey].pratos.splice(idx, 1);
        renderWeeklyMenuEditor();
        setUnsavedChanges(true);
    }
}

async function saveWeeklyMenuData() {
    try {
        const response = await fetch('/api/admin/menu', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            },
            body: JSON.stringify(weeklyMenuData)
        });
        const result = await response.json();
        if (result.success) {
            showToast('Menu Semanal salvo com sucesso!', 'success');
            setUnsavedChanges(false);
        } else {
            showToast(result.error || 'Erro ao salvar menu semanal', 'error');
        }
    } catch (error) {
        showToast('Erro ao salvar menu semanal', 'error');
    }
}

// ==================== MENU À LA CARTE ====================
let alacarteData = {};

async function loadAlacarteData() {
    try {
        const response = await fetch('/api/admin/alacarte');
        if (response.ok) {
            alacarteData = await response.json();
        }
    } catch (error) {
        console.error('Erro ao carregar menu à la carte:', error);
    }

    if (!alacarteData || typeof alacarteData !== 'object' || Object.keys(alacarteData).length === 0) {
        alacarteData = {
            appetizers: [
                { pt: "Rabada", en: "Oxtail", p: "350MT", d_pt: "Estufada tradicional", d_en: "Traditional stew" },
                { pt: "Amêijoas à NYUMBA", en: "Clams NYUMBA", p: "400MT", d_pt: "Com molho especial da casa", d_en: "With house sauce" },
                { pt: "Camarão Alinho", en: "Shrimp Alinho", p: "350MT", d_pt: "Com alho e ervas aromáticas", d_en: "Garlic and herbs" },
                { pt: "Chouriço", en: "Chorizo", p: "400MT", d_pt: "Com batata e salada", d_en: "Served with potatoes and salad" }
            ],
            starter: [
                { pt: "Creme de Cenoura", en: "Carrot Cream", p: "150MT", d_pt: "Nutritiva", d_en: "Nutritious" },
                { pt: "Caldo Verde", en: "Green Broth", p: "180MT", d_pt: "Com chouriço", d_en: "With chorizo" }
            ],
            snacks: [
                { pt: "Salgados (4 unidades)", en: "Savory Pastries (4)", p: "250MT", d_pt: "Mix de salgadinhos fritos na hora", d_en: "Freshly fried savory mix" }
            ],
            sandwiches: [
                { pt: "Hamburguer Simples", en: "Simple Burger", p: "250MT", d_pt: "Com ovo ou queijo e batata frita", d_en: "With egg or cheese and French fries" },
                { pt: "Nyumba Burguer", en: "Nyumba Burger", p: "500MT", d_pt: "Maionese caseira, mozzarella, batata frita", d_en: "Homemade mayo, mozzarella, fries" },
                { pt: "Prego no pão", en: "Steak Sandwich", p: "350MT", d_pt: "Bife suculento em pão fresco", d_en: "Juicy steak in fresh bread" },
                { pt: "Tosta Mista", en: "Ham & Cheese Toast", p: "280MT", d_pt: "Pão tostado com fiambre e queijo", d_en: "Toasted bread with ham and cheese" }
            ],
            plates: [
                { pt: "Matabicho Thafo", en: "Thafo Breakfast", p: "500MT", d_pt: "2 ovos, tomate, salsichas, torradas, feijão doce e bacon", d_en: "2 eggs, tomato, sausages, toast, baked beans and bacon" }
            ],
            dessert: [
                { pt: "Sorvete", en: "Ice Cream", p: "180MT", d_pt: "Vários sabores disponíveis", d_en: "Various flavors available" },
                { pt: "Pudim", en: "Caramel Pudding", p: "180MT", d_pt: "Caseiro e cremoso", d_en: "Homemade and creamy" },
                { pt: "Bolo de Chocolate", en: "Chocolate Cake", p: "250MT", d_pt: "Fatia generosa e húmida", d_en: "Generous moist slice" }
            ]
        };
    }
    renderAlacarteEditor();
}

function renderAlacarteEditor() {
    const container = document.getElementById('alacarte-menu-container');
    if (!container) return;
    container.innerHTML = '';

    // Botões de Ação no topo
    const topActions = document.createElement('div');
    topActions.className = 'form-actions';
    topActions.style.cssText = 'margin-bottom: 20px; display: flex; gap: 12px; flex-wrap: wrap;';
    topActions.innerHTML = `
        <button type="button" class="btn btn-primary btn-lg" onclick="saveAlacarteData(); return false;">
            <i class="fas fa-save"></i> Guardar Menu À La Carte
        </button>
        <button type="button" class="btn btn-success btn-lg" onclick="publishToGitHub(); return false;" style="background: #27ae60;">
            <i class="fab fa-github"></i> Publicar no GitHub
        </button>
    `;
    container.appendChild(topActions);

    const categoriesMap = {
        'appetizers': 'Petiscos (Appetizers)',
        'starter': 'Entradas / Sopas (Starters)',
        'snacks': 'Snacks',
        'sandwiches': 'No Pão (Burgers & Tostas)',
        'plates': 'No Prato (On Plate)',
        'dessert': 'Sobremesas (Desserts)'
    };

    Object.keys(categoriesMap).forEach(catKey => {
        const items = alacarteData[catKey] || [];
        const catCard = document.createElement('div');
        catCard.className = 'form-section';
        catCard.style.marginBottom = '25px';

        let itemsHtml = '';
        items.forEach((item, idx) => {
            itemsHtml += `
                <div style="border: 1px solid rgba(0,0,0,0.1); padding: 15px; border-radius: 8px; margin-bottom: 12px; background: #fafafa;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <strong>Item ${idx + 1}: ${item.pt || 'Sem nome'}</strong>
                        <button type="button" class="btn btn-danger btn-sm" onclick="removeAlacarteItem('${catKey}', ${idx}); return false;">
                            <i class="fas fa-trash"></i> Remover
                        </button>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div class="form-group">
                            <label>Nome (Português)</label>
                            <input type="text" class="form-control" value="${item.pt || ''}" onchange="updateAlacarteItem('${catKey}', ${idx}, 'pt', this.value)">
                        </div>
                        <div class="form-group">
                            <label>Nome (Inglês)</label>
                            <input type="text" class="form-control" value="${item.en || ''}" onchange="updateAlacarteItem('${catKey}', ${idx}, 'en', this.value)">
                        </div>
                        <div class="form-group">
                            <label>Descrição (Português)</label>
                            <input type="text" class="form-control" value="${item.d_pt || ''}" onchange="updateAlacarteItem('${catKey}', ${idx}, 'd_pt', this.value)">
                        </div>
                        <div class="form-group">
                            <label>Descrição (Inglês)</label>
                            <input type="text" class="form-control" value="${item.d_en || ''}" onchange="updateAlacarteItem('${catKey}', ${idx}, 'd_en', this.value)">
                        </div>
                        <div class="form-group" style="grid-column: span 2;">
                            <label>Preço (ex: 350MT)</label>
                            <input type="text" class="form-control" value="${item.p || ''}" onchange="updateAlacarteItem('${catKey}', ${idx}, 'p', this.value)">
                        </div>
                    </div>
                </div>
            `;
        });

        catCard.innerHTML = `
            <h3 style="color:#8e44ad;"><i class="fas fa-list"></i> ${categoriesMap[catKey]}</h3>
            ${itemsHtml || '<p style="opacity: 0.6; font-style: italic;">Nenhum item nesta categoria.</p>'}
            <button type="button" class="btn btn-outline btn-sm" onclick="addAlacarteItem('${catKey}'); return false;" style="margin-top: 5px;">
                <i class="fas fa-plus"></i> Adicionar Item a ${categoriesMap[catKey].split(' ')[0]}
            </button>
        `;

        container.appendChild(catCard);
    });

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'form-actions';
    actionsDiv.style.cssText = 'margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap;';
    actionsDiv.innerHTML = `
        <button type="button" class="btn btn-primary btn-lg" onclick="saveAlacarteData(); return false;">
            <i class="fas fa-save"></i> Guardar Menu À La Carte
        </button>
        <button type="button" class="btn btn-success btn-lg" onclick="publishToGitHub(); return false;" style="background: #27ae60;">
            <i class="fab fa-github"></i> Publicar no GitHub
        </button>
    `;
    container.appendChild(actionsDiv);
}

function updateAlacarteItem(catKey, idx, field, val) {
    if (!alacarteData[catKey] || !alacarteData[catKey][idx]) return;
    alacarteData[catKey][idx][field] = val;
    setUnsavedChanges(true);
}

function addAlacarteItem(catKey) {
    if (!alacarteData[catKey]) alacarteData[catKey] = [];
    alacarteData[catKey].push({ pt: '', en: '', d_pt: '', d_en: '', p: '350MT' });
    renderAlacarteEditor();
    setUnsavedChanges(true);
}

function removeAlacarteItem(catKey, idx) {
    if (confirm('Remover este item?')) {
        alacarteData[catKey].splice(idx, 1);
        renderAlacarteEditor();
        setUnsavedChanges(true);
    }
}

async function saveAlacarteData() {
    try {
        const response = await fetch('/api/admin/alacarte', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            },
            body: JSON.stringify(alacarteData)
        });
        const result = await response.json();
        if (result.success) {
            showToast('Menu À La Carte salvo com sucesso!', 'success');
            setUnsavedChanges(false);
        } else {
            showToast(result.error || 'Erro ao salvar à la carte', 'error');
        }
    } catch (error) {
        showToast('Erro ao salvar menu à la carte', 'error');
    }
}

function previewMenu() {
    fetch('/api/admin/preview', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify({
            type: 'menu',
            data: menuData
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.open(data.previewUrl, '_blank');
        }
    })
    .catch(error => {
        showToast('Erro ao gerar preview', 'error');
    });
}

// ==================== HISTÓRICO ====================
async function loadHistory() {
    try {
        const response = await fetch(`/api/admin/history?page=${currentHistoryPage}&limit=10`);
        const data = await response.json();
        
        if (data.success) {
            renderHistoryList(data.history);
            historyTotalPages = data.pages || 1;
            updateHistoryPagination();
        }
    } catch (error) {
        showToast('Erro ao carregar histórico', 'error');
    }
}

function renderHistoryList(history) {
    const container = document.getElementById('historyList');
    container.innerHTML = '';
    
    if (!history || history.length === 0) {
        container.innerHTML = '<p class="text-center">Nenhum histórico disponível.</p>';
        return;
    }
    
    history.forEach(commit => {
        const item = document.createElement('div');
        item.className = 'activity-item success';
        item.innerHTML = `
            <div class="activity-dot"></div>
            <div class="activity-content">
                <p><strong>${commit.message}</strong></p>
                <p><small>Autor: ${commit.author} (${commit.email})</small></p>
                <p><small>Hash: ${commit.shortHash} - ${new Date(commit.date).toLocaleString()}</small></p>
                ${commit.body ? `<p><small>${commit.body.substring(0, 100)}...</small></p>` : ''}
                <div class="mt-10">
                    <button class="btn btn-sm btn-outline" onclick="viewCommitDetails('${commit.hash}')">
                        <i class="fas fa-info-circle"></i> Detalhes
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="revertToCommit('${commit.hash}')">
                        <i class="fas fa-undo"></i> Reverter
                    </button>
                </div>
            </div>
        `;
        container.appendChild(item);
    });
}

function updateHistoryPagination() {
    document.getElementById('historyPageInfo').textContent = 
        `Página ${currentHistoryPage} de ${historyTotalPages}`;
}

function prevHistoryPage() {
    if (currentHistoryPage > 1) {
        currentHistoryPage--;
        loadHistory();
    }
}

function nextHistoryPage() {
    if (currentHistoryPage < historyTotalPages) {
        currentHistoryPage++;
        loadHistory();
    }
}

async function viewCommitDetails(hash) {
    try {
        const response = await fetch(`/api/admin/history/${hash}`);
        const data = await response.json();
        
        if (data.success) {
            alert(`Detalhes do commit ${hash}:\n\n${data.commit.details}`);
        }
    } catch (error) {
        showToast('Erro ao obter detalhes do commit', 'error');
    }
}

async function revertToCommit(hash) {
    if (!confirm(`Reverter para o commit ${hash.substring(0, 7)}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/history/revert/${hash}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Revertido com sucesso! Recarregando dados...', 'success');
            setTimeout(() => {
                location.reload();
            }, 2000);
        } else {
            showToast(data.message || 'Erro ao reverter', 'error');
        }
    } catch (error) {
        showToast('Erro ao reverter commit', 'error');
    }
}

// ==================== BACKUP ====================
async function loadBackupData() {
    try {
        const response = await fetch('/api/admin/backups');
        const data = await response.json();
        
        if (data.success) {
            updateBackupStats(data.backups);
            renderBackupTable(data.backups);
        }
    } catch (error) {
        showToast('Erro ao carregar backups', 'error');
    }
}

function updateBackupStats(backups) {
    const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
    const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    
    document.getElementById('backupCount').textContent = backups.length;
    document.getElementById('backupSize').textContent = `${sizeMB} MB`;
    document.getElementById('lastBackup').textContent = backups.length > 0 ? 
        new Date(backups[0].created).toLocaleDateString() : 'N/A';
}

function renderBackupTable(backups) {
    const tbody = document.getElementById('backupTableBody');
    tbody.innerHTML = '';
    
    backups.forEach(backup => {
        const sizeMB = (backup.size / (1024 * 1024)).toFixed(2);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${backup.filename}</td>
            <td>${sizeMB} MB</td>
            <td>${new Date(backup.created).toLocaleString()}</td>
            <td><span class="badge">${backup.type || 'unknown'}</span></td>
            <td>
                <button class="btn btn-sm btn-success" onclick="restoreBackup('${backup.filename}')">
                    <i class="fas fa-redo"></i> Restaurar
                </button>
                <button class="btn btn-sm btn-info" onclick="verifyBackup('${backup.filename}')">
                    <i class="fas fa-check"></i> Verificar
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteBackup('${backup.filename}')">
                    <i class="fas fa-trash"></i> Excluir
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function createManualBackup() {
    const description = prompt('Descrição do backup (opcional):') || '';
    
    try {
        const response = await fetch('/api/admin/backups/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            },
            body: JSON.stringify({ description })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Backup criado com sucesso!', 'success');
            loadBackupData();
        } else {
            showToast(data.message || 'Erro ao criar backup', 'error');
        }
    } catch (error) {
        showToast('Erro ao criar backup', 'error');
    }
}

async function restoreBackup(filename) {
    if (!confirm(`Restaurar backup ${filename}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/backups/restore/${filename}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Backup restaurado com sucesso! Recarregando...', 'success');
            setTimeout(() => {
                location.reload();
            }, 2000);
        } else {
            showToast(data.message || 'Erro ao restaurar backup', 'error');
        }
    } catch (error) {
        showToast('Erro ao restaurar backup', 'error');
    }
}

async function deleteBackup(filename) {
    if (!confirm(`Excluir backup ${filename}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/backups/${filename}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Backup excluído com sucesso!', 'success');
            loadBackupData();
        } else {
            showToast(data.message || 'Erro ao excluir backup', 'error');
        }
    } catch (error) {
        showToast('Erro ao excluir backup', 'error');
    }
}

async function verifyBackup(filename) {
    try {
        const response = await fetch(`/api/admin/backups/verify/${filename}`);
        const data = await response.json();
        
        if (data.success && data.valid) {
            showToast('Backup verificado com sucesso!', 'success');
        } else {
            showToast(`Backup inválido: ${data.message}`, 'error');
        }
    } catch (error) {
        showToast('Erro ao verificar backup', 'error');
    }
}

async function exportToJson() {
    try {
        const response = await fetch('/api/admin/backups/export');
        const data = await response.json();
        
        if (data.success) {
            showToast('Exportação criada com sucesso!', 'success');
            loadBackupData();
        }
    } catch (error) {
        showToast('Erro ao exportar dados', 'error');
    }
}

function showImportModal() {
    // Implementar modal de importação
    showToast('Funcionalidade em desenvolvimento', 'info');
}

// ==================== DEPLOY ====================
async function loadDeployData() {
    try {
        const response = await fetch('/api/deploy/status');
        const data = await response.json();
        
        if (data.success) {
            renderDeployStatus(data.status);
            renderDeployHistory(data.status.deployHistory || []);
        }
    } catch (error) {
        showToast('Erro ao carregar status do deploy', 'error');
    }
}

function renderDeployStatus(status) {
    const container = document.getElementById('deployStatus');
    
    let html = `
        <div class="status-item">
            <strong>Status:</strong> ${status.enabled ? 'Ativo' : 'Inativo'}
        </div>
        <div class="status-item">
            <strong>Branch:</strong> ${status.branch}
        </div>
        <div class="status-item">
            <strong>Último commit:</strong> ${status.git?.lastCommit || 'N/A'}
        </div>
        <div class="status-item">
            <strong>Serviço:</strong> ${status.pm2?.status || 'N/A'}
        </div>
        <div class="status-item">
            <strong>Atualizações:</strong> ${status.updatesAvailable ? 'Disponíveis' : 'Atualizado'}
        </div>
    `;
    
    container.innerHTML = html;
}

function renderDeployHistory(history) {
    const container = document.getElementById('deployHistory');
    container.innerHTML = '';
    
    if (!history || history.length === 0) {
        container.innerHTML = '<p class="text-center">Nenhum deploy registrado.</p>';
        return;
    }
    
    history.forEach(deploy => {
        const item = document.createElement('div');
        item.className = 'activity-item ' + (deploy.status === 'completed' ? 'success' : 'error');
        item.innerHTML = `
            <div class="activity-dot"></div>
            <div class="activity-content">
                <p><strong>${deploy.type} deploy</strong> - ${deploy.status}</p>
                <p><small>Por: ${deploy.user} - ${new Date(deploy.timestamp).toLocaleString()}</small></p>
                ${deploy.action ? `<p><small>Ação: ${deploy.action}</small></p>` : ''}
            </div>
        `;
        container.appendChild(item);
    });
}

async function deployManual() {
    if (!confirm('Iniciar deploy manual?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/deploy/manual', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            },
            body: JSON.stringify({ action: 'deploy' })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Deploy iniciado!', 'success');
            setTimeout(() => {
                loadDeployData();
            }, 5000);
        } else {
            showToast(data.message || 'Erro no deploy', 'error');
        }
    } catch (error) {
        showToast('Erro ao iniciar deploy', 'error');
    }
}

async function deployPull() {
    try {
        const response = await fetch('/api/deploy/manual', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            },
            body: JSON.stringify({ action: 'pull' })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Pull realizado!', 'success');
            loadDeployData();
        }
    } catch (error) {
        showToast('Erro ao fazer pull', 'error');
    }
}

async function deployRestart() {
    try {
        const response = await fetch('/api/deploy/manual', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            },
            body: JSON.stringify({ action: 'restart' })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Serviço reiniciado!', 'success');
        }
    } catch (error) {
        showToast('Erro ao reiniciar serviço', 'error');
    }
}

function showRollbackModal() {
    const commit = prompt('Hash do commit para rollback:');
    if (commit) {
        doRollback(commit);
    }
}

async function doRollback(commit) {
    if (!confirm(`Reverter para commit ${commit}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/deploy/rollback/${commit}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Rollback realizado!', 'success');
            setTimeout(() => {
                location.reload();
            }, 3000);
        } else {
            showToast(data.message || 'Erro no rollback', 'error');
        }
    } catch (error) {
        showToast('Erro no rollback', 'error');
    }
}

// ==================== UTILITÁRIOS ====================
function setUnsavedChanges(state) {
    unsavedChanges = state;
    if (state) {
        document.title = 'Nyumba Admin *';
    } else {
        document.title = 'Nyumba Admin';
    }
}

function getCsrfToken() {
    // O token CSRF deve ser armazenado em um meta tag ou cookie
    // Por enquanto, vamos buscar da sessão
    return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

function showLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) {
        el.classList.add('show');
        el.style.setProperty('display', 'flex', 'important');
        el.style.setProperty('pointer-events', 'auto', 'important');
    }
}

function hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) {
        el.classList.remove('show');
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
    }
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    const overlay = document.getElementById('modalOverlay');
    
    if (modal && overlay) {
        modal.classList.add('show');
        overlay.style.display = 'block';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    const overlay = document.getElementById('modalOverlay');
    
    if (modal && overlay) {
        modal.classList.remove('show');
        overlay.style.display = 'none';
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="toast-icon ${icons[type] || icons.info}"></i>
        <div class="toast-content">
            <p>${message}</p>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(toast);
    
    // Auto-remover após 5 segundos
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
}

// Fechar modais ao clicar fora
document.addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') {
        document.querySelectorAll('.modal.show').forEach(modal => {
            modal.classList.remove('show');
        });
        e.target.style.display = 'none';
    }
});

// Fechar toast ao clicar no botão de fechar
document.addEventListener('click', (e) => {
    if (e.target.closest('.toast-close')) {
        e.target.closest('.toast').remove();
    }
});

// ==================== FUNÇÕES AUXILIARES ==================== 
function createPreview() {
    window.open('/preview', '_blank');
}

function createBackup() {
    createManualBackup();
}

async function checkStatus() {
    try {
        const response = await fetch('/api/admin/status');
        const data = await response.json();
        if (data.success) {
            const uptime = Math.floor(data.status.system.uptime / 60);
            showToast(`Sistema OK! Uptime: ${uptime} minutos`, 'success');
        }
    } catch (error) {
        showToast('Erro ao verificar estado do sistema', 'error');
    }
}

function refreshPreview() {
    const frame = document.getElementById('previewFrame');
    const select = document.getElementById('previewType');
    if (frame && select) {
        frame.src = select.value + '?t=' + Date.now();
    }
}

function openPreviewInNewTab() {
    const select = document.getElementById('previewType');
    if (select) {
        window.open(select.value, '_blank');
    }
}

async function loadUsersData() {
    try {
        const response = await fetch('/api/auth/users');
        const data = await response.json();

        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!data.users || data.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum utilizador encontrado.</td></tr>';
            return;
        }

        data.users.forEach(user => {
            const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleString('pt') : 'Nunca';
            const roleLabels = { admin: 'Administrador', editor: 'Editor', viewer: 'Visualizador' };
            const statusBadge = user.active !== false
                ? '<span class="badge badge-success">Ativo</span>'
                : '<span class="badge badge-danger">Inativo</span>';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${user.username}</strong>${user.fullName ? `<br><small>${user.fullName}</small>` : ''}</td>
                <td>${user.email || '-'}</td>
                <td><span class="badge">${roleLabels[user.role] || user.role}</span></td>
                <td>${statusBadge}</td>
                <td><small>${lastLogin}</small></td>
                <td>
                    <button class="btn btn-sm btn-warning" onclick="resetUserPassword('${user.id || user.username}')">
                        <i class="fas fa-key"></i>
                    </button>
                    ${user.username !== currentUser?.username ? `
                    <button class="btn btn-sm btn-danger" onclick="deleteUser('${user.id || user.username}')">
                        <i class="fas fa-trash"></i>
                    </button>` : ''}
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        const tbody = document.getElementById('usersTableBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center">Erro ao carregar utilizadores.</td></tr>';
    }
}

function showCreateUserModal() {
    document.getElementById('newUserUsername').value = '';
    document.getElementById('newUserEmail').value = '';
    document.getElementById('newUserFullName').value = '';
    document.getElementById('newUserPassword').value = '';
    document.getElementById('newUserConfirmPassword').value = '';
    document.getElementById('newUserRole').value = 'editor';
    showModal('createUserModal');
}

async function createUser() {
    const username = document.getElementById('newUserUsername').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const fullName = document.getElementById('newUserFullName').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const confirmPassword = document.getElementById('newUserConfirmPassword').value;
    const role = document.getElementById('newUserRole').value;

    if (password !== confirmPassword) {
        showToast('As senhas não coincidem', 'error');
        return;
    }

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            },
            body: JSON.stringify({ username, email, fullName, password, confirmPassword, role })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Utilizador criado com sucesso!', 'success');
            closeModal('createUserModal');
            loadUsersData();
        } else {
            showToast(data.message || 'Erro ao criar utilizador', 'error');
        }
    } catch (error) {
        showToast('Erro ao criar utilizador', 'error');
    }
}

async function deleteUser(userId) {
    if (!confirm('Eliminar este utilizador?')) return;

    try {
        const response = await fetch(`/api/auth/users/${userId}`, {
            method: 'DELETE',
            headers: { 'X-CSRF-Token': getCsrfToken() }
        });
        const data = await response.json();

        if (data.success) {
            showToast('Utilizador eliminado!', 'success');
            loadUsersData();
        } else {
            showToast(data.message || 'Erro ao eliminar utilizador', 'error');
        }
    } catch (error) {
        showToast('Erro ao eliminar utilizador', 'error');
    }
}

async function resetUserPassword(userId) {
    const newPass = prompt('Nova senha para o utilizador (mínimo 8 caracteres):');
    if (!newPass || newPass.length < 8) {
        if (newPass !== null) showToast('Senha deve ter pelo menos 8 caracteres', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/auth/users/${userId}/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            },
            body: JSON.stringify({ newPassword: newPass })
        });
        const data = await response.json();

        if (data.success) {
            showToast('Senha reposta com sucesso!', 'success');
        } else {
            showToast(data.message || 'Erro ao repor senha', 'error');
        }
    } catch (error) {
        showToast('Erro ao repor senha', 'error');
    }
}

async function loadSystemInfo() {
    try {
        const response = await fetch('/api/admin/status');
        const data = await response.json();

        if (data.success) {
            const status = data.status;
            const uptime = Math.floor(status.system.uptime);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const memMB = Math.round(status.system.memory.heapUsed / 1024 / 1024);

            const sysElem = document.getElementById('systemInfo');
            if (sysElem) {
                sysElem.innerHTML = `
                    <div class="backup-stats" style="margin-bottom: 0;">
                        <div class="stat-item">
                            <i class="fas fa-clock" style="color: #3498db;"></i>
                            <div><h3>${hours}h ${minutes}m</h3><p>Uptime</p></div>
                        </div>
                        <div class="stat-item">
                            <i class="fas fa-memory" style="color: #2ecc71;"></i>
                            <div><h3>${memMB} MB</h3><p>Memória Usada</p></div>
                        </div>
                        <div class="stat-item">
                            <i class="fab fa-node-js" style="color: #68a063;"></i>
                            <div><h3>${status.system.nodeVersion}</h3><p>Node.js</p></div>
                        </div>
                    </div>
                `;
            }
        }
    } catch (error) {
        const sysElem = document.getElementById('systemInfo');
        if (sysElem) sysElem.innerHTML = '<p>Erro ao carregar informações do sistema.</p>';
    }
}

// ==================== PUBLICAR NO GITHUB ====================
async function publishToGitHub() {
    try {
        showLoading();
        const response = await fetch('/api/admin/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
            body: JSON.stringify({})
        });
        const result = await response.json();
        hideLoading();

        if (result.pushed) {
            showToast('✅ Publicado com sucesso no GitHub! O site será atualizado em breve.', 'success');
        } else if (result.success) {
            showToast('⚠️ Guardado localmente, mas o push falhou.', 'warning');
        } else {
            showToast('❌ Erro ao publicar', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Erro de ligação ao publicar no GitHub', 'error');
    }
}
