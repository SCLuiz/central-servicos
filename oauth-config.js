// Configuração OAuth 2.0 - Atlassian Jira
// Autenticação usando usuários do Jira como SSO

const OAUTH_CONFIG = {
    // Client ID da aplicação OAuth (já registrada)
    clientId: '047HKKcG5shYb3WOZ65f6n8KUrRUvOSC',

    // URL de autorização do Atlassian
    authorizationUrl: 'https://auth.atlassian.com/authorize',

    // URL de callback (GitHub Pages)
    redirectUri: 'https://scluiz.github.io/central-servicos/oauth-callback.html',

    // Scopes necessários para acessar Jira (granulares)
    scope: 'read:me read:account read:jira-user read:jira-work read:user:jira read:issue-worklog:jira read:issue-worklog.property:jira read:workflow:jira read:workflow-scheme:jira read:workflow.property:jira read:work-item-info:jira read:object:jira read:servicedesk-request manage:servicedesk-customer write:servicedesk-request read:servicemanagement-insight-objects offline_access',

    // Audience (Jira API)
    audience: 'api.atlassian.com',

    // Prompt para garantir consentimento
    prompt: 'consent'
};
