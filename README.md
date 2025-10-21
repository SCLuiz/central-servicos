# 🏢 Central de Serviços - Open Finance Brasil

Portal único para acesso a todos os serviços internos da organização.

## ✨ Funcionalidades

### 📋 Serviços Disponíveis

- **Dashboard de Tickets** - Visualize e gerencie tickets do Jira Service Desk
- **Service Desk** - Abra chamados de suporte técnico
- **Recursos Humanos** - Solicitações de RH e benefícios
- **Financeiro** - Reembolsos e questões financeiras
- **Facilities** - Infraestrutura e manutenção
- **Jurídico** - Contratos e compliance
- **Segurança** - Segurança da informação
- **Gestão de Mudanças** - Mudanças em sistemas
- **Operações** - Monitoramento e incidentes
- **Conselho** - Demandas administrativas

### 📊 Dashboard de Tickets

Acesse tickets do Jira Service Desk com:
- ✅ Estatísticas em tempo real
- ✅ Filtros por status e busca
- ✅ Design responsivo
- ✅ Conexão direta com Jira API

## 🚀 Como Usar

### Acesso Rápido

Abra `index.html` no navegador e navegue pelos serviços.

### Dashboard de Tickets

1. Clique em "Dashboard de Tickets"
2. Configure suas credenciais do Jira:
   - Email
   - [API Token](https://id.atlassian.com/manage-profile/security/api-tokens)
   - Service Desk ID (padrão: 105)
3. Visualize seus tickets!

### Backend Proxy (Opcional)

Para evitar problemas de CORS:

```bash
pip install -r requirements.txt
python api_proxy.py
```

Servidor disponível em: http://localhost:5000

## 📁 Estrutura

```
central-servicos/
├── index.html          # Página principal
├── dashboard.html      # Dashboard de tickets
├── dashboard.css       # Estilos do dashboard
├── dashboard.js        # Lógica de conexão Jira
├── api_proxy.py        # Backend proxy (opcional)
├── requirements.txt    # Dependências Python
├── logo.png            # Logo OpenFinance
└── README.md           # Este arquivo
```

## 🎨 Design

- Cores institucionais da Open Finance Brasil
- Design moderno com glassmorphism
- Gradiente animado de fundo
- Totalmente responsivo

## 🔐 Segurança

- Credenciais armazenadas apenas no navegador (localStorage)
- Conexão segura com Jira API
- Backend proxy opcional para produção

## 💡 Tecnologias

- **Frontend:** HTML5 + CSS3 + JavaScript
- **Backend:** Python + Flask (opcional)
- **API:** Jira REST API v3
- **Fonts:** Inter (Google Fonts)

## 📝 Notas

- Configure credenciais do Jira para ver tickets reais
- Dados de exemplo são mostrados por padrão
- Use backend proxy em produção

---

**Open Finance Brasil** © 2025
