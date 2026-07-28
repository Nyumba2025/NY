document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const alertsDiv = document.getElementById('loginAlerts');
            
            // Limpar alertas anteriores
            alertsDiv.innerHTML = '';
            
            try {
                // 1. Obter o token CSRF
                const csrfResponse = await fetch('/api/auth/csrf-token');
                const csrfData = await csrfResponse.json();
                
                if (!csrfData.success) {
                    throw new Error('Falha ao obter token CSRF');
                }
                
                const csrfToken = csrfData.csrfToken;
                
                // 2. Efetuar o login
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-csrf-token': csrfToken
                    },
                    body: JSON.stringify({ username, password })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Redirecionar para o painel administrativo
                    window.location.href = '/admin';
                } else {
                    alertsDiv.innerHTML = `
                        <div style="background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; padding: 12px; border-radius: 4px; margin-bottom: 20px; font-size: 14px;">
                            <i class="fas fa-exclamation-circle" style="margin-right: 5px;"></i> ${data.message || 'Erro ao efetuar login'}
                        </div>
                    `;
                }
            } catch (error) {
                console.error('Erro no login:', error);
                alertsDiv.innerHTML = `
                    <div style="background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; padding: 12px; border-radius: 4px; margin-bottom: 20px; font-size: 14px;">
                        <i class="fas fa-exclamation-circle" style="margin-right: 5px;"></i> Erro ao ligar ao servidor. Por favor, tente mais tarde.
                    </div>
                `;
            }
        });
    }
});
