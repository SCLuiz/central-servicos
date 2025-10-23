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

// Fazer login simples (sem validação de credenciais)
function fazerLogin(event) {
    event.preventDefault();

    const email = document.getElementById('email')?.value?.trim() || '';
    const rememberMe = document.getElementById('rememberMe')?.checked || false;

    // Validar email
    if (!email) {
        mostrarStatus('❌ Por favor, preencha o email', 'error');
        return;
    }

    if (!email.includes('@')) {
        mostrarStatus('❌ Email inválido', 'error');
        return;
    }

    mostrarStatus('⏳ Entrando...', 'info');

    // Escolher storage baseado em "Lembrar-me"
    const storage = rememberMe ? localStorage : sessionStorage;

    // Salvar informações básicas
    storage.setItem('isAuthenticated', 'true');
    storage.setItem('userEmail', email);
    storage.setItem('userName', email.split('@')[0]);
    storage.setItem('authMethod', 'simple');

    mostrarStatus('✅ Login realizado com sucesso! Redirecionando...', 'success');

    // Redirecionar para home
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
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
