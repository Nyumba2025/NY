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
                <div class="prato-item-card" style="border: 1px solid rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin-bottom: 12px; background: rgba(0,0,0,0.2);">
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
            <h3><i class="fas fa-calendar-day"></i> ${daysMap[dayKey]}</h3>
            
            <div style="background: rgba(217, 108, 6, 0.05); padding: 12px; border-radius: 8px; margin-bottom: 15px; border: 1px solid rgba(217, 108, 6, 0.2);">
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

            <div style="background: rgba(255, 255, 255, 0.03); padding: 12px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);">
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
    actionsDiv.style.marginTop = '20px';
    actionsDiv.innerHTML = `
        <button type="button" class="btn btn-primary btn-lg" onclick="saveWeeklyMenuData(); return false;">
            <i class="fas fa-save"></i> Guardar Menu Semanal
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
        alacarteData = await response.json();
        renderAlacarteEditor();
    } catch (error) {
        console.error('Erro ao carregar menu à la carte:', error);
    }
}

function renderAlacarteEditor() {
    const container = document.getElementById('alacarte-menu-container');
    if (!container) return;
    container.innerHTML = '';

    const categoriesMap = {
        'appetizers': 'Petiscos (Appetizers)',
        'starter': 'Entradas / Sopas (Starters)',
        'snacks': 'Snacks',
        'sandwiches': 'No Pão (Sandwiches)',
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
                <div style="border: 1px solid rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin-bottom: 12px; background: rgba(0,0,0,0.2);">
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
            <h3><i class="fas fa-list"></i> ${categoriesMap[catKey]}</h3>
            ${itemsHtml || '<p style="opacity: 0.6; font-style: italic;">Nenhum item nesta categoria.</p>'}
            <button type="button" class="btn btn-outline btn-sm" onclick="addAlacarteItem('${catKey}'); return false;" style="margin-top: 5px;">
                <i class="fas fa-plus"></i> Adicionar Item a ${categoriesMap[catKey].split(' ')[0]}
            </button>
        `;

        container.appendChild(catCard);
    });

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'form-actions';
    actionsDiv.style.marginTop = '20px';
    actionsDiv.innerHTML = `
        <button type="button" class="btn btn-primary btn-lg" onclick="saveAlacarteData(); return false;">
            <i class="fas fa-save"></i> Guardar Menu À La Carte
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
        el.style.display = 'flex';
    }
}

function hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) {
        el.classList.remove('show');
        el.style.display = 'none';
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
        const response = await fetch('/api/admin/status');\r
        const data = await response.json();\r
\r
        if (data.success) {\r
            const status = data.status;\r
            const uptime = Math.floor(status.system.uptime);\r
            const hours = Math.floor(uptime / 3600);\r
            const minutes = Math.floor((uptime % 3600) / 60);\r
            const memMB = Math.round(status.system.memory.heapUsed / 1024 / 1024);\r
\r
            const sysElem = document.getElementById('systemInfo');\r
            if (sysElem) {\r
                sysElem.innerHTML = `\r
                    <div class="backup-stats" style="margin-bottom: 0;">\r
                        <div class="stat-item">\r
                            <i class="fas fa-clock" style="color: #3498db;"></i>\r
                            <div><h3>${hours}h ${minutes}m</h3><p>Uptime</p></div>\r
                        </div>\r
                        <div class="stat-item">\r
                            <i class="fas fa-memory" style="color: #2ecc71;"></i>\r
                            <div><h3>${memMB} MB</h3><p>Memória Usada</p></div>\r
                        </div>\r
                        <div class="stat-item">\r
                            <i class="fab fa-node-js" style="color: #68a063;"></i>\r
                            <div><h3>${status.system.nodeVersion}</h3><p>Node.js</p></div>\r
                        </div>\r
                    </div>\r
                `;\r
            }\r
        }\r
    } catch (error) {\r
        const sysElem = document.getElementById('systemInfo');\r
        if (sysElem) sysElem.innerHTML = '<p>Erro ao carregar informações do sistema.</p>';\r
    }\r
}\r
\r
// ==================== MENU SEMANAL ====================\r
let weeklyMenuData = {};\r
\r
async function loadWeeklyMenuData() {\r
    try {\r
        const response = await fetch('/api/admin/menu');\r
        if (!response.ok) throw new Error('Falha ao carregar');\r
        weeklyMenuData = await response.json();\r
        renderWeeklyMenuEditor();\r
    } catch (error) {\r
        console.error('Erro ao carregar menu semanal:', error);\r
        weeklyMenuData = {};\r
    }\r
}\r
\r
const DAYS = [\r
    { key: '1', pt: 'Segunda-feira', en: 'Monday' },\r
    { key: '2', pt: 'Terça-feira',   en: 'Tuesday' },\r
    { key: '3', pt: 'Quarta-feira',  en: 'Wednesday' },\r
    { key: '4', pt: 'Quinta-feira',  en: 'Thursday' },\r
    { key: '5', pt: 'Sexta-feira',   en: 'Friday' }\r
];\r
\r
function renderWeeklyMenuEditor() {\r
    const container = document.getElementById('weekly-menu-container');\r
    if (!container) return;\r
    container.innerHTML = '';\r
\r
    // Botões de guardar e publicar no topo\r
    const topActions = document.createElement('div');\r
    topActions.className = 'form-actions';\r
    topActions.style.cssText = 'margin-bottom:24px; display:flex; gap:12px; flex-wrap:wrap;';\r
    topActions.innerHTML = `\r
        <button class="btn btn-primary" onclick="saveWeeklyMenuData()">\r
            <i class="fas fa-save"></i> Guardar Menu Semanal\r
        </button>\r
        <button class="btn btn-success" onclick="publishToGitHub()" style="background:#27ae60;">\r
            <i class="fab fa-github"></i> Publicar no GitHub\r
        </button>\r
    `;\r
    container.appendChild(topActions);\r
\r
    DAYS.forEach(day => {\r
        const dayData = weeklyMenuData[day.key] || { sopa: {}, pratos: [], sobremesa: {} };\r
        if (!dayData.pratos) dayData.pratos = [];\r
        weeklyMenuData[day.key] = dayData;\r
\r
        const section = document.createElement('div');\r
        section.className = 'form-section';\r
        section.style.cssText = 'margin-bottom:24px; border:1px solid #eee; border-radius:8px; padding:20px;';\r
\r
        let pratosHtml = dayData.pratos.map((p, i) => `\r
            <div class="prato-item" id="prato-${day.key}-${i}" style="border:1px dashed #ccc; border-radius:6px; padding:12px; margin-bottom:10px; background:#fafafa;">\r
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">\r
                    <strong style="color:#555;">Prato ${i + 1}</strong>\r
                    <button class="btn btn-danger" style="padding:4px 10px; font-size:12px;" onclick="removePrato('${day.key}', ${i})">\r
                        <i class="fas fa-trash"></i> Remover\r
                    </button>\r
                </div>\r
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">\r
                    <div class="form-group" style="margin:0;">\r
                        <label style="font-size:12px;">Nome (PT)</label>\r
                        <input type="text" class="form-control" id="prato-${day.key}-${i}-pt" value="${p.pt || ''}" placeholder="Nome em português">\r
                    </div>\r
                    <div class="form-group" style="margin:0;">\r
                        <label style="font-size:12px;">Nome (EN)</label>\r
                        <input type="text" class="form-control" id="prato-${day.key}-${i}-en" value="${p.en || ''}" placeholder="Name in English">\r
                    </div>\r
                    <div class="form-group" style="margin:0;">\r
                        <label style="font-size:12px;">Descrição (PT)</label>\r
                        <input type="text" class="form-control" id="prato-${day.key}-${i}-d_pt" value="${p.d_pt || ''}" placeholder="Descrição PT">\r
                    </div>\r
                    <div class="form-group" style="margin:0;">\r
                        <label style="font-size:12px;">Descrição (EN)</label>\r
                        <input type="text" class="form-control" id="prato-${day.key}-${i}-d_en" value="${p.d_en || ''}" placeholder="Description EN">\r
                    </div>\r
                    <div class="form-group" style="margin:0;">\r
                        <label style="font-size:12px;">Preço (MT)</label>\r
                        <input type="text" class="form-control" id="prato-${day.key}-${i}-p" value="${p.p || ''}" placeholder="Ex: 500MT">\r
                    </div>\r
                </div>\r
            </div>\r
        `).join('');\r
\r
        section.innerHTML = `\r
            <h3 style="color:#e67e22; margin-bottom:16px;"><i class="fas fa-calendar-day"></i> ${day.pt}</h3>\r
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:16px;">\r
                <div class="form-group" style="margin:0;">\r
                    <label><i class="fas fa-soup"></i> Sopa (PT)</label>\r
                    <input type="text" class="form-control" id="sopa-${day.key}-pt" value="${dayData.sopa?.pt || ''}" placeholder="Nome da sopa PT">\r
                </div>\r
                <div class="form-group" style="margin:0;">\r
                    <label><i class="fas fa-soup"></i> Sopa (EN)</label>\r
                    <input type="text" class="form-control" id="sopa-${day.key}-en" value="${dayData.sopa?.en || ''}" placeholder="Soup name EN">\r
                </div>\r
                <div class="form-group" style="margin:0;">\r
                    <label>Preço Sopa (MT)</label>\r
                    <input type="text" class="form-control" id="sopa-${day.key}-p" value="${dayData.sopa?.p || ''}" placeholder="Ex: 180MT">\r
                </div>\r
            </div>\r
