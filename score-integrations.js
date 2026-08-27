/*
 * ScoreIntegrations — camada de integração (conectores).
 * Nenhum conector real está implementado ainda: cada um retorna uma resposta
 * estruturada indicando que a sincronização automática ainda não está ativa,
 * mas o formato de configuração e o fluxo de teste/sync já estão prontos
 * para receber a implementação real (Jira, JSM, Zabbix, Grafana, REST).
 */
(function (global) {
    'use strict';

    var CONNECTOR_TYPES = [
        {
            type: 'jira', label: 'Jira', icon: '🗂️',
            fields: [
                { key: 'baseUrl', label: 'URL da instância', placeholder: 'https://openfinancebrasil.atlassian.net' },
                { key: 'email', label: 'E-mail', placeholder: 'usuario@dominio.com' },
                { key: 'apiToken', label: 'API Token', type: 'password' },
                { key: 'jql', label: 'JQL base', placeholder: 'project = OFBI AND type = Incidente' }
            ]
        },
        {
            type: 'jsm', label: 'Jira Service Management', icon: '🎫',
            fields: [
                { key: 'baseUrl', label: 'URL da instância', placeholder: 'https://openfinancebrasil.atlassian.net' },
                { key: 'serviceDeskId', label: 'ID do Service Desk' },
                { key: 'apiToken', label: 'API Token', type: 'password' }
            ]
        },
        {
            type: 'zabbix', label: 'Zabbix', icon: '📡',
            fields: [
                { key: 'baseUrl', label: 'URL da API', placeholder: 'https://zabbix.exemplo.com/api_jsonrpc.php' },
                { key: 'authToken', label: 'Token de autenticação', type: 'password' },
                { key: 'hostGroup', label: 'Host group monitorado' }
            ]
        },
        {
            type: 'grafana', label: 'Grafana', icon: '📈',
            fields: [
                { key: 'baseUrl', label: 'URL do Grafana', placeholder: 'https://grafana.exemplo.com' },
                { key: 'apiKey', label: 'API Key', type: 'password' },
                { key: 'dashboardUid', label: 'UID do dashboard' }
            ]
        },
        {
            type: 'rest', label: 'API REST Genérica', icon: '🔌',
            fields: [
                { key: 'baseUrl', label: 'URL do endpoint' },
                { key: 'authHeader', label: 'Header de autenticação', placeholder: 'Authorization: Bearer ...' },
                { key: 'mapping', label: 'Mapeamento de campos (JSON)', type: 'textarea' }
            ]
        }
    ];

    function getConnectorType(type) {
        var found = null;
        CONNECTOR_TYPES.forEach(function (c) { if (c.type === type) found = c; });
        return found;
    }

    // Stub assíncrono — simula latência de rede sem sair da máquina do usuário.
    function testConnection(integration) {
        return new Promise(function (resolve) {
            setTimeout(function () {
                resolve({
                    ok: false,
                    stub: true,
                    message: 'Conector "' + (getConnectorType(integration.type) || {}).label + '" está configurado, ' +
                        'mas a chamada real à API ainda não foi implementada. Estrutura pronta para receber a integração.'
                });
            }, 400);
        });
    }

    function sync(integration) {
        return new Promise(function (resolve) {
            setTimeout(function () {
                resolve({
                    ok: false,
                    stub: true,
                    rowsImported: 0,
                    message: 'Sincronização automática ainda não implementada para este conector.',
                    at: new Date().toISOString()
                });
            }, 400);
        });
    }

    global.ScoreIntegrations = {
        CONNECTOR_TYPES: CONNECTOR_TYPES,
        getConnectorType: getConnectorType,
        testConnection: testConnection,
        sync: sync
    };
})(window);
