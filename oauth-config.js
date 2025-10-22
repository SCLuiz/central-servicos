// Configuração OAuth 2.0 - Atlassian
const OAUTH_CONFIG = {
    clientId: '047HKKcG5shYb3WOZ65f6n8KUrRUvOSC',

    authorizationUrl: 'https://auth.atlassian.com/authorize',

    // URL de callback (GitHub Pages)
    redirectUri: 'https://scluiz.github.io/central-servicos/oauth-callback.html',

    // Backend proxy para trocar o código por token (mantém o secret seguro)
    backendTokenUrl: 'http://localhost:5000/api/oauth/token',

    // Scopes necessários
    scope: 'read:jira-user read:jira-work offline_access',

    // Audience (Jira API)
    audience: 'api.atlassian.com',

    // Prompt para forçar login sempre
    prompt: 'consent'
};
