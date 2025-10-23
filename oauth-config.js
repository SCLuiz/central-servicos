// Configuração OAuth 2.0 - Atlassian Jira
// Autenticação usando usuários do Jira como SSO

const OAUTH_CONFIG = {
    // Client ID da aplicação OAuth (já registrada)
    clientId: '047HKKcG5shYb3WOZ65f6n8KUrRUvOSC',

    // URL de autorização do Atlassian
    authorizationUrl: 'https://auth.atlassian.com/authorize',

    // URL de callback (GitHub Pages)
    redirectUri: 'https://scluiz.github.io/central-servicos/oauth-callback.html',

    // Scopes necessários para acessar Jira
    scope: 'read:jira-user read:jira-work offline_access',

    // Audience (Jira API)
    audience: 'api.atlassian.com',

    // Prompt para garantir consentimento
    prompt: 'consent'
};
