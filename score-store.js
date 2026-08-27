/*
 * ScoreStore — camada de dados (persistência client-side em localStorage).
 * Guarda um único documento JSON com todas as entidades do sistema de Score.
 * Não conhece regras de negócio nem HTML: apenas carrega, salva, semeia e audita.
 */
(function (global) {
    'use strict';

    var DB_KEY = 'ofb_score_db_v1';

    function uid(prefix) {
        return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }
    function nowIso() { return new Date().toISOString(); }

    function load() {
        try {
            var raw = localStorage.getItem(DB_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.error('ScoreStore: falha ao ler localStorage', e);
            return null;
        }
    }

    function save(db) {
        db.meta.updatedAt = nowIso();
        localStorage.setItem(DB_KEY, JSON.stringify(db));
        return db;
    }

    function audit(db, entity, entityId, action, before, after) {
        db.audit_logs.unshift({
            id: uid('aud'), entity: entity, entityId: entityId, action: action,
            before: before || null, after: after || null,
            user: (db.meta.currentUser && db.meta.currentUser.name) || 'sistema',
            at: nowIso()
        });
        if (db.audit_logs.length > 500) db.audit_logs.length = 500;
    }

    function pushAlert(db, alert) {
        db.alerts.unshift(Object.assign({
            id: uid('alert'), createdAt: nowIso(), resolved: false
        }, alert));
        if (db.alerts.length > 300) db.alerts.length = 300;
    }

    // ---------------------------------------------------------------------
    // SEED
    // ---------------------------------------------------------------------
    function seedDb() {
        var db = {
            meta: {
                version: 1, orgName: 'Open Finance Brasil', createdAt: nowIso(), updatedAt: nowIso(),
                currentUser: { id: 'u_admin', name: 'Luiz Santos', role: 'ADMINISTRADOR' },
                settings: { calcFrequency: 'monthly', autoRecalc: true, defaultPeriodType: 'monthly' }
            },
            users: [
                { id: 'u_admin', name: 'Luiz Santos', role: 'ADMINISTRADOR' },
                { id: 'u_gestor', name: 'Comitê de Operações', role: 'GESTOR' },
                { id: 'u_analista', name: 'Analista de Operações', role: 'ANALISTA' },
                { id: 'u_viewer', name: 'Visualizador', role: 'VISUALIZADOR' }
            ],
            pillars: [
                { id: 'p_incidentes', key: 'incidentes', name: 'Incidentes', weight: 25, active: true, order: 1 },
                { id: 'p_sla', key: 'sla_slo', name: 'SLA e SLO', weight: 20, active: true, order: 2 },
                { id: 'p_disp', key: 'disponibilidade', name: 'Disponibilidade', weight: 20, active: true, order: 3 },
                { id: 'p_mud', key: 'mudancas', name: 'Mudanças e GMUD', weight: 15, active: true, order: 4 },
                { id: 'p_obs', key: 'observabilidade', name: 'Observabilidade', weight: 10, active: true, order: 5 },
                { id: 'p_mel', key: 'melhoria_continua', name: 'Melhoria Contínua', weight: 10, active: true, order: 6 }
            ],
            pillar_weight_history: [],
            kpis: [
                { id: 'k_mttr', pillarId: 'p_incidentes', key: 'mttr', name: 'MTTR — Mean Time To Resolve', direction: 'lower', unit: 'horas', target: 4, weightInPillar: 40, active: true, period: 'monthly' },
                { id: 'k_mtta', pillarId: 'p_incidentes', key: 'mtta', name: 'MTTA — Mean Time To Acknowledge', direction: 'lower', unit: 'minutos', target: 30, weightInPillar: 20, active: true, period: 'monthly' },
                { id: 'k_inc_criticos', pillarId: 'p_incidentes', key: 'incidentes_criticos', name: 'Quantidade de Incidentes Críticos', direction: 'lower', unit: 'qtd', target: 0, weightInPillar: 25, active: true, period: 'monthly' },
                { id: 'k_inc_recorrentes', pillarId: 'p_incidentes', key: 'incidentes_recorrentes', name: 'Taxa de Incidentes Recorrentes', direction: 'lower', unit: '%', target: 5, weightInPillar: 15, active: true, period: 'monthly' },
                { id: 'k_inc_volume', pillarId: 'p_incidentes', key: 'volume_incidentes', name: 'Volume de Incidentes', direction: 'lower', unit: 'qtd', target: 50, weightInPillar: 0, active: false, period: 'monthly' },

                { id: 'k_sla', pillarId: 'p_sla', key: 'sla_cumprido', name: 'Percentual de SLA Cumprido', direction: 'higher', unit: '%', target: 95, weightInPillar: 60, active: true, period: 'monthly' },
                { id: 'k_slo', pillarId: 'p_sla', key: 'slo_cumprido', name: 'Percentual de SLO Cumprido', direction: 'higher', unit: '%', target: 95, weightInPillar: 40, active: true, period: 'monthly' },

                { id: 'k_disp', pillarId: 'p_disp', key: 'disponibilidade_servicos', name: 'Disponibilidade dos Serviços', direction: 'higher', unit: '%', target: 99.5, weightInPillar: 70, active: true, period: 'monthly' },
                { id: 'k_indisp_criticas', pillarId: 'p_disp', key: 'indisponibilidades_criticas', name: 'Quantidade de Indisponibilidades Críticas', direction: 'lower', unit: 'qtd', target: 0, weightInPillar: 30, active: true, period: 'monthly' },

                { id: 'k_sucesso_mud', pillarId: 'p_mud', key: 'sucesso_mudancas', name: 'Taxa de Sucesso das Mudanças', direction: 'higher', unit: '%', target: 95, weightInPillar: 40, active: true, period: 'monthly' },
                { id: 'k_rollback', pillarId: 'p_mud', key: 'taxa_rollback', name: 'Taxa de Rollback', direction: 'lower', unit: '%', target: 5, weightInPillar: 25, active: true, period: 'monthly' },
                { id: 'k_mud_emerg', pillarId: 'p_mud', key: 'mudancas_emergenciais', name: 'Percentual de Mudanças Emergenciais', direction: 'lower', unit: '%', target: 10, weightInPillar: 15, active: true, period: 'monthly' },
                { id: 'k_mud_incid', pillarId: 'p_mud', key: 'mudancas_geraram_incidentes', name: 'Mudanças que Geraram Incidentes', direction: 'lower', unit: 'qtd', target: 2, weightInPillar: 20, active: true, period: 'monthly' },

                { id: 'k_cobertura', pillarId: 'p_obs', key: 'cobertura_monitoramento', name: 'Cobertura de Monitoramento', direction: 'higher', unit: '%', target: 90, weightInPillar: 40, active: true, period: 'monthly' },
                { id: 'k_serv_alertas', pillarId: 'p_obs', key: 'servicos_com_alertas', name: 'Percentual de Serviços com Alertas Configurados', direction: 'higher', unit: '%', target: 90, weightInPillar: 35, active: true, period: 'monthly' },
                { id: 'k_alertas_acion', pillarId: 'p_obs', key: 'alertas_acionaveis', name: 'Taxa de Alertas Acionáveis', direction: 'higher', unit: '%', target: 80, weightInPillar: 25, active: true, period: 'monthly' },

                { id: 'k_prob_eliminados', pillarId: 'p_mel', key: 'problemas_recorrentes_eliminados', name: 'Problemas Recorrentes Eliminados', direction: 'higher', unit: 'qtd', target: 5, weightInPillar: 35, active: true, period: 'monthly' },
                { id: 'k_acoes_prazo', pillarId: 'p_mel', key: 'acoes_corretivas_prazo', name: 'Ações Corretivas Concluídas no Prazo', direction: 'higher', unit: '%', target: 90, weightInPillar: 40, active: true, period: 'monthly' },
                { id: 'k_riscos_mitigados', pillarId: 'p_mel', key: 'riscos_mitigados', name: 'Riscos Mitigados', direction: 'higher', unit: 'qtd', target: 3, weightInPillar: 25, active: true, period: 'monthly' }
            ],
            kpi_targets_history: [],
            kpi_values: [],
            period_signals: [],
            services: [
                { id: 's_airflow', name: 'Airflow', criticality: 'P2', owner: 'Squad Dados', category: 'Orquestração', environment: 'Produção', active: true },
                { id: 's_sd', name: 'Service Desk', criticality: 'P1', owner: 'Operações de TI', category: 'Atendimento', environment: 'Produção', active: true },
                { id: 's_pad', name: 'PAD', criticality: 'P2', owner: 'Operações de TI', category: 'Aplicação', environment: 'Produção', active: true },
                { id: 's_budibase', name: 'Budibase', criticality: 'P3', owner: 'Operações de TI', category: 'Low-code', environment: 'Produção', active: true }
            ],
            criticality_weights: [
                { level: 'P1', label: 'Crítico', multiplier: 1.5 },
                { level: 'P2', label: 'Alto', multiplier: 1.2 },
                { level: 'P3', label: 'Médio', multiplier: 1.0 },
                { level: 'P4', label: 'Baixo', multiplier: 0.7 }
            ],
            penalty_rules: [
                { id: 'pr_p1', name: 'Incidente P1 Ativo', description: 'Existe pelo menos um incidente P1 em status aberto ou em andamento.', type: 'p1_incident_active', points: 20, priority: 1, active: true, params: {} },
                { id: 'pr_indisp', name: 'Indisponibilidade Crítica', description: 'Existe indisponibilidade de serviço crítico.', type: 'critical_unavailability', points: 15, priority: 2, active: true, params: {} },
                { id: 'pr_sla', name: 'Violação Crítica de SLA', description: 'Percentual de SLA abaixo de 80%.', type: 'sla_below_threshold', points: 10, priority: 3, active: true, params: { kpiKey: 'sla_cumprido', threshold: 80 } },
                { id: 'pr_mud', name: 'Mudança Crítica com Falha', description: 'Uma mudança crítica gerou indisponibilidade.', type: 'change_critical_failure', points: 10, priority: 4, active: true, params: {} }
            ],
            penalty_events: [],
            classification_ranges: JSON.parse(JSON.stringify(global.ScoreEngine.DEFAULT_CLASSIFICATION)),
            score_calculations: [],
            score_history: [],
            integrations: [
                { id: 'int_jira', type: 'jira', name: 'Jira — OFBI', config: { baseUrl: 'https://openfinancebrasil.atlassian.net' }, status: 'not_configured', lastSync: null },
                { id: 'int_jsm', type: 'jsm', name: 'Jira Service Management', config: {}, status: 'not_configured', lastSync: null },
                { id: 'int_zabbix', type: 'zabbix', name: 'Zabbix', config: {}, status: 'not_configured', lastSync: null },
                { id: 'int_grafana', type: 'grafana', name: 'Grafana', config: {}, status: 'not_configured', lastSync: null }
            ],
            imports: [],
            alerts: [],
            audit_logs: []
        };

        audit(db, 'system', null, 'seed', null, null);
        seedValues(db);
        return db;
    }

    function addValue(db, kpiId, period, value, serviceId, observation, source) {
        db.kpi_values.push({
            id: uid('kv'), kpiId: kpiId, period: period, periodType: 'monthly',
            value: value, serviceId: serviceId || null, observation: observation || '',
            source: source || 'manual', createdAt: nowIso(), createdBy: 'seed'
        });
    }

    function seedValues(db) {
        var months = {
            '2026-06': {
                mttr: 7, mtta: 45, incidentes_criticos: 2, incidentes_recorrentes: 9,
                sla_cumprido: 88, slo_cumprido: 85,
                disponibilidade_servicos: 99.1, indisponibilidades_criticas: 1,
                sucesso_mudancas: 90, taxa_rollback: 8, mudancas_emergenciais: 14, mudancas_geraram_incidentes: 3,
                cobertura_monitoramento: 75, servicos_com_alertas: 78, alertas_acionaveis: 65,
                problemas_recorrentes_eliminados: 2, acoes_corretivas_prazo: 80, riscos_mitigados: 1
            },
            '2026-07': {
                mttr: 5.5, mtta: 38, incidentes_criticos: 1, incidentes_recorrentes: 7,
                sla_cumprido: 92, slo_cumprido: 90,
                disponibilidade_servicos: 99.4, indisponibilidades_criticas: 0,
                sucesso_mudancas: 93, taxa_rollback: 6, mudancas_emergenciais: 11, mudancas_geraram_incidentes: 2,
                cobertura_monitoramento: 82, servicos_com_alertas: 85, alertas_acionaveis: 72,
                problemas_recorrentes_eliminados: 3, acoes_corretivas_prazo: 86, riscos_mitigados: 2
            },
            '2026-08': {
                mttr: 4.5, mtta: 28, incidentes_criticos: 0, incidentes_recorrentes: 4.5,
                sla_cumprido: 96, slo_cumprido: 94,
                disponibilidade_servicos: 99.7, indisponibilidades_criticas: 0,
                sucesso_mudancas: 95, taxa_rollback: 4, mudancas_emergenciais: 9, mudancas_geraram_incidentes: 1,
                cobertura_monitoramento: 88, servicos_com_alertas: 90, alertas_acionaveis: 79,
                problemas_recorrentes_eliminados: 4, acoes_corretivas_prazo: 91, riscos_mitigados: 3
            }
        };

        var keyToKpiId = {};
        db.kpis.forEach(function (k) { keyToKpiId[k.key] = k.id; });

        Object.keys(months).forEach(function (period) {
            var values = months[period];
            Object.keys(values).forEach(function (key) {
                if (keyToKpiId[key]) addValue(db, keyToKpiId[key], period, values[key], null, '', 'seed');
            });
        });

        // Sinalizadores de período (disparam penalidades)
        db.period_signals.push({ id: uid('sig'), period: '2026-06', serviceId: null, p1IncidentsActive: 1, criticalUnavailability: false, changeCriticalFailure: false });
        db.period_signals.push({ id: uid('sig'), period: '2026-07', serviceId: null, p1IncidentsActive: 0, criticalUnavailability: false, changeCriticalFailure: false });
        db.period_signals.push({ id: uid('sig'), period: '2026-08', serviceId: null, p1IncidentsActive: 0, criticalUnavailability: false, changeCriticalFailure: false });

        // Dados por serviço (agosto), propositalmente parciais para demonstrar dataCompleteness
        var perService = {
            s_airflow: { mttr: 6, mtta: 40, incidentes_criticos: 0, incidentes_recorrentes: 8, disponibilidade_servicos: 98.9, indisponibilidades_criticas: 1, cobertura_monitoramento: 70, servicos_com_alertas: 72, alertas_acionaveis: 60 },
            s_sd: { mttr: 3, mtta: 15, incidentes_criticos: 0, incidentes_recorrentes: 2, sla_cumprido: 98, slo_cumprido: 97, disponibilidade_servicos: 99.9, indisponibilidades_criticas: 0 },
            s_pad: { mttr: 5, mtta: 32, incidentes_criticos: 0, incidentes_recorrentes: 5, sla_cumprido: 93, slo_cumprido: 91, disponibilidade_servicos: 99.5, indisponibilidades_criticas: 0, cobertura_monitoramento: 85, servicos_com_alertas: 88, alertas_acionaveis: 74 }
        };
        Object.keys(perService).forEach(function (serviceId) {
            var values = perService[serviceId];
            Object.keys(values).forEach(function (key) {
                if (keyToKpiId[key]) addValue(db, keyToKpiId[key], '2026-08', values[key], serviceId, '', 'seed');
            });
        });

        pushAlert(db, { type: 'info', severity: 'info', message: 'Base inicial de exemplo carregada com 3 períodos (jun–ago/2026) e 4 serviços cadastrados.', period: '2026-08' });
    }

    function getDb() {
        var db = load();
        if (!db) { db = seedDb(); save(db); }
        return db;
    }

    function resetToSeed() {
        var db = seedDb();
        save(db);
        return db;
    }

    function exportJson() {
        return JSON.stringify(getDb(), null, 2);
    }

    function importJson(text) {
        var db = JSON.parse(text);
        if (!db || !db.meta || !db.pillars) throw new Error('Arquivo não corresponde ao formato do banco de Score.');
        save(db);
        return db;
    }

    global.ScoreStore = {
        DB_KEY: DB_KEY,
        uid: uid, nowIso: nowIso,
        getDb: getDb, save: save, seedDb: seedDb, resetToSeed: resetToSeed,
        audit: audit, pushAlert: pushAlert,
        exportJson: exportJson, importJson: importJson
    };
})(window);
