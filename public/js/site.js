// site.js - Lógica do site principal

// Dados iniciais (serão substituídos pelos dados carregados)
let siteData = {
    home: {
        hero: {
            title: "Bem-vindo ao Nyumba",
            subtitle: "Autêntica cozinha moçambicana em Lisboa",
            buttonText: "Ver Menu"
        },
        about: {
            title: "A Nossa História",
            description: "O Nyumba nasceu da paixão pela culinária tradicional moçambicana. Com mais de 10 anos de experiência, trazemos até si os sabores e aromas da nossa terra, preparados com ingredientes frescos e muito carinho."
        },
        services: [
            {
                title: "Comida Tradicional",
                description: "Pratos autênticos preparados com ingredientes frescos e receitas transmitidas de geração em geração."
            },
            {
                title: "Ambiente Acolhedor",
                description: "Um espaço familiar e confortável, perfeito para refeições em família, encontros com amigos ou eventos especiais."
            },
            {
                title: "Takeaway & Delivery",
                description: "Leve o sabor do Nyumba para casa. Entregamos em toda a área de Lisboa."
            }
        ],
        footer: {
            copyright: "© 2024 Restaurante Nyumba. Todos os direitos reservados.",
            contact: "Contacte-nos: +351 123 456 789 | info@nyumba.com | Rua da Moçambique, 123, Lisboa"
        }
    },
    gallery: [],
    menu: []
};

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    await loadSiteData();
    renderSite();
    setupEventListeners();
});

// Carregar dados do site
async function loadSiteData() {
    try {
        // Tenta carregar os dados dos arquivos JS gerados pelo admin
        if (typeof homeData !== 'undefined') {
            siteData.home = homeData;
        }
        if (typeof galleryItems !== 'undefined') {
            siteData.gallery = galleryItems;
        }
        if (typeof menuItems !== 'undefined') {
            siteData.menu = menuItems;
        }
        
        console.log('Dados do site carregados:', siteData);
    } catch (error) {
        console.error('Erro ao carregar dados do site:', error);
    }
}

// Renderizar site com os dados carregados
function renderSite() {
    renderHero();
    renderAbout();
    renderServices();
    renderGallery();
    renderMenu();
    renderFooter();
}

// Renderizar hero section
function renderHero() {
    const hero = siteData.home.hero;
    if (hero) {
        if (hero.title) document.getElementById('heroTitle').textContent = hero.title;
        if (hero.subtitle) document.getElementById('heroSubtitle').textContent = hero.subtitle;
        if (hero.buttonText) document.getElementById('heroButton').textContent = hero.buttonText;
    }
}

// Renderizar about section
function renderAbout() {
    const about = siteData.home.about;
    if (about) {
        if (about.title) document.getElementById('aboutTitle').textContent = about.title;
        if (about.description) document.getElementById('aboutDescription').textContent = about.description;
    }
}

// Renderizar serviços
function renderServices() {
    const servicesContainer = document.getElementById('servicesContainer');
    const services = siteData.home.services || [];
    
    servicesContainer.innerHTML = '';
    
    services.forEach(service => {
        const serviceCard = document.createElement('div');
        serviceCard.className = 'service-card';
        serviceCard.innerHTML = `
            <div class="service-icon">
                <i class="fas fa-concierge-bell"></i>
            </div>
            <h3>${service.title || 'Serviço'}</h3>
            <p>${service.description || 'Descrição do serviço.'}</p>
        `;
        servicesContainer.appendChild(serviceCard);
    });
}

// Renderizar galeria
function renderGallery() {
    const galleryContainer = document.getElementById('galleryContainer');
    const gallery = siteData.gallery || [];
    
    galleryContainer.innerHTML = '';
    
    gallery.forEach((item, index) => {
        const galleryItem = document.createElement('div');
        galleryItem.className = 'gallery-item';
        galleryItem.innerHTML = `
            <img src="${item.src || 'images/default.jpg'}" alt="${item.caption || 'Imagem'}" loading="lazy">
            <div class="gallery-overlay">
                <p>${item.caption || 'Legenda da imagem'}</p>
            </div>
        `;
        galleryContainer.appendChild(galleryItem);
    });
}