\r
            <h4 style="margin-bottom:10px; color:#555;">Pratos Principais</h4>\r
            <div id="pratos-container-${day.key}">${pratosHtml}</div>\r
            <button class="btn btn-outline" style="margin-bottom:16px;" onclick="addPrato('${day.key}')">\r
                <i class="fas fa-plus"></i> Adicionar Prato\r
            </button>\r
\r
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">\r
                <div class="form-group" style="margin:0;">\r
                    <label><i class="fas fa-ice-cream"></i> Sobremesa (PT)</label>\r
                    <input type="text" class="form-control" id="sobremesa-${day.key}-pt" value="${dayData.sobremesa?.pt || ''}" placeholder="Nome PT">\r
                </div>\r
                <div class="form-group" style="margin:0;">\r
                    <label><i class="fas fa-ice-cream"></i> Sobremesa (EN)</label>\r
                    <input type="text" class="form-control" id="sobremesa-${day.key}-en" value="${dayData.sobremesa?.en || ''}" placeholder="Name EN">\r
                </div>\r
                <div class="form-group" style="margin:0;">\r
                    <label>Preço Sobremesa (MT)</label>\r
                    <input type="text" class="form-control" id="sobremesa-${day.key}-p" value="${dayData.sobremesa?.p || ''}" placeholder="Ex: 150MT">\r
                </div>\r
            </div>\r
        `;\r
        container.appendChild(section);\r
    });\r
\r
    // Botão de guardar no fundo também\r
    const bottomActions = document.createElement('div');\r
    bottomActions.className = 'form-actions';\r
    bottomActions.style.cssText = 'margin-top:16px; display:flex; gap:12px; flex-wrap:wrap;';\r
    bottomActions.innerHTML = `\r
        <button class="btn btn-primary" onclick="saveWeeklyMenuData()">\r
            <i class="fas fa-save"></i> Guardar Menu Semanal\r
        </button>\r
        <button class="btn btn-success" onclick="publishToGitHub()" style="background:#27ae60;">\r
            <i class="fab fa-github"></i> Publicar no GitHub\r
        </button>\r
    `;\r
    container.appendChild(bottomActions);\r
}\r
\r
function addPrato(dayKey) {\r
    if (!weeklyMenuData[dayKey]) weeklyMenuData[dayKey] = { sopa: {}, pratos: [], sobremesa: {} };\r
    if (!weeklyMenuData[dayKey].pratos) weeklyMenuData[dayKey].pratos = [];\r
    weeklyMenuData[dayKey].pratos.push({ pt: '', en: '', d_pt: '', d_en: '', p: '' });\r
    renderWeeklyMenuEditor();\r
}\r
\r
function removePrato(dayKey, index) {\r
    if (!confirm('Remover este prato?')) return;\r
    weeklyMenuData[dayKey].pratos.splice(index, 1);\r
    renderWeeklyMenuEditor();\r
}\r
\r
function collectWeeklyMenuFromForm() {\r
    const data = {};\r
    DAYS.forEach(day => {\r
        const pratos = [];\r
        const count = weeklyMenuData[day.key]?.pratos?.length || 0;\r
        for (let i = 0; i < count; i++) {\r
            pratos.push({\r
                pt:   (document.getElementById(`prato-${day.key}-${i}-pt`)?.value || '').trim(),\r
                en:   (document.getElementById(`prato-${day.key}-${i}-en`)?.value || '').trim(),\r
                d_pt: (document.getElementById(`prato-${day.key}-${i}-d_pt`)?.value || '').trim(),\r
                d_en: (document.getElementById(`prato-${day.key}-${i}-d_en`)?.value || '').trim(),\r
                p:    (document.getElementById(`prato-${day.key}-${i}-p`)?.value || '').trim()\r
            });\r
        }\r
        data[day.key] = {\r
            pt: day.pt.split('-')[0].trim(),\r
            en: day.en,\r
            sopa: {\r
                pt: (document.getElementById(`sopa-${day.key}-pt`)?.value || '').trim(),\r
                en: (document.getElementById(`sopa-${day.key}-en`)?.value || '').trim(),\r
                p:  (document.getElementById(`sopa-${day.key}-p`)?.value || '').trim()\r
            },\r
            pratos,\r
            sobremesa: {\r
                pt: (document.getElementById(`sobremesa-${day.key}-pt`)?.value || '').trim(),\r
                en: (document.getElementById(`sobremesa-${day.key}-en`)?.value || '').trim(),\r
                p:  (document.getElementById(`sobremesa-${day.key}-p`)?.value || '').trim()\r
            }\r
        };\r
    });\r
    return data;\r
}\r
\r
async function saveWeeklyMenuData() {\r
    try {\r
        showLoading();\r
        const data = collectWeeklyMenuFromForm();\r
        weeklyMenuData = data;\r
\r
        const response = await fetch('/api/admin/menu', {\r
            method: 'POST',\r
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },\r
            body: JSON.stringify(data)\r
        });\r
        const result = await response.json();\r
        hideLoading();\r
\r
        if (result.success) {\r
            const pushed = result.gitResult?.pushed;\r
            showToast(pushed\r
                ? '✅ Menu Semanal guardado e publicado no GitHub!'\r
                : '💾 Menu Semanal guardado localmente. Push pendente.',\r
                pushed ? 'success' : 'warning');\r
        } else {\r
            showToast(result.error || 'Erro ao guardar menu semanal', 'error');\r
        }\r
    } catch (error) {\r
        hideLoading();\r
        showToast('Erro de ligação ao guardar menu semanal', 'error');\r
        console.error(error);\r
    }\r
}\r
\r
// ==================== MENU À LA CARTE ====================\r
let alacarteData = {};\r
\r
const ALACARTE_CATEGORIES = [\r
    { key: 'appetizers', label: 'Petiscos',           icon: 'fas fa-drumstick-bite' },\r
    { key: 'starter',    label: 'Entradas / Sopas',   icon: 'fas fa-soup' },\r
    { key: 'snacks',     label: 'Snacks',              icon: 'fas fa-cookie-bite' },\r
    { key: 'sandwiches', label: 'No Pão (Burgers & Tostas)', icon: 'fas fa-hamburger' },\r
    { key: 'plates',     label: 'No Prato',            icon: 'fas fa-concierge-bell' },\r
    { key: 'dessert',    label: 'Sobremesas',          icon: 'fas fa-ice-cream' }\r
];\r
\r
async function loadAlacarteData() {\r
    try {\r
        const response = await fetch('/api/admin/alacarte');\r
        if (!response.ok) throw new Error('Falha ao carregar');\r
        alacarteData = await response.json();\r
        renderAlacarteEditor();\r
    } catch (error) {\r
        console.error('Erro ao carregar à la carte:', error);\r
        alacarteData = {};\r
    }\r
}\r
\r
function renderAlacarteEditor() {\r
    const container = document.getElementById('alacarte-menu-container');\r
    if (!container) return;\r
    container.innerHTML = '';\r
\r
    const topActions = document.createElement('div');\r
    topActions.className = 'form-actions';\r
    topActions.style.cssText = 'margin-bottom:24px; display:flex; gap:12px; flex-wrap:wrap;';\r
    topActions.innerHTML = `\r
        <button class="btn btn-primary" onclick="saveAlacarteData()">\r
            <i class="fas fa-save"></i> Guardar À La Carte\r
        </button>\r
        <button class="btn btn-success" onclick="publishToGitHub()" style="background:#27ae60;">\r
            <i class="fab fa-github"></i> Publicar no GitHub\r
        </button>\r
    `;\r
    container.appendChild(topActions);\r
\r
    ALACARTE_CATEGORIES.forEach(cat => {\r
        if (!alacarteData[cat.key]) alacarteData[cat.key] = [];\r
        const items = alacarteData[cat.key];\r
\r
        const section = document.createElement('div');\r
        section.className = 'form-section';\r
        section.style.cssText = 'margin-bottom:24px; border:1px solid #eee; border-radius:8px; padding:20px;';\r
\r
        let itemsHtml = items.map((item, i) => `\r
            <div id="alacarte-${cat.key}-${i}" style="border:1px dashed #ccc; border-radius:6px; padding:12px; margin-bottom:10px; background:#fafafa;">\r
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">\r
                    <strong style="color:#555;">Item ${i + 1}: ${item.pt || ''}</strong>\r
                    <button class="btn btn-danger" style="padding:4px 10px; font-size:12px;" onclick="removeAlacarteItem('${cat.key}', ${i})">\r
                        <i class="fas fa-trash"></i> Remover\r
                    </button>\r
                </div>\r
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">\r
                    <div class="form-group" style="margin:0;">\r
                        <label style="font-size:12px;">Nome (PT)</label>\r
                        <input type="text" class="form-control" id="ac-${cat.key}-${i}-pt" value="${item.pt || ''}">\r
                    </div>\r
                    <div class="form-group" style="margin:0;">\r
                        <label style="font-size:12px;">Nome (EN)</label>\r
                        <input type="text" class="form-control" id="ac-${cat.key}-${i}-en" value="${item.en || ''}">\r
                    </div>\r
                    <div class="form-group" style="margin:0;">\r
                        <label style="font-size:12px;">Preço (MT)</label>\r
                        <input type="text" class="form-control" id="ac-${cat.key}-${i}-p" value="${item.p || ''}">\r
                    </div>\r
                    <div class="form-group" style="margin:0; grid-column:span 1.5;">\r
                        <label style="font-size:12px;">Descrição (PT)</label>\r
                        <input type="text" class="form-control" id="ac-${cat.key}-${i}-d_pt" value="${item.d_pt || ''}">\r
                    </div>\r
                    <div class="form-group" style="margin:0;">\r
                        <label style="font-size:12px;">Descrição (EN)</label>\r
                        <input type="text" class="form-control" id="ac-${cat.key}-${i}-d_en" value="${item.d_en || ''}">\r
                    </div>\r
                </div>\r
            </div>\r
        `).join('');\r
\r
        section.innerHTML = `\r
            <h3 style="color:#8e44ad; margin-bottom:16px;"><i class="${cat.icon}"></i> ${cat.label}</h3>\r
            <div id="ac-items-${cat.key}">${itemsHtml}</div>\r
            <button class="btn btn-outline" onclick="addAlacarteItem('${cat.key}')">\r
                <i class="fas fa-plus"></i> Adicionar Item\r
            </button>\r
        `;\r
        container.appendChild(section);\r
    });\r
\r
    const bottomActions = document.createElement('div');\r
    bottomActions.className = 'form-actions';\r
    bottomActions.style.cssText = 'margin-top:16px; display:flex; gap:12px; flex-wrap:wrap;';\r
    bottomActions.innerHTML = `\r
        <button class="btn btn-primary" onclick="saveAlacarteData()">\r
            <i class="fas fa-save"></i> Guardar À La Carte\r
        </button>\r
        <button class="btn btn-success" onclick="publishToGitHub()" style="background:#27ae60;">\r
            <i class="fab fa-github"></i> Publicar no GitHub\r
        </button>\r
    `;\r
    container.appendChild(bottomActions);\r
}\r
\r
function addAlacarteItem(catKey) {\r
    if (!alacarteData[catKey]) alacarteData[catKey] = [];\r
    alacarteData[catKey].push({ pt: '', en: '', d_pt: '', d_en: '', p: '' });\r
    renderAlacarteEditor();\r
}\r
\r
function removeAlacarteItem(catKey, index) {\r
    if (!confirm('Remover este item?')) return;\r
    alacarteData[catKey].splice(index, 1);\r
    renderAlacarteEditor();\r
}\r
\r
function collectAlacarteFromForm() {\r
    const data = {};\r
    ALACARTE_CATEGORIES.forEach(cat => {\r
        const items = alacarteData[cat.key] || [];\r
        data[cat.key] = items.map((_, i) => ({\r
            pt:   (document.getElementById(`ac-${cat.key}-${i}-pt`)?.value || '').trim(),\r
            en:   (document.getElementById(`ac-${cat.key}-${i}-en`)?.value || '').trim(),\r
            p:    (document.getElementById(`ac-${cat.key}-${i}-p`)?.value || '').trim(),\r
            d_pt: (document.getElementById(`ac-${cat.key}-${i}-d_pt`)?.value || '').trim(),\r
            d_en: (document.getElementById(`ac-${cat.key}-${i}-d_en`)?.value || '').trim()\r
        }));\r
    });\r
    return data;\r
}\r
\r
async function saveAlacarteData() {\r
    try {\r
        showLoading();\r
        const data = collectAlacarteFromForm();\r
        alacarteData = data;\r
\r
        const response = await fetch('/api/admin/alacarte', {\r
            method: 'POST',\r
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },\r
            body: JSON.stringify(data)\r
        });\r
        const result = await response.json();\r
        hideLoading();\r
\r
        if (result.success) {\r
            const pushed = result.gitResult?.pushed;\r
            showToast(pushed\r
                ? '✅ Menu À La Carte guardado e publicado no GitHub!'\r
                : '💾 Menu À La Carte guardado localmente. Push pendente.',\r
                pushed ? 'success' : 'warning');\r
        } else {\r
            showToast(result.error || 'Erro ao guardar à la carte', 'error');\r
        }\r
    } catch (error) {\r
        hideLoading();\r
        showToast('Erro de ligação ao guardar à la carte', 'error');\r
        console.error(error);\r
    }\r
}\r
\r
// ==================== PUBLICAR NO GITHUB ====================\r
async function publishToGitHub() {\r
    try {\r
        showLoading();\r
        const response = await fetch('/api/admin/publish', {\r
            method: 'POST',\r
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },\r
            body: JSON.stringify({})\r
        });\r
        const result = await response.json();\r
        hideLoading();\r
\r
        if (result.pushed) {\r
            showToast('✅ Publicado com sucesso no GitHub! O site será atualizado em breve.', 'success');\r
        } else if (result.success) {\r
            showToast('⚠️ Guardado localmente, mas o push falhou. Verifique as credenciais do GitHub.', 'warning');\r
            if (result.gitResult?.error) {\r
                console.warn('Erro git push:', result.gitResult.error);\r
            }\r
        } else {\r
            showToast('❌ Erro ao publicar: ' + (result.error || 'Verifique os logs do servidor'), 'error');\r
        }\r
    } catch (error) {\r
        hideLoading();\r
        showToast('Erro de ligação ao publicar no GitHub', 'error');\r
        console.error(error);\r
    }\r
}