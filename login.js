// Verificar se já está logado
window.addEventListener('DOMContentLoaded', () => {
    const isLoggedIn = localStorage.getItem('isAuthenticated') === 'true' ||
                       sessionStorage.getItem('isAuthenticated') === 'true';

    if (isLoggedIn) {
        // Já está logado, redirecionar
        mostrarStatus('✅ Você já está autenticado! Redirecionando...', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
    }
});

// Fazer login com OAuth 2.0
function fazerLogin(event) {
    event.preventDefault();

    const rememberMe = document.getElementById('rememberMe')?.checked || false;

    // Gerar state para segurança (CSRF protection)
    const state = generateRandomString(32);
    sessionStorage.setItem('oauth_state', state);
    sessionStorage.setItem('oauth_remember', rememberMe);

    // Construir URL de autorização
    const params = new URLSearchParams({
        audience: OAUTH_CONFIG.audience,
        client_id: OAUTH_CONFIG.clientId,
        scope: OAUTH_CONFIG.scope,
        redirect_uri: OAUTH_CONFIG.redirectUri,
        state: state,
        response_type: 'code',
        prompt: OAUTH_CONFIG.prompt
    });

    const authUrl = `${OAUTH_CONFIG.authorizationUrl}?${params.toString()}`;

    // Redirecionar para a página de autorização do Atlassian
    window.location.href = authUrl;
}

// Gerar string aleatória para state
function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Mostrar status
function mostrarStatus(mensagem, tipo) {
    const statusDiv = document.getElementById('status');
    if (!statusDiv) return;

    statusDiv.innerHTML = mensagem;
    statusDiv.className = 'status ' + tipo;
    statusDiv.style.display = 'block';

    // Scroll suave até o status
    statusDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
