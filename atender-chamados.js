// Configuração
const JIRA_URL = 'https://openfinancebrasil.atlassian.net';
const PROJECT_KEY = 'HELP';

// Estado global
let allTickets = [];
let currentTicket = null;
let credentials = {
    email: '',
    token: ''
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticação geral
    const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true' ||
                           sessionStorage.getItem('isAuthenticated') === 'true';

    if (!isAuthenticated) {
        window.location.href = 'login.html';
        return;
    }

    // Carregar credenciais do Jira
    loadCredentials();

    // Se não tem credenciais, mostrar modal de configuração
    if (!credentials.email || !credentials.token) {
        openConfigModal();
    } else {
        // Carregar tickets
        loadTickets();
    }

    // Event listeners para filtros
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            filterTickets(e.target.dataset.filter);
        });
    });

    // Event listener para busca
    document.getElementById('searchTicket').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchTicket();
        }
    });
});

// Carregar credenciais
function loadCredentials() {
    const savedEmail = localStorage.getItem('jiraEmail');
    const savedToken = localStorage.getItem('jiraToken');

    if (savedEmail && savedToken) {
        credentials.email = savedEmail;
        credentials.token = savedToken;
    }
}

// Salvar credenciais
function saveCredentials() {
    const email = document.getElementById('jiraEmail').value;
    const token = document.getElementById('jiraToken').value;
    const remember = document.getElementById('rememberCredentials').checked;

    if (!email || !token) {
        alert('Por favor, preencha email e token');
        return;
    }

    credentials.email = email;
    credentials.token = token;

    if (remember) {
        localStorage.setItem('jiraEmail', email);
        localStorage.setItem('jiraToken', token);
    }

    closeConfigModal();
    loadTickets();
}

