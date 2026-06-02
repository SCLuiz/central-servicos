// Configuração OAuth 2.0 - Atlassian Jira
// Autenticação usando usuários do Jira como SSO
//
// SCOPES: mantidos apenas os necessários para o portal funcionar.
// Removidos: read:workflow*, read:work-item-info:jira, read:object:jira,
//            read:issue-worklog*, manage:servicedesk-customer (não usado no portal),
//            offline_access (refresh token armazenado apenas em sessionStorage)

const OAUTH_CONFIG = {
    // Client ID da aplicação OAuth (registrada no Atlassian Developer Console)
    clientId: '047HKKcG5shYb3WOZ65f6n8KUrRUvOSC',

    // URL de autorização do Atlassian
    authorizationUrl: 'https://auth.atlassian.com/authorize',

    // URL de callback (GitHub Pages)
    redirectUri: 'https://scluiz.github.io/central-servicos/oauth-callback.html',

    // Scopes mínimos necessários para o portal:
    // - read:me / read:account — identidade do usuário
    // - read:jira-user — verificar se é usuário Jira válido
    // - read:jira-work — ler issues/tickets
    // - read:servicedesk-request — ler chamados do portal
    // - write:servicedesk-request — abrir chamados
    // - read:servicemanagement-insight-objects — Assets/CMDB
    scope: 'read:me read:account read:jira-user read:jira-work read:servicedesk-request write:servicedesk-request read:servicemanagement-insight-objects',

    // Audience (Jira API)
    audience: 'api.atlassian.com',

    // Prompt para garantir consentimento explícito
    prompt: 'consent'
};
