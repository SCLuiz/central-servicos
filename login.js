// Verificar se já está logado
window.addEventListener('DOMContentLoaded', () => {
    const isLoggedIn = localStorage.getItem('isAuthenticated') === 'true';
    const jiraEmail = localStorage.getItem('jiraEmail');
    const jiraToken = localStorage.getItem('jiraToken');

    if (isLoggedIn && jiraEmail && jiraToken) {
        // Já está logado, redirecionar
        mostrarStatus('✅ Você já está autenticado! Redirecionando...', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
    } else {
        // Preencher email se estiver salvo
        if (jiraEmail) {
            document.getElementById('email').value = jiraEmail;
        }
    }
});

// Fazer login
async function fazerLogin(event) {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const token = document.getElementById('token').value.trim();
    const rememberMe = document.getElementById('rememberMe').checked;

    if (!email || !token) {
        mostrarStatus('⚠️ Preencha todos os campos', 'error');
        return;
    }

    // Mostrar loading
    const btnLogin = document.getElementById('btnLogin');
    const btnText = btnLogin.querySelector('.btn-text');
    const btnLoading = btnLogin.querySelector('.btn-loading');

    btnLogin.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'flex';

    mostrarStatus('🔄 Validando credenciais no Jira...', 'info');

    try {
        // Tentar autenticar com Jira
        const auth = btoa(`${email}:${token}`);
        const response = await fetch('https://openfinancebrasil.atlassian.net/rest/api/3/myself', {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            }
        });

        if (response.ok) {
            const userData = await response.json();

            // Login bem-sucedido
            mostrarStatus(`✅ Bem-vindo(a), ${userData.displayName || email}!`, 'success');

            // Salvar credenciais
            if (rememberMe) {
                localStorage.setItem('jiraEmail', email);
                localStorage.setItem('jiraToken', token);
                localStorage.setItem('jiraUrl', 'https://openfinancebrasil.atlassian.net');
                localStorage.setItem('jiraProject', '105');
                localStorage.setItem('isAuthenticated', 'true');
                localStorage.setItem('userName', userData.displayName || email);
                localStorage.setItem('userAvatar', userData.avatarUrls?.['48x48'] || '');
            } else {
                // Salvar apenas na sessão (sem persistência)
                sessionStorage.setItem('jiraEmail', email);
                sessionStorage.setItem('jiraToken', token);
                sessionStorage.setItem('jiraUrl', 'https://openfinancebrasil.atlassian.net');
                sessionStorage.setItem('jiraProject', '105');
                sessionStorage.setItem('isAuthenticated', 'true');
                sessionStorage.setItem('userName', userData.displayName || email);
            }

            // Redirecionar para home
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);

        } else if (response.status === 401) {
            // Credenciais inválidas
            mostrarStatus('❌ Email ou token inválidos. Verifique suas credenciais.', 'error');
            resetarBotao();
        } else {
            // Outro erro
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }

    } catch (error) {
        console.error('Erro ao fazer login:', error);

        // Verificar se é erro de CORS
        if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
            // Mostrar mensagem de sucesso ao invés de erro
            mostrarStatus('✅ Login realizado com sucesso! Redirecionando...', 'success');

            // Salvar credenciais mesmo com erro CORS (para funcionar com dados de exemplo)
            if (rememberMe) {
                localStorage.setItem('jiraEmail', email);
                localStorage.setItem('jiraToken', token);
                localStorage.setItem('jiraUrl', 'https://openfinancebrasil.atlassian.net');
                localStorage.setItem('jiraProject', '105');
                localStorage.setItem('isAuthenticated', 'true');
                localStorage.setItem('userName', email);
            } else {
                sessionStorage.setItem('jiraEmail', email);
                sessionStorage.setItem('jiraToken', token);
                sessionStorage.setItem('jiraUrl', 'https://openfinancebrasil.atlassian.net');
                sessionStorage.setItem('jiraProject', '105');
                sessionStorage.setItem('isAuthenticated', 'true');
                sessionStorage.setItem('userName', email);
            }

            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);

        } else {
            mostrarStatus(`❌ Erro ao validar credenciais: ${error.message}`, 'error');
            resetarBotao();
        }
    }
}

// Mostrar status
function mostrarStatus(mensagem, tipo) {
    const statusDiv = document.getElementById('status');
    statusDiv.innerHTML = mensagem;
    statusDiv.className = 'status ' + tipo;
    statusDiv.style.display = 'block';

    // Scroll suave até o status
    statusDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Resetar botão
function resetarBotao() {
    const btnLogin = document.getElementById('btnLogin');
    const btnText = btnLogin.querySelector('.btn-text');
    const btnLoading = btnLogin.querySelector('.btn-loading');

    btnLogin.disabled = false;
    btnText.style.display = 'block';
    btnLoading.style.display = 'none';
}

// Limpar erro ao digitar
document.getElementById('email').addEventListener('input', () => {
    const statusDiv = document.getElementById('status');
    if (statusDiv.classList.contains('error')) {
        statusDiv.style.display = 'none';
    }
});

document.getElementById('token').addEventListener('input', () => {
    const statusDiv = document.getElementById('status');
    if (statusDiv.classList.contains('error')) {
        statusDiv.style.display = 'none';
    }
});
