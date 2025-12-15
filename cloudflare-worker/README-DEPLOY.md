# Deploy do Cloudflare Worker - Jira API Proxy

Este Worker permite que o Dashboard de Mudanças consulte o Jira em **tempo real**.

## Pré-requisitos

1. Conta no Cloudflare (gratuita)
2. Wrangler CLI instalado: `npm install -g wrangler`
3. Token de API do Jira

## Passos para Deploy

### 1. Fazer login no Cloudflare

```bash
wrangler login
```

### 2. Navegar até a pasta do Worker

```bash
cd cloudflare-worker
```

### 3. Configurar as secrets (credenciais do Jira)

```bash
wrangler secret put JIRA_URL -c wrangler-jira-api.toml
# Cole: https://openfinancebrasil.atlassian.net

wrangler secret put JIRA_EMAIL -c wrangler-jira-api.toml
# Cole: luiz.santos@openfinancebrasil.org.br

wrangler secret put JIRA_API_TOKEN -c wrangler-jira-api.toml
# Cole o token da API do Jira (você tem esse token no .env)
```

### 4. Fazer deploy do Worker

```bash
wrangler deploy -c wrangler-jira-api.toml
```

### 5. Pegar a URL do Worker

Após o deploy, o Wrangler vai mostrar a URL do Worker:
```
https://jira-api-proxy.SEU-USUARIO.workers.dev
```

### 6. Atualizar o Dashboard

Edite o arquivo `dashboard-mudancas.html` e substitua:

```javascript
const WORKER_URL = 'https://jira-api-proxy.SEU-SUBDOMINIO.workers.dev';
```

Pela URL real do seu Worker.

### 7. Commit e Push

```bash
git add .
git commit -m "Adicionar Cloudflare Worker para tempo real"
git push
```

## Teste

Abra o dashboard e veja no console do navegador (F12):
- ✓ `Dados carregados do Worker (tempo real)` - Worker funcionando
- ⚠️ `Worker indisponível, usando JSON de backup` - Usando fallback

## Como funciona

1. **Principal**: Dashboard tenta buscar do Cloudflare Worker (tempo real)
2. **Backup**: Se o Worker falhar, usa o JSON gerado pelo GitHub Action
3. **Auto-refresh**:
   - Worker: a cada 10 segundos
   - JSON: a cada 60 segundos

## Vantagens

- ✅ Dados em tempo real (10 segundos)
- ✅ Fallback automático se Worker falhar
- ✅ GitHub Action continua como backup
- ✅ Indicador visual de qual fonte está sendo usada
