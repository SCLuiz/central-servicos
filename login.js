// URL do backend no Render
const BACKEND_URL = 'https://central-servicos-ly4z.onrender.com';

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

// Fazer login
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
        // Validar credenciais via backend
        const response = await fetch(`${BACKEND_URL}/api/validate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                token: token
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            const userData = data.user;

            // Escolher storage baseado em "Lembrar-me"
            const storage = rememberMe ? localStorage : sessionStorage;

            // Salvar credenciais e informações do usuário
            storage.setItem('jiraEmail', email);
            storage.setItem('jiraToken', token);
            storage.setItem('isAuthenticated', 'true');
            storage.setItem('userName', userData.displayName || email);
            storage.setItem('userEmail', userData.emailAddress || email);
            storage.setItem('userAvatar', userData.avatarUrl || '');
            storage.setItem('authMethod', 'api-token');

            mostrarStatus('✅ Login realizado com sucesso! Redirecionando...', 'success');

            // Redirecionar para home
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);

        } else if (response.status === 401) {
            mostrarStatus('❌ Credenciais inválidas. Verifique seu email e token.', 'error');
        } else {
            mostrarStatus('❌ Erro ao conectar: ' + (data.error || 'Erro desconhecido'), 'error');
        }

    } catch (error) {
        console.error('Erro ao fazer login:', error);
        mostrarStatus('❌ Erro de conexão. Verifique sua internet.', 'error');
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