// Renderizar menu
function renderMenu() {
    const menuCategories = document.getElementById('menuCategories');
    const menuItemsContainer = document.getElementById('menuItemsContainer');
    const menu = siteData.menu || [];
    
    // Limpar containers
    menuCategories.innerHTML = '';
    menuItemsContainer.innerHTML = '';
    
    // Se não houver categorias, mostrar mensagem
    if (menu.length === 0) {
        menuItemsContainer.innerHTML = `
            <div class="no-menu" style="text-align: center; padding: 40px; color: #777;">
                <i class="fas fa-utensils" style="font-size: 3rem; margin-bottom: 20px;"></i>
                <h3>Menu em atualização</h3>
                <p>O nosso menu está a ser atualizado. Volte em breve!</p>
            </div>
        `;
        return;
    }
    
    // Criar botões de categorias
    menu.forEach((category, index) => {
        const categoryBtn = document.createElement('button');
        categoryBtn.className = `category-btn ${index === 0 ? 'active' : ''}`;
        categoryBtn.textContent = category.name || `Categoria ${index + 1}`;
        categoryBtn.dataset.categoryIndex = index;
        categoryBtn.addEventListener('click', () => showMenuCategory(index));
        menuCategories.appendChild(categoryBtn);
    });
    
    // Criar containers para itens de cada categoria
    menu.forEach((category, index) => {
        const categoryContainer = document.createElement('div');
        categoryContainer.className = `menu-items ${index === 0 ? 'active' : ''}`;
        categoryContainer.id = `menu-category-${index}`;
        categoryContainer.innerHTML = `
            <h3 style="text-align: center; margin-bottom: 30px; color: #ff7c00;">${category.name || `Categoria ${index + 1}`}</h3>
            <div class="menu-items-grid" id="menu-items-${index}"></div>
        `;
        menuItemsContainer.appendChild(categoryContainer);
        
        // Renderizar itens desta categoria
        renderMenuItems(index, category.items || []);
    });
}

// Renderizar itens de uma categoria do menu
function renderMenuItems(categoryIndex, items) {
    const itemsContainer = document.getElementById(`menu-items-${categoryIndex}`);
    
    if (!itemsContainer) return;
    
    itemsContainer.innerHTML = '';
    
    if (items.length === 0) {
        itemsContainer.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #777;">
                <p>Não há itens nesta categoria.</p>
            </div>
        `;
        return;
    }
    
    items.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'menu-item';
        menuItem.innerHTML = `
            <div class="menu-item-image">
                <img src="${item.image || 'images/menu-default.jpg'}" alt="${item.name || 'Item do menu'}">
            </div>
            <div class="menu-item-content">
                <div class="menu-item-header">
                    <h4>${item.name || 'Item do Menu'}</h4>
                    <span class="menu-item-price">${formatPrice(item.price)}</span>
                </div>
                <p>${item.description || 'Descrição do item.'}</p>
            </div>
        `;
        itemsContainer.appendChild(menuItem);
    });
}

// Mostrar uma categoria específica do menu
function showMenuCategory(index) {
    // Atualizar botões ativos
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.category-btn[data-category-index="${index}"]`).classList.add('active');
    
    // Mostrar categoria selecionada
    document.querySelectorAll('.menu-items').forEach(container => {
        container.classList.remove('active');
    });
    document.getElementById(`menu-category-${index}`).classList.add('active');
}

// Renderizar footer
function renderFooter() {
    const footer = siteData.home.footer;
    if (footer) {
        if (footer.copyright) document.getElementById('footerCopyright').textContent = footer.copyright;
        if (footer.contact) document.getElementById('footerContact').textContent = footer.contact;
    }
}

// Formatar preço
function formatPrice(price) {
    if (!price) return '€ --';
    return `€ ${parseFloat(price).toFixed(2)}`;
}

// Configurar event listeners
function setupEventListeners() {
    // Navegação suave
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Menu mobile
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mainNav = document.getElementById('mainNav');
    
    if (mobileMenuBtn && mainNav) {
        mobileMenuBtn.addEventListener('click', function() {
            mainNav.classList.toggle('active');
            this.innerHTML = mainNav.classList.contains('active') 
                ? '<i class="fas fa-times"></i>' 
                : '<i class="fas fa-bars"></i>';
        });
    }
    
    // Header scroll effect
    window.addEventListener('scroll', function() {
        const header = document.getElementById('mainHeader');
        if (header) {
            if (window.scrollY > 100) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        }
    });
    
    // Form submission
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Simular envio
            alert('Obrigado pela sua mensagem! Entraremos em contacto em breve.');
            this.reset();
        });
    }
}

// Verificar se está em modo preview
const urlParams = new URLSearchParams(window.location.search);
const isPreview = urlParams.has('preview');

if (isPreview) {
    // No modo preview, podemos adicionar funcionalidades extras
    console.log('Modo preview ativado');
    
    // Adicionar botões de edição em tempo real (simplificado)
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('editable')) {
            const element = e.target;
            const currentText = element.textContent;
            const newText = prompt('Editar texto:', currentText);
            
            if (newText !== null && newText !== currentText) {
                element.textContent = newText;
                // Em produção, enviaria a alteração para o servidor
            }
        }
    });
    
    // Marcar elementos editáveis
    setTimeout(() => {
        const editableElements = [
            'heroTitle', 'heroSubtitle', 'aboutTitle', 'aboutDescription',
            'footerCopyright', 'footerContact'
        ];
        
        editableElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.classList.add('editable');
                element.style.cursor = 'pointer';
                element.title = 'Clique para editar (modo preview)';
            }
        });
    }, 1000);
}