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

// Fazer login com API Token
async function fazerLogin(event) {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const token = document.getElementById('token').value.trim();
    const rememberMe = document.getElementById('rememberMe')?.checked || false;

    // Validar campos
    if (!email || !token) {
        mostrarStatus('❌ Por favor, preencha email e token', 'error');
        return;
    }

    // Validar formato de email
    if (!email.includes('@')) {
        mostrarStatus('❌ Email inválido', 'error');
        return;
    }

    mostrarStatus('⏳ Validando credenciais...', 'info');

    try {
        // Testar credenciais diretamente com Jira API
        const auth = btoa(email + ':' + token); // Base64 encode
        const response = await fetch('https://openfinancebrasil.atlassian.net/rest/api/3/myself', {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + auth,
                'Accept': 'application/json'
            }
        });

        if (response.ok) {
            const userData = await response.json();

            // Escolher storage baseado em "Lembrar-me"
            const storage = rememberMe ? localStorage : sessionStorage;

            // Salvar credenciais e informações do usuário
            storage.setItem('jiraEmail', email);
            storage.setItem('jiraToken', token);
            storage.setItem('isAuthenticated', 'true');
            storage.setItem('userName', userData.displayName || email);
            storage.setItem('userEmail', userData.emailAddress || email);
            storage.setItem('userAvatar', userData.avatarUrls?.['48x48'] || '');
            storage.setItem('authMethod', 'api-token');

            mostrarStatus('✅ Login realizado com sucesso! Redirecionando...', 'success');

            // Redirecionar para home
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);

        } else if (response.status === 401) {
            mostrarStatus('❌ Credenciais inválidas. Verifique seu email e token.', 'error');
        } else if (response.status === 403) {
            mostrarStatus('❌ Acesso negado. Verifique as permissões do token.', 'error');
        } else {
            mostrarStatus('❌ Erro ao conectar com Jira (Status: ' + response.status + ')', 'error');
        }

    } catch (error) {
        console.error('Erro ao fazer login:', error);

        // Erro de CORS ou rede
        if (error.message.includes('fetch')) {
            mostrarStatus('❌ Erro de conexão. Verifique sua internet ou use um proxy CORS.', 'error');
        } else {
            mostrarStatus('❌ Erro inesperado: ' + error.message, 'error');
        }
    }
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

// Como obter o API Token
function mostrarComoObterToken() {
    alert(`📝 COMO OBTER SEU API TOKEN DO JIRA:

1. Acesse: https://id.atlassian.com/manage-profile/security/api-tokens

2. Clique em "Create API token"

3. Dê um nome (ex: "Central de Serviços")

4. Copie o token gerado

5. Cole aqui no campo "API Token"

⚠️ IMPORTANTE:
- Guarde o token em local seguro
- Não compartilhe com outras pessoas
- O token tem as mesmas permissões da sua conta`);
}
