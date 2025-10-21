// Variáveis globais
let todosTickets = [];
let ticketsFiltrados = [];

// Verificar autenticação ao carregar
function verificarAutenticacao() {
    const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true' ||
                           sessionStorage.getItem('isAuthenticated') === 'true';

    if (!isAuthenticated) {
        // Não está autenticado, redirecionar para login
        window.location.href = 'login.html';
        return false;
    }

    // Mostrar informações do usuário
    const userName = localStorage.getItem('userName') || sessionStorage.getItem('userName') || 'Usuário';
    const userInfo = document.getElementById('userInfo');
    const userNameEl = document.getElementById('userName');

    if (userInfo && userNameEl) {
        userNameEl.textContent = `👤 ${userName}`;
        userInfo.style.display = 'flex';
    }

    return true;
}

// Fazer logout
function fazerLogout() {
    if (confirm('Deseja realmente sair?')) {
        // Limpar dados de autenticação
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('userName');
        localStorage.removeItem('userAvatar');

        sessionStorage.removeItem('isAuthenticated');
        sessionStorage.removeItem('userName');

        // Redirecionar para login
        window.location.href = 'login.html';
    }
}

// Carregar configuração do localStorage
function carregarConfiguracao() {
    const config = {
        jiraUrl: localStorage.getItem('jiraUrl') || 'https://openfinancebrasil.atlassian.net',
        jiraEmail: localStorage.getItem('jiraEmail') || '',
        jiraToken: localStorage.getItem('jiraToken') || '',
        jiraProject: localStorage.getItem('jiraProject') || '105'
    };

    // Preencher campos
    if (document.getElementById('jiraUrl')) {
        document.getElementById('jiraUrl').value = config.jiraUrl;
        document.getElementById('jiraEmail').value = config.jiraEmail;
        document.getElementById('jiraToken').value = config.jiraToken;
        document.getElementById('jiraProject').value = config.jiraProject;
    }

    return config;
}

// Salvar configuração
function salvarConfig() {
    const jiraUrl = document.getElementById('jiraUrl').value.trim();
    const jiraEmail = document.getElementById('jiraEmail').value.trim();
    const jiraToken = document.getElementById('jiraToken').value.trim();
    const jiraProject = document.getElementById('jiraProject').value.trim();

    if (!jiraUrl || !jiraEmail || !jiraToken) {
        mostrarStatus('⚠️ Preencha todos os campos obrigatórios', 'warning');
        return;
    }

    localStorage.setItem('jiraUrl', jiraUrl);
    localStorage.setItem('jiraEmail', jiraEmail);
    localStorage.setItem('jiraToken', jiraToken);
    localStorage.setItem('jiraProject', jiraProject);

    mostrarStatus('✅ Configuração salva com sucesso!', 'success');
    toggleConfig();

    // Carregar tickets automaticamente
    setTimeout(() => carregarTickets(), 500);
}

// Toggle config
function toggleConfig() {
    const configSection = document.getElementById('configSection');
    configSection.classList.toggle('active');
}

// Mostrar status
function mostrarStatus(mensagem, tipo = '') {
    const statusDiv = document.getElementById('status');
    statusDiv.innerHTML = `<p>${mensagem}</p>`;
    statusDiv.className = 'status ' + tipo;
    statusDiv.style.display = 'block';
}

// Carregar tickets do Jira
async function carregarTickets() {
    const config = carregarConfiguracao();

    if (!config.jiraEmail || !config.jiraToken) {
        mostrarStatus('⚠️ Configure suas credenciais do Jira primeiro', 'warning');
        toggleConfig();
        return;
    }

    mostrarStatus('🔄 Carregando tickets do Jira...', '');

    try {
        // Codificar credenciais em base64
        const auth = btoa(`${config.jiraEmail}:${config.jiraToken}`);

        // Construir URL da API
        const apiUrl = `${config.jiraUrl}/rest/api/3/search`;

        // JQL para buscar issues do Service Desk
        const jql = `project = ${config.jiraProject} ORDER BY created DESC`;

        const url = `${apiUrl}?jql=${encodeURIComponent(jql)}&maxResults=100`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Erro na API: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        todosTickets = data.issues || [];
        ticketsFiltrados = todosTickets;

        exibirTickets();
        atualizarEstatisticas();

        document.getElementById('stats').style.display = 'grid';
        document.getElementById('filters').style.display = 'flex';

        mostrarStatus(`✅ ${todosTickets.length} tickets carregados com sucesso!`, 'success');

    } catch (error) {
        console.error('Erro ao carregar tickets:', error);

        // Mensagem específica para erro de CORS
        if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
            mostrarStatus(
                '❌ Erro de CORS: O navegador bloqueou a conexão direta com o Jira.<br><br>' +
                '<strong>💡 Soluções:</strong><br>' +
                '1. Use o backend proxy (recomendado) - veja instruções abaixo<br>' +
                '2. Ou instale extensão CORS no navegador (temporário)<br><br>' +
                '<strong>📦 Backend Proxy:</strong> Execute <code>python api_proxy.py</code> no diretório',
                'error'
            );
        } else {
            mostrarStatus(`❌ Erro ao carregar tickets: ${error.message}`, 'error');
        }

        // Mostrar dados de exemplo
        mostrarDadosExemplo();
    }
}