// Fazer requisição ao Jira
async function jiraRequest(endpoint, method = 'GET', body = null) {
    const auth = btoa(`${credentials.email}:${credentials.token}`);

    const options = {
        method,
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${JIRA_URL}/rest/api/3/${endpoint}`, options);

        if (!response.ok) {
            if (response.status === 401) {
                alert('Credenciais inválidas! Configure novamente.');
                openConfigModal();
                return null;
            }
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Erro na requisição:', error);
        alert(`Erro: ${error.message}`);
        return null;
    }
}

// Carregar tickets
async function loadTickets() {
    document.getElementById('loadingTickets').style.display = 'block';
    document.getElementById('ticketsList').innerHTML = '';

    // JQL para buscar tickets do projeto HELP (Service Desk)
    const jql = `project = ${PROJECT_KEY} ORDER BY created DESC`;

    const data = await jiraRequest(`search?jql=${encodeURIComponent(jql)}&maxResults=100&fields=summary,status,priority,assignee,reporter,created,updated,issuetype`);

    document.getElementById('loadingTickets').style.display = 'none';

    if (!data || !data.issues) {
        document.getElementById('ticketsList').innerHTML = '<p style="text-align: center; padding: 40px; color: #666;">Nenhum ticket encontrado.</p>';
        return;
    }

    allTickets = data.issues;
    renderTickets(allTickets);
    updateStats(allTickets);
}

// Renderizar tickets
function renderTickets(tickets) {
    const container = document.getElementById('ticketsList');
    container.innerHTML = '';

    if (tickets.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 40px; color: #666;">Nenhum ticket encontrado.</p>';
        return;
    }

    tickets.forEach(ticket => {
        const item = document.createElement('div');
        item.className = 'ticket-item';
        item.onclick = () => openTicketModal(ticket);

        const status = ticket.fields.status.name;
        const statusClass = getStatusClass(status);

        const assignee = ticket.fields.assignee ? ticket.fields.assignee.displayName : 'Não atribuído';
        const reporter = ticket.fields.reporter ? ticket.fields.reporter.displayName : 'Desconhecido';
        const created = new Date(ticket.fields.created).toLocaleDateString('pt-BR');

        item.innerHTML = `
            <div class="ticket-header">
                <span class="ticket-key">${ticket.key}</span>
                <span class="status-badge ${statusClass}">${status}</span>
            </div>
            <div class="ticket-summary">${ticket.fields.summary}</div>
            <div class="ticket-meta">
                <span>👤 ${reporter}</span>
                <span>🎯 ${assignee}</span>
                <span>📅 ${created}</span>
            </div>
        `;

        container.appendChild(item);
    });
}

// Atualizar estatísticas
function updateStats(tickets) {
    const total = tickets.length;
    const open = tickets.filter(t => ['Em Andamento', 'Aguardando pelo suporte'].includes(t.fields.status.name)).length;
    const waiting = tickets.filter(t => ['Aguardando cliente', 'Itens Pendentes'].includes(t.fields.status.name)).length;

    // Resolvidos hoje
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const resolved = tickets.filter(t => {
        if (t.fields.status.name === 'Resolvido' || t.fields.status.name === 'Fechado') {
            const updatedDate = new Date(t.fields.updated);
            updatedDate.setHours(0, 0, 0, 0);
            return updatedDate.getTime() === today.getTime();
        }
        return false;
    }).length;

    document.getElementById('totalTickets').textContent = total;
    document.getElementById('openTickets').textContent = open;
    document.getElementById('waitingTickets').textContent = waiting;
    document.getElementById('resolvedTickets').textContent = resolved;
}

// Obter classe CSS para status
function getStatusClass(status) {
    const statusMap = {
        'Em Andamento': 'open',
        'Aguardando pelo suporte': 'open',
        'Aguardando cliente': 'waiting',
        'Itens Pendentes': 'waiting',
        'Resolvido': 'resolved',
        'Fechado': 'resolved'
    };
    return statusMap[status] || 'open';
}

// Filtrar tickets
function filterTickets(filter) {
    let filtered = [...allTickets];

    switch (filter) {
        case 'my':
            // Filtrar apenas tickets atribuídos ao usuário atual
            filtered = filtered.filter(t =>
                t.fields.assignee &&
                t.fields.assignee.emailAddress === credentials.email
            );
            break;
        case 'open':
            filtered = filtered.filter(t =>
                ['Em Andamento', 'Aguardando pelo suporte'].includes(t.fields.status.name)
            );
            break;
        case 'waiting':
            filtered = filtered.filter(t =>
                ['Aguardando cliente', 'Itens Pendentes'].includes(t.fields.status.name)
            );
            break;
        case 'resolved':
            filtered = filtered.filter(t =>
                ['Resolvido', 'Fechado'].includes(t.fields.status.name)
            );
            break;
    }

    renderTickets(filtered);
}

// Buscar ticket
async function searchTicket() {
    const searchInput = document.getElementById('searchTicket');
    const ticketKey = searchInput.value.trim().toUpperCase();

    if (!ticketKey) {
        loadTickets();
        return;
    }

    document.getElementById('loadingTickets').style.display = 'block';

    const data = await jiraRequest(`issue/${ticketKey}?fields=summary,status,priority,assignee,reporter,created,updated,issuetype`);

    document.getElementById('loadingTickets').style.display = 'none';

    if (data) {
        renderTickets([data]);
    } else {
        document.getElementById('ticketsList').innerHTML = '<p style="text-align: center; padding: 40px; color: #666;">Ticket não encontrado.</p>';
    }
}

// Abrir modal do ticket
async function openTicketModal(ticket) {
    currentTicket = ticket;

    // Buscar detalhes completos incluindo comentários
    const fullTicket = await jiraRequest(`issue/${ticket.key}?expand=renderedFields`);

    if (!fullTicket) return;

    // Preencher informações
    document.getElementById('modalTicketKey').textContent = ticket.key;
    document.getElementById('modalSummary').textContent = fullTicket.fields.summary;
    document.getElementById('modalDescription').textContent = fullTicket.fields.description || 'Sem descrição';

    const statusEl = document.getElementById('modalStatus');
    statusEl.textContent = fullTicket.fields.status.name;
    statusEl.className = `status-badge ${getStatusClass(fullTicket.fields.status.name)}`;

    document.getElementById('modalType').textContent = fullTicket.fields.issuetype.name;
    document.getElementById('modalPriority').textContent = fullTicket.fields.priority ? fullTicket.fields.priority.name : 'Não definida';
    document.getElementById('modalReporter').textContent = fullTicket.fields.reporter ? fullTicket.fields.reporter.displayName : 'Desconhecido';
    document.getElementById('modalAssignee').textContent = fullTicket.fields.assignee ? fullTicket.fields.assignee.displayName : 'Não atribuído';
    document.getElementById('modalCreated').textContent = new Date(fullTicket.fields.created).toLocaleString('pt-BR');

    // Carregar comentários
    await loadComments(ticket.key);

    // Mostrar modal
    document.getElementById('ticketModal').classList.add('active');
}

// Fechar modal do ticket
function closeTicketModal() {
    document.getElementById('ticketModal').classList.remove('active');
    currentTicket = null;
}

// Carregar comentários
async function loadComments(ticketKey) {
    const data = await jiraRequest(`issue/${ticketKey}/comment`);

    const container = document.getElementById('commentsList');
    container.innerHTML = '';

    if (!data || !data.comments || data.comments.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px; color: #666;">Nenhum comentário ainda.</p>';
        return;
    }

    data.comments.forEach(comment => {
        const isInternal = comment.jsdPublic === false;
        const item = document.createElement('div');
        item.className = `comment-item ${isInternal ? 'internal' : ''}`;

        const author = comment.author ? comment.author.displayName : 'Desconhecido';
        const created = new Date(comment.created).toLocaleString('pt-BR');
        const body = comment.body || 'Sem conteúdo';

        item.innerHTML = `
            <div class="comment-header">
                <span class="comment-author">
                    ${author}
                    ${isInternal ? '<span class="internal-badge">INTERNO</span>' : ''}
                </span>
                <span class="comment-date">${created}</span>
            </div>
            <div class="comment-body">${typeof body === 'string' ? body : JSON.stringify(body)}</div>
        `;

        container.appendChild(item);
    });
}

// Adicionar comentário
async function addComment() {
    if (!currentTicket) return;

    const commentText = document.getElementById('commentText').value.trim();
    const isInternal = document.getElementById('internalComment').checked;

    if (!commentText) {
        alert('Digite um comentário');
        return;
    }

    const body = {
        body: {
            type: 'doc',
            version: 1,
            content: [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text: commentText
                        }
                    ]
                }
            ]
        },
        jsdPublic: !isInternal
    };

    const result = await jiraRequest(`issue/${currentTicket.key}/comment`, 'POST', body);

    if (result) {
        document.getElementById('commentText').value = '';
        await loadComments(currentTicket.key);
        alert('Comentário adicionado com sucesso!');
    }
}

// Atualizar status do ticket
async function updateTicketStatus() {
    if (!currentTicket) return;

    const statusSelect = document.getElementById('statusSelect');
    const newStatus = statusSelect.value;

    if (!newStatus) {
        alert('Selecione um status');
        return;
    }

    // Buscar transições disponíveis
    const transitions = await jiraRequest(`issue/${currentTicket.key}/transitions`);

    if (!transitions || !transitions.transitions) {
        alert('Erro ao buscar transições disponíveis');
        return;
    }

    // Encontrar transição correspondente
    const transition = transitions.transitions.find(t => t.to.name === newStatus);

    if (!transition) {
        alert(`Transição para "${newStatus}" não disponível neste momento`);
        return;
    }

    // Executar transição
    const result = await jiraRequest(`issue/${currentTicket.key}/transitions`, 'POST', {
        transition: { id: transition.id }
    });

    if (result !== null) {
        alert('Status atualizado com sucesso!');
        closeTicketModal();
        loadTickets();
    }
}

// Atribuir ticket
async function assignTicket() {
    if (!currentTicket) return;

    const assigneeInput = document.getElementById('assigneeInput').value.trim();

    if (!assigneeInput) {
        alert('Digite o email do responsável');
        return;
    }

    // Buscar usuário
    const users = await jiraRequest(`user/search?query=${encodeURIComponent(assigneeInput)}`);

    if (!users || users.length === 0) {
        alert('Usuário não encontrado');
        return;
    }

    const user = users[0];

    // Atribuir
    const result = await jiraRequest(`issue/${currentTicket.key}/assignee`, 'PUT', {
        accountId: user.accountId
    });

    if (result !== null) {
        alert(`Ticket atribuído para ${user.displayName}`);
        closeTicketModal();
        loadTickets();
    }
}

// Abrir modal de configuração
function openConfigModal() {
    document.getElementById('jiraEmail').value = credentials.email || '';
    document.getElementById('jiraToken').value = credentials.token || '';
    document.getElementById('configModal').classList.add('active');
}

// Fechar modal de configuração
function closeConfigModal() {
    document.getElementById('configModal').classList.remove('active');
}

// Fechar modais ao clicar fora
window.onclick = function(event) {
    const ticketModal = document.getElementById('ticketModal');
    const configModal = document.getElementById('configModal');

    if (event.target === ticketModal) {
        closeTicketModal();
    }
    if (event.target === configModal) {
        closeConfigModal();
    }
}