// Mostrar dados de exemplo
function mostrarDadosExemplo() {
    todosTickets = [
        {
            key: 'SD-101',
            fields: {
                summary: 'Problema com acesso ao sistema',
                description: 'Não consigo fazer login na plataforma OpenFinance',
                status: { name: 'To Do' },
                priority: { name: 'High' },
                created: '2025-01-20T10:30:00',
                assignee: { displayName: 'Equipe Suporte' }
            }
        },
        {
            key: 'SD-102',
            fields: {
                summary: 'Solicitação de novo equipamento',
                description: 'Preciso de um notebook para trabalho remoto',
                status: { name: 'In Progress' },
                priority: { name: 'Medium' },
                created: '2025-01-20T11:00:00',
                assignee: { displayName: 'TI' }
            }
        },
        {
            key: 'SD-103',
            fields: {
                summary: 'Erro na integração da API',
                description: 'API retornando erro 500 intermitente',
                status: { name: 'To Do' },
                priority: { name: 'Highest' },
                created: '2025-01-20T09:15:00',
                assignee: { displayName: 'DevOps' }
            }
        },
        {
            key: 'SD-104',
            fields: {
                summary: 'Dúvida sobre processo de deployment',
                description: 'Como fazer deploy em produção?',
                status: { name: 'Done' },
                priority: { name: 'Low' },
                created: '2025-01-19T15:00:00',
                assignee: { displayName: 'Tech Lead' }
            }
        },
        {
            key: 'SD-105',
            fields: {
                summary: 'Atualização de certificado SSL',
                description: 'Certificado vence em 7 dias, precisa renovar',
                status: { name: 'In Progress' },
                priority: { name: 'High' },
                created: '2025-01-20T08:00:00',
                assignee: { displayName: 'Infraestrutura' }
            }
        }
    ];

    ticketsFiltrados = todosTickets;
    exibirTickets();
    atualizarEstatisticas();

    document.getElementById('stats').style.display = 'grid';
    document.getElementById('filters').style.display = 'flex';

    mostrarStatus('ℹ️ Mostrando dados de exemplo (Configure as credenciais para ver dados reais)', 'warning');
}

// Exibir tickets na tela
function exibirTickets() {
    const container = document.getElementById('ticketsContainer');

    if (ticketsFiltrados.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📭</div>
                <h3>Nenhum ticket encontrado</h3>
                <p>Tente ajustar os filtros ou criar um novo ticket</p>
            </div>
        `;
        return;
    }

    container.innerHTML = ticketsFiltrados.map(ticket => {
        const status = ticket.fields.status.name;
        const statusClass = status.replace(/\s+/g, '').toLowerCase();
        const priority = ticket.fields.priority?.name || 'Medium';
        const priorityClass = priority.toLowerCase();

        const data = new Date(ticket.fields.created);
        const dataFormatada = data.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });

        const descricao = ticket.fields.description || 'Sem descrição';
        const descricaoLimitada = descricao.length > 150
            ? descricao.substring(0, 150) + '...'
            : descricao;

        return `
            <div class="ticket-card" onclick="abrirTicket('${ticket.key}')">
                <div class="ticket-header">
                    <span class="ticket-key">${ticket.key}</span>
                    <span class="ticket-status status-${statusClass}">${status}</span>
                </div>
                <div class="ticket-title">${ticket.fields.summary}</div>
                <div class="ticket-description">
                    ${descricaoLimitada}
                </div>
                <div class="ticket-footer">
                    <div class="ticket-meta">
                        👤 ${ticket.fields.assignee?.displayName || 'Não atribuído'}<br>
                        📅 ${dataFormatada}
                    </div>
                    <span class="ticket-priority priority-${priorityClass}">
                        ${priority}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

// Atualizar estatísticas
function atualizarEstatisticas() {
    const abertos = todosTickets.filter(t => t.fields.status.name === 'To Do').length;
    const emProgresso = todosTickets.filter(t => t.fields.status.name === 'In Progress').length;
    const resolvidos = todosTickets.filter(t => t.fields.status.name === 'Done').length;

    document.getElementById('statAbertos').textContent = abertos;
    document.getElementById('statEmProgresso').textContent = emProgresso;
    document.getElementById('statResolvidos').textContent = resolvidos;
    document.getElementById('statTotal').textContent = todosTickets.length;
}

// Filtrar tickets
function filtrarTickets() {
    const statusFiltro = document.getElementById('filterStatus').value;
    const searchFiltro = document.getElementById('filterSearch').value.toLowerCase();

    ticketsFiltrados = todosTickets.filter(ticket => {
        const matchStatus = !statusFiltro || ticket.fields.status.name === statusFiltro;
        const matchSearch = !searchFiltro ||
            ticket.fields.summary.toLowerCase().includes(searchFiltro) ||
            ticket.key.toLowerCase().includes(searchFiltro) ||
            (ticket.fields.description && ticket.fields.description.toLowerCase().includes(searchFiltro));

        return matchStatus && matchSearch;
    });

    exibirTickets();
}

// Abrir ticket (link para Jira)
function abrirTicket(ticketKey) {
    const config = carregarConfiguracao();
    const url = `${config.jiraUrl}/browse/${ticketKey}`;
    window.open(url, '_blank');
}

// Inicialização
window.addEventListener('DOMContentLoaded', () => {
    // PRIMEIRO: Verificar autenticação
    if (!verificarAutenticacao()) {
        return; // Já foi redirecionado para login
    }

    // Carregar configuração
    carregarConfiguracao();

    // Se já tem credenciais, mostrar dados de exemplo
    const config = carregarConfiguracao();
    if (config.jiraEmail && config.jiraToken) {
        // Tentar carregar dados reais, se falhar mostra exemplos
        carregarTickets();
    } else {
        // Mostrar dados de exemplo por padrão
        mostrarDadosExemplo();
    }
});
