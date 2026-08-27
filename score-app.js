/*
 * ScoreApp — camada de UI/orquestração do Operations Health Score.
 * Nunca recalcula fórmulas aqui: monta o input do ScoreEngine a partir do
 * ScoreStore e desenha as telas. Toda mutação de dados passa por ScoreStore.
 */
(function (global) {
    'use strict';

    var E = global.ScoreEngine;
    var S = global.ScoreStore;
    var I = global.ScoreIntegrations;

    var db = S.getDb();
    var state = {
        tab: 'dashboard',
        period: null,
        serviceId: null,
        configTab: 'pilares',
        simOverrides: {},
        simSignals: {}
    };
    var chartRefs = {};

    // ---------------------------------------------------------------- utils
    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function fmt(n, digits) {
        if (n === null || n === undefined || isNaN(n)) return '—';
        return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: digits || 0, maximumFractionDigits: digits === undefined ? 2 : digits });
    }
    function fmtPeriod(period) {
        if (!period) return '—';
        var m = period.match(/^(\d{4})-(\d{2})$/);
        if (!m) return period;
        var names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        return names[parseInt(m[2], 10) - 1] + '/' + m[1];
    }
    function currentMonthPeriod() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }
    function listPeriods() {
        var set = {};
        db.kpi_values.forEach(function (v) { set[v.period] = true; });
        set[currentMonthPeriod()] = true;
        return Object.keys(set).sort();
    }
    function prevPeriod(period) {
        var periods = listPeriods();
        var idx = periods.indexOf(period);
        return idx > 0 ? periods[idx - 1] : null;
    }
    function role() { return (db.meta.currentUser && db.meta.currentUser.role) || 'VISUALIZADOR'; }
    function canEdit() { return role() === 'ADMINISTRADOR'; }
    function canEnterData() { return role() === 'ADMINISTRADOR' || role() === 'ANALISTA'; }
    function pillarById(id) { var f = null; db.pillars.forEach(function (p) { if (p.id === id) f = p; }); return f; }
    function kpiById(id) { var f = null; db.kpis.forEach(function (k) { if (k.id === id) f = k; }); return f; }
    function serviceById(id) { var f = null; db.services.forEach(function (s) { if (s.id === id) f = s; }); return f; }
    function toast(msg, kind) {
        var el = document.getElementById('toast');
        el.textContent = msg;
        el.className = 'toast show ' + (kind || 'ok');
        clearTimeout(toast._t);
        toast._t = setTimeout(function () { el.className = 'toast'; }, 3200);
    }
    function persist() { S.save(db); }

    // ------------------------------------------------------ engine wiring
    function buildCalcParams(period, serviceId, overrides, simSignals) {
        overrides = overrides || {};
        var kpisByPillar = {};
        db.kpis.forEach(function (k) {
            (kpisByPillar[k.pillarId] = kpisByPillar[k.pillarId] || []).push(k);
        });

        var valuesByKpi = {};
        db.kpis.forEach(function (kpi) {
            if (overrides.hasOwnProperty(kpi.id)) {
                valuesByKpi[kpi.id] = overrides[kpi.id];
                return;
            }
            var found = null;
            db.kpi_values.forEach(function (v) {
                if (v.kpiId !== kpi.id || v.period !== period) return;
                var match = serviceId ? v.serviceId === serviceId : !v.serviceId;
                if (match) found = v.value;
            });
            valuesByKpi[kpi.id] = found;
        });

        var signalsEntry = null;
        db.period_signals.forEach(function (s) {
            var match = serviceId ? s.serviceId === serviceId : !s.serviceId;
            if (s.period === period && match) signalsEntry = s;
        });
        var signals = Object.assign({}, signalsEntry || {}, simSignals || {});

        return {
            pillars: db.pillars, kpisByPillar: kpisByPillar, valuesByKpi: valuesByKpi,
            penaltyRules: db.penalty_rules, signals: signals, classificationRanges: db.classification_ranges
        };
    }

    function runCalculation(period, serviceId, overrides, simSignals) {
        return E.calculate(buildCalcParams(period, serviceId, overrides, simSignals));
    }

    function autoRecalculate(period, serviceId) {
        if (!db.meta.settings.autoRecalc) return null;
        var result = runCalculation(period, serviceId);
        return persistCalculation(period, serviceId, result, 'auto');
    }

    function persistCalculation(period, serviceId, result, trigger) {
        var calc = {
            id: S.uid('calc'), period: period, serviceId: serviceId || null,
            grossScore: result.grossScore, penaltiesTotal: result.penaltiesTotal, finalScore: result.finalScore,
            classification: result.classification.label, weightsValid: result.weightsValid,
            trigger: trigger || 'manual', createdAt: S.nowIso(),
            createdBy: (db.meta.currentUser && db.meta.currentUser.name) || 'sistema',
            snapshot: {
                pillars: result.pillarResults.map(function (p) {
                    return {
                        pillarId: p.pillar.id, name: p.pillar.name, weight: p.pillar.weight, score: p.score,
                        dataCompleteness: p.dataCompleteness,
                        kpis: p.kpiBreakdown.map(function (kb) {
                            return { kpiId: kb.kpi.id, name: kb.kpi.name, target: kb.kpi.target, value: kb.value, score: kb.score, weightInPillar: kb.kpi.weightInPillar };
                        })
                    };
                }),
                penaltiesApplied: result.penaltiesApplied
            }
        };
        db.score_calculations.unshift(calc);
        db.score_history.push({ id: S.uid('hist'), period: period, serviceId: serviceId || null, finalScore: result.finalScore, grossScore: result.grossScore, classification: result.classification.label, at: S.nowIso() });
        generateAlerts(period, serviceId, result);
        S.audit(db, 'score_calculation', calc.id, 'calculate', null, { period: period, serviceId: serviceId, finalScore: result.finalScore, trigger: trigger });
        persist();
        return calc;
    }

    function generateAlerts(period, serviceId, result) {
        var scopeLabel = serviceId ? ('serviço ' + ((serviceById(serviceId) || {}).name || serviceId)) : 'operação geral';
        if (result.finalScore < 70) {
            S.pushAlert(db, { type: 'score_geral', severity: 'critical', message: 'Score de ' + scopeLabel + ' está em ' + fmt(result.finalScore, 1) + ' (' + result.classification.label + ') no período ' + fmtPeriod(period) + '.', period: period });
        }
        result.pillarResults.forEach(function (p) {
            if (p.score !== null && p.score < 70) {
                S.pushAlert(db, { type: 'pillar', severity: 'warning', message: 'Pilar "' + p.pillar.name + '" caiu para ' + fmt(p.score, 1) + ' em ' + scopeLabel + ' (' + fmtPeriod(period) + ').', period: period });
            }
        });
        result.penaltiesApplied.forEach(function (p) {
            S.pushAlert(db, { type: 'penalty', severity: 'critical', message: 'Penalidade ativa em ' + scopeLabel + ': "' + p.name + '" (-' + p.points + ' pontos) — ' + fmtPeriod(period) + '.', period: period });
        });
        var prev = prevPeriod(period);
        if (prev) {
            var prevResult = runCalculation(prev, serviceId);
            var delta = E.round2(result.finalScore - prevResult.finalScore);
            if (delta <= -5) {
                S.pushAlert(db, { type: 'trend', severity: 'warning', message: 'Queda significativa em ' + scopeLabel + ': ' + fmt(prevResult.finalScore, 1) + ' → ' + fmt(result.finalScore, 1) + ' (' + fmt(delta, 1) + ' pts) de ' + fmtPeriod(prev) + ' para ' + fmtPeriod(period) + '.', period: period });
            }
        }
        if (db.audit_logs.length > 500) db.audit_logs.length = 500;
        if (db.alerts.length > 300) db.alerts.length = 300;
    }

    // -------------------------------------------------------------- shell
    function currentPeriod() { return state.period || (listPeriods().slice(-1)[0]) || currentMonthPeriod(); }

    function render() {
        document.getElementById('roleBadge').textContent = role();
        renderFilters();
        var view = document.getElementById('view');
        var fns = {
            dashboard: renderDashboard, tendencia: renderTendencia, simulador: renderSimulador,
            dados: renderDados, servicos: renderServicos, alertas: renderAlertas,
            metodologia: renderMetodologia, config: renderConfig
        };
        view.innerHTML = (fns[state.tab] || renderDashboard)();
        document.querySelectorAll('.tab').forEach(function (t) {
            t.classList.toggle('active', t.dataset.tab === state.tab);
        });
        wireCharts();
    }

    function renderFilters() {
        var periods = listPeriods();
        var el = document.getElementById('filters');
        el.innerHTML =
            '<label>Período <select data-bind="period">' +
            periods.map(function (p) { return '<option value="' + p + '"' + (p === currentPeriod() ? ' selected' : '') + '>' + fmtPeriod(p) + '</option>'; }).join('') +
            '</select></label>' +
            '<label>Serviço <select data-bind="serviceId"><option value="">Operação geral (todos)</option>' +
            db.services.filter(function (s) { return s.active; }).map(function (s) {
                return '<option value="' + s.id + '"' + (s.id === state.serviceId ? ' selected' : '') + '>' + escapeHtml(s.name) + '</option>';
            }).join('') + '</select></label>' +
            '<label>Perfil (simulado) <select data-bind="role">' +
            ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'VISUALIZADOR'].map(function (r) {
                return '<option value="' + r + '"' + (r === role() ? ' selected' : '') + '>' + r + '</option>';
            }).join('') + '</select></label>';
    }

    // ----------------------------------------------------------- dashboard
    function renderDashboard() {
        var period = currentPeriod();
        var result = runCalculation(period, state.serviceId);
        var prev = prevPeriod(period);
        var prevResult = prev ? runCalculation(prev, state.serviceId) : null;
        var delta = prevResult ? E.round2(result.finalScore - prevResult.finalScore) : null;
        var noData = result.dataCompleteness === 0;
        var cls = noData ? { label: 'SEM DADOS', color: '#97A0AF' } : result.classification;

        var weightBanner = !result.weightsValid ?
            '<div class="banner banner-error">⚠️ A soma dos pesos não está em 100% (pilares: ' + fmt(result.pillarWeightSum, 2) + '%). O cálculo não pode ser publicado até corrigir em Configurações → Pilares/KPIs.</div>' : '';

        var pillarsHtml = result.pillarResults.map(function (p) {
            var score = p.score === null ? '—' : fmt(p.score, 1);
            var cInfo = p.score === null ? { color: '#97A0AF' } : E.classify(p.score, db.classification_ranges);
            var completeness = p.dataCompleteness < 99.5 ? '<div class="pill-note">⚠ dados incompletos (' + fmt(p.dataCompleteness, 0) + '% dos pesos com dado)</div>' : '';
            return '<div class="pillar-card" data-action="open-pillar" data-pillar-id="' + p.pillar.id + '">' +
                '<div class="pillar-card-top"><span class="pillar-name">' + escapeHtml(p.pillar.name) + '</span><span class="pillar-weight">peso ' + fmt(p.pillar.weight, 0) + '%</span></div>' +
                '<div class="pillar-score" style="color:' + cInfo.color + '">' + score + '</div>' +
                completeness +
                '</div>';
        }).join('');

        function factorList(items, sign) {
            if (!items.length) return '<p class="muted">Nenhum fator ' + (sign === '-' ? 'negativo' : 'positivo') + ' relevante.</p>';
            return '<ul class="factor-list">' + items.slice(0, 6).map(function (f) {
                var pts = f.isPenalty ? f.points : (sign === '-' ? f.points : (f.actualPoints));
                var label = f.isPenalty ? f.label : (f.label + (f.value !== undefined && f.value !== null ? (' — ' + fmt(f.value, 2) + (f.unit || '') + ' (meta ' + fmt(f.target, 2) + (f.unit || '') + ')') : ''));
                return '<li class="factor ' + (sign === '-' ? 'neg' : 'pos') + '"><span>' + escapeHtml(label) + '</span><b>' + (sign === '-' ? fmt(pts, 1) : '+' + fmt(f.actualPoints, 1)) + ' pts</b></li>';
            }).join('') + '</ul>';
        }

        var calcBtn = canEdit() || canEnterData()
            ? '<button class="btn btn-primary" data-action="calc-now">Calcular Agora</button>'
            : '';

        return '' +
            weightBanner +
            '<div class="hero">' +
            '<div class="gauge" style="--pct:' + (noData ? 0 : Math.max(0, Math.min(100, result.finalScore))) + ';--gcolor:' + cls.color + '">' +
            '<div class="gauge-inner"><div class="gauge-score">' + (noData ? '—' : fmt(result.finalScore, 1)) + '</div><div class="gauge-max">/ 100</div></div></div>' +
            '<div class="hero-info">' +
            '<div class="status-pill" style="background:' + cls.color + '">' + cls.label + '</div>' +
            '<h2>Score de Operações — ' + fmtPeriod(period) + (state.serviceId ? ' · ' + escapeHtml((serviceById(state.serviceId) || {}).name || '') : ' · Operação Geral') + '</h2>' +
            (noData ? '<div class="delta muted">Nenhum KPI possui valor registrado para este escopo/período.</div>' :
                (delta !== null ? '<div class="delta ' + (delta >= 0 ? 'up' : 'down') + '">' + (delta >= 0 ? '▲' : '▼') + ' ' + fmt(Math.abs(delta), 1) + ' pts vs. ' + fmtPeriod(prev) + ' (' + fmt(prevResult.finalScore, 1) + ')</div>' : '<div class="delta muted">Sem período anterior para comparar</div>')) +
            '<div class="hero-sub">Bruto: ' + fmt(result.grossScore, 1) + ' &nbsp;·&nbsp; Penalidades: -' + fmt(result.penaltiesTotal, 1) + ' &nbsp;·&nbsp; Completude de dados: ' + fmt(result.dataCompleteness, 0) + '%</div>' +
            calcBtn +
            ' <button class="info-link" data-action="goto-metodologia" style="margin-left:8px">ℹ️ Como esse número é calculado?</button>' +
            '</div></div>' +
            '<h3 class="section-title">Pilares</h3>' +
            '<div class="pillars-grid">' + pillarsHtml + '</div>' +
            '<h3 class="section-title">Por que o Score está neste nível?</h3>' +
            '<div class="factors-grid">' +
            '<div class="factors-col"><h4>🔻 Principais impactos negativos</h4>' + factorList(result.explanation.negatives, '-') + '</div>' +
            '<div class="factors-col"><h4>🔺 Principais impactos positivos</h4>' + factorList(result.explanation.positives, '+') + '</div>' +
            '</div>' +
            (result.explanation.missing.length ? '<p class="muted">Sem dado no período: ' + result.explanation.missing.map(function (m) { return escapeHtml(m.label); }).join(', ') + '</p>' : '') +
            renderPillarModal(result);
    }

    function renderPillarModal(result) {
        return '<div class="modal" id="pillarModal"><div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><div id="pillarModalBody"></div></div></div>' +
            '<script id="pillarData" type="application/json">' + JSON.stringify(result.pillarResults.map(function (p) {
                return {
                    id: p.pillar.id, name: p.pillar.name, weight: p.pillar.weight, score: p.score,
                    kpis: p.kpiBreakdown.map(function (kb) { return { name: kb.kpi.name, value: kb.value, target: kb.kpi.target, unit: kb.kpi.unit, direction: kb.kpi.direction, weight: kb.kpi.weightInPillar, score: kb.score }; })
                };
            })) + '</\script>';
    }

    function openPillarModal(pillarId) {
        var raw = JSON.parse(document.getElementById('pillarData').textContent);
        var p = raw.filter(function (x) { return x.id === pillarId; })[0];
        if (!p) return;
        var rows = p.kpis.map(function (k) {
            return '<tr><td>' + escapeHtml(k.name) + '</td><td>' + (k.direction === 'higher' ? '↑ maior melhor' : '↓ menor melhor') + '</td>' +
                '<td>' + (k.value === null ? '—' : fmt(k.value, 2) + ' ' + escapeHtml(k.unit)) + '</td>' +
                '<td>' + fmt(k.target, 2) + ' ' + escapeHtml(k.unit) + '</td>' +
                '<td>' + fmt(k.weight, 0) + '%</td>' +
                '<td><b>' + (k.score === null ? '—' : fmt(k.score, 1)) + '</b></td></tr>';
        }).join('');
        document.getElementById('pillarModalBody').innerHTML =
            '<h3>' + escapeHtml(p.name) + ' — Score ' + (p.score === null ? '—' : fmt(p.score, 1)) + ' (peso ' + fmt(p.weight, 0) + '% do geral)</h3>' +
            '<table class="data-table"><thead><tr><th>KPI</th><th>Direção</th><th>Valor Atual</th><th>Meta</th><th>Peso no pilar</th><th>Score</th></tr></thead><tbody>' + rows + '</tbody></table>';
        document.getElementById('pillarModal').classList.add('open');
    }

    // ----------------------------------------------------------- tendência
    function renderTendencia() {
        var periods = listPeriods();
        var histByPeriod = {};
        periods.forEach(function (p) { histByPeriod[p] = runCalculation(p, state.serviceId); });

        var a = state.compareA || periods[periods.length - 2] || periods[0];
        var b = state.compareB || periods[periods.length - 1];
        var ra = histByPeriod[a], rb = histByPeriod[b];

        var compareRows = db.pillars.filter(function (p) { return p.active; }).map(function (pillar) {
            var pa = ra.pillarResults.filter(function (x) { return x.pillar.id === pillar.id; })[0];
            var pb = rb.pillarResults.filter(function (x) { return x.pillar.id === pillar.id; })[0];
            var d = (pa.score !== null && pb.score !== null) ? E.round2(pb.score - pa.score) : null;
            return '<tr><td>' + escapeHtml(pillar.name) + '</td><td>' + fmt(pa.score, 1) + '</td><td>' + fmt(pb.score, 1) + '</td>' +
                '<td class="' + (d > 0 ? 'up' : d < 0 ? 'down' : '') + '">' + (d === null ? '—' : (d >= 0 ? '+' : '') + fmt(d, 1)) + '</td></tr>';
        }).join('');

        return '<h3 class="section-title">Evolução do Score</h3>' +
            '<div class="chart-box"><canvas id="trendChart" height="90"></canvas></div>' +
            '<h3 class="section-title">Comparação entre Períodos</h3>' +
            '<div class="filters-row">' +
            '<label>De <select data-bind="compareA">' + periods.map(function (p) { return '<option value="' + p + '"' + (p === a ? ' selected' : '') + '>' + fmtPeriod(p) + '</option>'; }).join('') + '</select></label>' +
            '<label>Para <select data-bind="compareB">' + periods.map(function (p) { return '<option value="' + p + '"' + (p === b ? ' selected' : '') + '>' + fmtPeriod(p) + '</option>'; }).join('') + '</select></label>' +
            '</div>' +
            '<div class="compare-summary">Score Geral: ' + fmt(ra.finalScore, 1) + ' → ' + fmt(rb.finalScore, 1) +
            ' <b class="' + (rb.finalScore >= ra.finalScore ? 'up' : 'down') + '">(' + (rb.finalScore >= ra.finalScore ? '+' : '') + fmt(E.round2(rb.finalScore - ra.finalScore), 1) + ' pts)</b></div>' +
            '<table class="data-table"><thead><tr><th>Pilar</th><th>' + fmtPeriod(a) + '</th><th>' + fmtPeriod(b) + '</th><th>Variação</th></tr></thead><tbody>' + compareRows + '</tbody></table>' +
            '<script id="trendData" type="application/json">' + JSON.stringify({
                labels: periods.map(fmtPeriod),
                overall: periods.map(function (p) { return histByPeriod[p].finalScore; }),
                pillars: db.pillars.filter(function (pl) { return pl.active; }).map(function (pl) {
                    return { name: pl.name, data: periods.map(function (p) { return histByPeriod[p].pillarResults.filter(function (x) { return x.pillar.id === pl.id; })[0].score; }) };
                })
            }) + '</\script>';
    }

    function drawTrendChart() {
        var canvas = document.getElementById('trendChart');
        if (!canvas || !global.Chart) return;
        var data = JSON.parse(document.getElementById('trendData').textContent);
        if (chartRefs.trend) chartRefs.trend.destroy();
        var palette = ['#0052CC', '#DD249B', '#00875A', '#FFAB00', '#6554C0', '#FF5630'];
        chartRefs.trend = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{ label: 'Score Geral', data: data.overall, borderColor: '#172B4D', backgroundColor: 'rgba(23,43,77,0.08)', borderWidth: 3, tension: 0.3, fill: true }]
                    .concat(data.pillars.map(function (p, i) {
                        return { label: p.name, data: p.data, borderColor: palette[i % palette.length], borderDash: [4, 3], borderWidth: 1.5, tension: 0.3, pointRadius: 2 };
                    }))
            },
            options: { responsive: true, scales: { y: { min: 0, max: 100 } }, plugins: { legend: { position: 'bottom' } } }
        });
    }

    // ---------------------------------------------------------- simulador
    function renderSimulador() {
        var period = currentPeriod();
        var baseline = runCalculation(period, state.serviceId);
        var simulated = runCalculation(period, state.serviceId, state.simOverrides, state.simSignals);
        var delta = E.round2(simulated.finalScore - baseline.finalScore);

        var kpiRows = db.kpis.filter(function (k) { return k.active; }).map(function (kpi) {
            var pillar = pillarById(kpi.pillarId);
            var baseValue = buildCalcParams(period, state.serviceId).valuesByKpi[kpi.id];
            var simValue = state.simOverrides.hasOwnProperty(kpi.id) ? state.simOverrides[kpi.id] : baseValue;
            return '<tr><td>' + escapeHtml(pillar.name) + '</td><td>' + escapeHtml(kpi.name) + '</td>' +
                '<td>' + (baseValue === null || baseValue === undefined ? '—' : fmt(baseValue, 2)) + ' ' + escapeHtml(kpi.unit) + '</td>' +
                '<td><input type="number" step="any" class="sim-input" data-kpi-id="' + kpi.id + '" value="' + (simValue === null || simValue === undefined ? '' : simValue) + '" placeholder="simular..."></td></tr>';
        }).join('');

        var signals = ['p1IncidentsActive', 'criticalUnavailability', 'changeCriticalFailure'];
        var signalLabels = { p1IncidentsActive: 'E se ocorrer um incidente P1?', criticalUnavailability: 'E se houver indisponibilidade crítica?', changeCriticalFailure: 'E se uma mudança crítica falhar?' };
        var signalsHtml = signals.map(function (s) {
            var checked = state.simSignals[s] ? 'checked' : '';
            return '<label class="check"><input type="checkbox" class="sim-signal" data-signal="' + s + '" ' + checked + '> ' + signalLabels[s] + '</label>';
        }).join('');

        return '<h3 class="section-title">Simulador de Cenários</h3>' +
            '<p class="muted">Altere valores de KPI ou ative penalidades para ver o impacto no Score sem afetar os dados reais.</p>' +
            '<div class="sim-summary">' +
            '<div class="sim-box"><span>Score atual</span><b>' + fmt(baseline.finalScore, 1) + '</b></div>' +
            '<div class="sim-box"><span>Score simulado</span><b>' + fmt(simulated.finalScore, 1) + '</b></div>' +
            '<div class="sim-box"><span>Impacto</span><b class="' + (delta >= 0 ? 'up' : 'down') + '">' + (delta >= 0 ? '+' : '') + fmt(delta, 1) + ' pts</b></div>' +
            '<button class="btn btn-secondary" data-action="sim-reset">Restaurar</button>' +
            '</div>' +
            '<div class="sim-signals">' + signalsHtml + '</div>' +
            '<table class="data-table"><thead><tr><th>Pilar</th><th>KPI</th><th>Valor Real</th><th>Simular</th></tr></thead><tbody>' + kpiRows + '</tbody></table>';
    }

    // -------------------------------------------------------------- dados
    function renderDados() {
        if (!canEnterData()) return '<div class="banner banner-error">Seu perfil (' + role() + ') não tem permissão para inserir dados.</div>';

        var period = currentPeriod();
        var pillarOptions = db.pillars.filter(function (p) { return p.active; }).map(function (p) { return '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>'; }).join('');
        var recent = db.kpi_values.slice(-15).reverse().map(function (v) {
            var kpi = kpiById(v.kpiId) || {};
            return '<tr><td>' + fmtPeriod(v.period) + '</td><td>' + escapeHtml(kpi.name) + '</td><td>' + fmt(v.value, 2) + ' ' + escapeHtml(kpi.unit) + '</td>' +
                '<td>' + escapeHtml(v.serviceId ? (serviceById(v.serviceId) || {}).name : 'Geral') + '</td><td>' + escapeHtml(v.source) + '</td></tr>';
        }).join('');

        var sig = null;
        db.period_signals.forEach(function (s) { if (s.period === period && (state.serviceId ? s.serviceId === state.serviceId : !s.serviceId)) sig = s; });
        sig = sig || {};

        var importsRows = db.imports.slice(-8).reverse().map(function (im) {
            return '<tr><td>' + escapeHtml(im.filename) + '</td><td>' + im.rows + '</td><td>' + im.errors + '</td><td>' + new Date(im.importedAt).toLocaleString('pt-BR') + '</td></tr>';
        }).join('');

        return '<h3 class="section-title">Entrada Manual de Dados</h3>' +
            '<form id="manualForm" class="form-grid">' +
            '<label>Período <input type="month" name="period" value="' + period + '" required></label>' +
            '<label>Pilar <select name="pillarId" id="pillarSelect" required><option value="">Selecione...</option>' + pillarOptions + '</select></label>' +
            '<label>KPI <select name="kpiId" id="kpiSelect" required><option value="">Selecione o pilar primeiro</option></select></label>' +
            '<label>Valor <input type="number" step="any" name="value" required></label>' +
            '<label>Serviço (opcional) <select name="serviceId"><option value="">Operação geral</option>' +
            db.services.filter(function (s) { return s.active; }).map(function (s) { return '<option value="' + s.id + '">' + escapeHtml(s.name) + '</option>'; }).join('') + '</select></label>' +
            '<label class="wide">Observação <input type="text" name="observation" placeholder="opcional"></label>' +
            '<button class="btn btn-primary" type="submit">Salvar valor</button>' +
            '</form>' +

            '<h3 class="section-title">Sinalizadores do Período (' + fmtPeriod(period) + ')</h3>' +
            '<form id="signalsForm" class="sim-signals">' +
            '<label class="check"><input type="checkbox" name="p1IncidentsActive" ' + (sig.p1IncidentsActive ? 'checked' : '') + '> Incidente P1 ativo</label>' +
            '<label class="check"><input type="checkbox" name="criticalUnavailability" ' + (sig.criticalUnavailability ? 'checked' : '') + '> Indisponibilidade crítica</label>' +
            '<label class="check"><input type="checkbox" name="changeCriticalFailure" ' + (sig.changeCriticalFailure ? 'checked' : '') + '> Mudança crítica com falha</label>' +
            '<button class="btn btn-secondary" type="submit">Salvar sinalizadores</button>' +
            '</form>' +

            '<h3 class="section-title">Importação de CSV</h3>' +
            '<p class="muted">Colunas esperadas: Data, Pilar, KPI, Valor, Unidade, Sistema ou Serviço, Observação.</p>' +
            '<input type="file" id="csvFile" accept=".csv">' +
            '<div id="csvPreview"></div>' +
            '<table class="data-table"><thead><tr><th>Arquivo</th><th>Linhas</th><th>Erros</th><th>Importado em</th></tr></thead><tbody>' + importsRows + '</tbody></table>' +

            '<h3 class="section-title">Últimos valores registrados</h3>' +
            '<table class="data-table"><thead><tr><th>Período</th><th>KPI</th><th>Valor</th><th>Escopo</th><th>Origem</th></tr></thead><tbody>' + recent + '</tbody></table>';
    }

    function fillKpiSelect(pillarId) {
        var sel = document.getElementById('kpiSelect');
        if (!sel) return;
        var kpis = db.kpis.filter(function (k) { return k.pillarId === pillarId && k.active; });
        sel.innerHTML = kpis.map(function (k) { return '<option value="' + k.id + '">' + escapeHtml(k.name) + ' (' + escapeHtml(k.unit) + ')</option>'; }).join('');
    }

    function parseCsv(text) {
        var rows = [], field = '', row = [], inQuotes = false, i = 0;
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        while (i < text.length) {
            var c = text[i];
            if (inQuotes) {
                if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQuotes = false; i++; continue; }
                field += c; i++; continue;
            }
            if (c === '"') { inQuotes = true; i++; continue; }
            if (c === ',') { row.push(field); field = ''; i++; continue; }
            if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
            field += c; i++;
        }
        if (field.length || row.length) { row.push(field); rows.push(row); }
        return rows.filter(function (r) { return r.length > 1 || (r[0] || '').trim() !== ''; });
    }

    function parseDateToPeriod(raw) {
        raw = (raw || '').trim();
        var m1 = raw.match(/^(\d{4})-(\d{2})$/);
        if (m1) return raw;
        var m2 = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m2) return m2[1] + '-' + m2[2];
        var m3 = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m3) return m3[3] + '-' + m3[2];
        return null;
    }

    function validateCsvRows(rows) {
        if (!rows.length) return { errors: [{ row: 0, msg: 'Arquivo vazio.' }], valid: [] };
        var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
        var idx = {
            data: header.indexOf('data'), pilar: header.indexOf('pilar'), kpi: header.indexOf('kpi'),
            valor: header.indexOf('valor'), unidade: header.indexOf('unidade'),
            servico: header.indexOf('sistema ou serviço') >= 0 ? header.indexOf('sistema ou serviço') : header.indexOf('sistema ou servico'),
            obs: header.indexOf('observação') >= 0 ? header.indexOf('observação') : header.indexOf('observacao')
        };
        var missing = ['data', 'pilar', 'kpi', 'valor'].filter(function (k) { return idx[k] < 0; });
        if (missing.length) return { errors: [{ row: 1, msg: 'Colunas obrigatórias ausentes no cabeçalho: ' + missing.join(', ') }], valid: [] };

        var errors = [], valid = [];
        for (var r = 1; r < rows.length; r++) {
            var row = rows[r];
            if (!row || !row.length || (row.length === 1 && !row[0].trim())) continue;
            var rowNum = r + 1;
            var period = parseDateToPeriod(row[idx.data]);
            if (!period) { errors.push({ row: rowNum, msg: 'Data inválida: "' + row[idx.data] + '" (use AAAA-MM, AAAA-MM-DD ou DD/MM/AAAA).' }); continue; }

            var pillarName = (row[idx.pilar] || '').trim();
            var pillar = db.pillars.filter(function (p) { return p.name.toLowerCase() === pillarName.toLowerCase(); })[0];
            if (!pillar) { errors.push({ row: rowNum, msg: 'Pilar não encontrado: "' + pillarName + '".' }); continue; }

            var kpiName = (row[idx.kpi] || '').trim();
            var kpi = db.kpis.filter(function (k) { return k.pillarId === pillar.id && k.name.toLowerCase() === kpiName.toLowerCase(); })[0];
            if (!kpi) { errors.push({ row: rowNum, msg: 'KPI não encontrado no pilar "' + pillarName + '": "' + kpiName + '".' }); continue; }

            var rawValue = (row[idx.valor] || '').trim().replace(',', '.');
            var value = Number(rawValue);
            if (rawValue === '' || isNaN(value)) { errors.push({ row: rowNum, msg: 'Valor inválido: "' + row[idx.valor] + '".' }); continue; }

            var serviceName = idx.servico >= 0 ? (row[idx.servico] || '').trim() : '';
            var service = serviceName ? db.services.filter(function (s) { return s.name.toLowerCase() === serviceName.toLowerCase(); })[0] : null;
            if (serviceName && !service) { errors.push({ row: rowNum, msg: 'Serviço não encontrado: "' + serviceName + '".' }); continue; }

            valid.push({ kpiId: kpi.id, period: period, value: value, serviceId: service ? service.id : null, observation: idx.obs >= 0 ? (row[idx.obs] || '') : '' });
        }
        return { errors: errors, valid: valid };
    }

    // ------------------------------------------------------------ serviços
    function renderServicos() {
        var period = currentPeriod();
        var cw = {}; db.criticality_weights.forEach(function (c) { cw[c.level] = c.multiplier; });

        var totalWeighted = 0, totalMultiplier = 0;
        var cards = db.services.filter(function (s) { return s.active; }).map(function (s) {
            var r = runCalculation(period, s.id);
            var mult = cw[s.criticality] || 1;
            var noData = r.dataCompleteness === 0;
            if (r.dataCompleteness > 0) { totalWeighted += r.finalScore * mult; totalMultiplier += mult; }
            var cls = noData ? { label: 'SEM DADOS', color: '#97A0AF' } : E.classify(r.finalScore, db.classification_ranges);
            return '<div class="service-card2">' +
                '<div class="service-card2-top"><b>' + escapeHtml(s.name) + '</b><span class="crit-badge crit-' + s.criticality + '">' + s.criticality + ' ×' + mult + '</span></div>' +
                '<div class="service-score" style="color:' + cls.color + '">' + (noData ? '—' : fmt(r.finalScore, 1)) + '</div>' +
                '<div class="muted">' + cls.label + ' · ' + escapeHtml(s.category) + ' · ' + escapeHtml(s.environment) + ' · dono: ' + escapeHtml(s.owner) + '</div>' +
                (!noData && r.dataCompleteness < 50 ? '<div class="pill-note">⚠ dados parciais neste período</div>' : '') +
                (canEdit() ? '<button class="btn btn-link" data-action="delete-service" data-id="' + s.id + '">Remover</button>' : '') +
                '</div>';
        }).join('');

        var weightedScore = totalMultiplier > 0 ? E.round2(totalWeighted / totalMultiplier) : null;

        return '<h3 class="section-title">Score por Serviço (' + fmtPeriod(period) + ')</h3>' +
            (weightedScore !== null ? '<div class="banner banner-info">Score da Operação ponderado por criticidade: <b>' + fmt(weightedScore, 1) + '</b> (usa os multiplicadores P1–P4 configuráveis em Configurações → Criticidade)</div>' : '') +
            '<div class="services-grid">' + cards + '</div>' +
            (canEdit() ? '<h3 class="section-title">Novo Serviço</h3>' +
                '<form id="serviceForm" class="form-grid">' +
                '<label>Nome <input type="text" name="name" required></label>' +
                '<label>Criticidade <select name="criticality">' + db.criticality_weights.map(function (c) { return '<option value="' + c.level + '">' + c.level + ' — ' + c.label + '</option>'; }).join('') + '</select></label>' +
                '<label>Proprietário <input type="text" name="owner"></label>' +
                '<label>Categoria <input type="text" name="category"></label>' +
                '<label>Ambiente <input type="text" name="environment" value="Produção"></label>' +
                '<button class="btn btn-primary" type="submit">Adicionar serviço</button>' +
                '</form>' : '');
    }

    // ------------------------------------------------------------- alertas
    function renderAlertas() {
        var items = db.alerts.slice(0, 100).map(function (a) {
            return '<div class="alert-item sev-' + a.severity + '">' +
                '<div class="alert-msg">' + escapeHtml(a.message) + '</div>' +
                '<div class="alert-meta">' + new Date(a.createdAt).toLocaleString('pt-BR') + (a.resolved ? ' · resolvido' : '') + '</div>' +
                (!a.resolved ? '<button class="btn btn-link" data-action="resolve-alert" data-id="' + a.id + '">Marcar como resolvido</button>' : '') +
                '</div>';
        }).join('');
        return '<h3 class="section-title">Alertas</h3>' + (items ? '<div class="alerts-list">' + items + '</div>' : '<p class="muted">Nenhum alerta registrado.</p>');
    }

    // ------------------------------------------------------- metodologia
    function directionLabel(dir) { return dir === 'higher' ? 'Quanto MAIOR, melhor' : 'Quanto MENOR, melhor'; }
    function directionFormula(dir) {
        return dir === 'higher'
            ? 'Score = (Valor Atual ÷ Meta) × 100'
            : 'Score = (Meta ÷ Valor Atual) × 100 &nbsp;·&nbsp; valor = 0 → Score 100';
    }

    function renderMetodologia() {
        var pillarRows = db.pillars.filter(function (p) { return p.active; }).map(function (p) {
            return '<tr><td>' + escapeHtml(p.name) + '</td><td>' + fmt(p.weight, 0) + '%</td>' +
                '<td>' + db.kpis.filter(function (k) { return k.pillarId === p.id && k.active; }).length + ' KPI(s) ativo(s)</td></tr>';
        }).join('');

        var kpiSections = db.pillars.filter(function (p) { return p.active; }).map(function (pillar) {
            var rows = db.kpis.filter(function (k) { return k.pillarId === pillar.id && k.active; }).map(function (k) {
                return '<tr><td>' + escapeHtml(k.name) + '</td><td>' + directionLabel(k.direction) + '</td>' +
                    '<td>' + fmt(k.target, 2) + ' ' + escapeHtml(k.unit) + '</td><td>' + fmt(k.weightInPillar, 0) + '%</td></tr>';
            }).join('');
            return '<h4 class="section-title">' + escapeHtml(pillar.name) + ' <span class="muted">(peso ' + fmt(pillar.weight, 0) + '% do Score Geral)</span></h4>' +
                '<div class="formula-box">' + directionFormula('higher') + ' <span class="muted" style="color:#B3BAC5">— KPIs que sobem</span><br>' + directionFormula('lower') + ' <span class="muted" style="color:#B3BAC5">— KPIs que descem</span></div>' +
                '<table class="data-table"><thead><tr><th>KPI</th><th>Direção</th><th>Meta</th><th>Peso no pilar</th></tr></thead><tbody>' + rows + '</tbody></table>';
        }).join('');

        var penaltyRows = db.penalty_rules.filter(function (r) { return r.active; }).map(function (r) {
            return '<tr><td>' + escapeHtml(r.name) + '</td><td>' + escapeHtml(r.description) + '</td><td><b>-' + fmt(r.points, 0) + ' pts</b></td></tr>';
        }).join('');

        var legend = (db.classification_ranges || []).map(function (r) {
            return '<div class="legend-chip"><span class="legend-dot" style="background:' + r.color + '"></span>' + escapeHtml(r.label) + ' (' + fmt(r.min, 0) + '–' + fmt(r.max, 0) + ')</div>';
        }).join('');

        var critRows = db.criticality_weights.map(function (c) {
            return '<tr><td>' + c.level + ' — ' + escapeHtml(c.label) + '</td><td>×' + fmt(c.multiplier, 1) + '</td></tr>';
        }).join('');

        return '<h3 class="section-title">Como o Score de Operações é calculado</h3>' +
            '<p class="muted">Esta página é gerada automaticamente a partir da configuração atual do sistema — se pesos, metas ou penalidades mudarem em Configurações, esta explicação muda junto.</p>' +

            '<h4 class="section-title">1. Fórmula geral</h4>' +
            '<div class="formula-box">' +
            'SCORE FINAL &nbsp;=&nbsp; <b>SCORE GERAL BRUTO</b> &nbsp;−&nbsp; <b>PENALIDADES ATIVAS</b><br>' +
            '<span class="muted" style="color:#B3BAC5">(sempre limitado entre 0 e 100 — nunca fica negativo nem passa de 100)</span>' +
            '</div>' +

            '<h4 class="section-title">2. Score Geral Bruto = soma ponderada dos Pilares</h4>' +
            '<div class="formula-box">SCORE GERAL BRUTO = Σ ( Score do Pilar × Peso do Pilar )</div>' +
            '<table class="data-table"><thead><tr><th>Pilar</th><th>Peso no Score Geral</th><th>Composição</th></tr></thead><tbody>' + pillarRows + '</tbody></table>' +
            '<div class="method-note">Se um pilar não tiver nenhum dado lançado no período, ele é excluído do cálculo (não conta como 0) e o restante é reponderado proporcionalmente — por isso o dashboard mostra "Completude de dados".</div>' +

            '<h4 class="section-title">3. Score do Pilar = soma ponderada dos KPIs daquele pilar</h4>' +
            '<div class="formula-box">SCORE DO PILAR = Σ ( Score do KPI × Peso do KPI no Pilar )</div>' +

            '<h4 class="section-title">4. Normalização de cada KPI (transforma o valor real em um score de 0 a 100)</h4>' +
            kpiSections +

            '<h4 class="section-title">5. Penalidades ativas (descontadas do Score Bruto)</h4>' +
            (penaltyRows ? '<table class="data-table"><thead><tr><th>Regra</th><th>Condição</th><th>Desconto</th></tr></thead><tbody>' + penaltyRows + '</tbody></table>' : '<p class="muted">Nenhuma penalidade ativa configurada.</p>') +

            '<h4 class="section-title">6. Classificação final</h4>' +
            '<div class="legend-strip">' + legend + '</div>' +

            '<h4 class="section-title">7. Score por Serviço, ponderado por criticidade</h4>' +
            '<p class="muted">Cada serviço tem seu próprio Score (mesma fórmula acima, usando só os dados daquele serviço). O "Score da Operação ponderado por criticidade" (aba Serviços) é a média dos scores de todos os serviços, dando mais peso aos mais críticos:</p>' +
            '<table class="data-table"><thead><tr><th>Criticidade</th><th>Multiplicador</th></tr></thead><tbody>' + critRows + '</tbody></table>' +

            '<h4 class="section-title">8. Rastreabilidade</h4>' +
            '<p class="muted">Todo cálculo salvo (botão "Calcular Agora", ou automaticamente após um novo dado/importação/alteração de configuração) grava um snapshot completo — valor, meta, peso e score de cada KPI usado — acessível depois em Configurações → Auditoria e no histórico de Tendência. Nada é recalculado silenciosamente sem deixar rastro.</p>';
    }

    // ----------------------------------------------------------- config
    function renderConfig() {
        var tabs = [
            ['pilares', 'Pilares'], ['kpis', 'KPIs'], ['penalidades', 'Penalidades'],
            ['classificacao', 'Classificação'], ['criticidade', 'Criticidade'],
            ['integracoes', 'Integrações'], ['auditoria', 'Auditoria'], ['testes', 'Testes'], ['backup', 'Backup']
        ];
        var nav = '<div class="subtabs">' + tabs.map(function (t) {
            return '<button class="subtab' + (state.configTab === t[0] ? ' active' : '') + '" data-action="config-tab" data-config-tab="' + t[0] + '">' + t[1] + '</button>';
        }).join('') + '</div>';

        var fns = {
            pilares: renderConfigPilares, kpis: renderConfigKpis, penalidades: renderConfigPenalidades,
            classificacao: renderConfigClassificacao, criticidade: renderConfigCriticidade,
            integracoes: renderConfigIntegracoes, auditoria: renderConfigAuditoria, testes: renderConfigTestes, backup: renderConfigBackup
        };
        var readonlyBanner = !canEdit() ? '<div class="banner banner-info">Seu perfil (' + role() + ') está em modo somente leitura nas configurações.</div>' : '';
        return '<h3 class="section-title">Configurações</h3>' + nav + readonlyBanner + (fns[state.configTab] || renderConfigPilares)();
    }

    function renderConfigPilares() {
        var check = E.validateWeightsSum100(db.pillars.filter(function (p) { return p.active; }), 'weight');
        var rows = db.pillars.map(function (p) {
            return '<tr><td>' + escapeHtml(p.name) + '</td>' +
                '<td><input type="number" class="pillar-weight-input" data-id="' + p.id + '" value="' + p.weight + '" ' + (canEdit() ? '' : 'disabled') + ' style="width:70px"> %</td>' +
                '<td><label class="check"><input type="checkbox" class="pillar-active-toggle" data-id="' + p.id + '" ' + (p.active ? 'checked' : '') + ' ' + (canEdit() ? '' : 'disabled') + '> ativo</label></td>' +
                '<td><button class="btn btn-link" data-action="show-pillar-history" data-id="' + p.id + '">histórico</button></td></tr>';
        }).join('');
        return '<div class="banner ' + (check.valid ? 'banner-info' : 'banner-error') + '">Soma dos pesos (pilares ativos): <b>' + fmt(check.sum, 2) + '%</b> ' + (check.valid ? '✓' : '— precisa somar 100%') + '</div>' +
            '<table class="data-table"><thead><tr><th>Pilar</th><th>Peso</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' +
            (canEdit() ? '<button class="btn btn-primary" data-action="save-pillar-weights">Salvar pesos</button>' +
                '<h4 class="section-title">Novo Pilar</h4><form id="pillarForm" class="form-grid">' +
                '<label>Nome <input type="text" name="name" required></label>' +
                '<label>Peso (%) <input type="number" name="weight" value="0" required></label>' +
                '<button class="btn btn-primary" type="submit">Adicionar pilar</button></form>' : '') +
            '<div id="pillarHistoryBox"></div>';
    }

    function renderConfigKpis() {
        var html = db.pillars.map(function (pillar) {
            var kpis = db.kpis.filter(function (k) { return k.pillarId === pillar.id; });
            var check = E.validateWeightsSum100(kpis.filter(function (k) { return k.active; }), 'weightInPillar');
            var rows = kpis.map(function (k) {
                return '<tr><td>' + escapeHtml(k.name) + '</td><td>' + (k.direction === 'higher' ? '↑' : '↓') + '</td>' +
                    '<td><input type="number" step="any" class="kpi-target-input" data-id="' + k.id + '" value="' + k.target + '" ' + (canEdit() ? '' : 'disabled') + ' style="width:70px"> ' + escapeHtml(k.unit) + '</td>' +
                    '<td><input type="number" class="kpi-weight-input" data-id="' + k.id + '" value="' + k.weightInPillar + '" ' + (canEdit() ? '' : 'disabled') + ' style="width:60px"> %</td>' +
                    '<td><label class="check"><input type="checkbox" class="kpi-active-toggle" data-id="' + k.id + '" ' + (k.active ? 'checked' : '') + ' ' + (canEdit() ? '' : 'disabled') + '> ativo</label></td></tr>';
            }).join('');
            return '<h4 class="section-title">' + escapeHtml(pillar.name) + ' <span class="' + (check.valid ? 'ok-text' : 'err-text') + '">(soma dos pesos: ' + fmt(check.sum, 2) + '%)</span></h4>' +
                '<table class="data-table"><thead><tr><th>KPI</th><th>Direção</th><th>Meta</th><th>Peso no pilar</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>';
        }).join('');
        var pillarOptions = db.pillars.map(function (p) { return '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>'; }).join('');
        return html + (canEdit() ? '<button class="btn btn-primary" data-action="save-kpi-config">Salvar KPIs</button>' +
            '<h4 class="section-title">Novo KPI</h4><form id="kpiForm" class="form-grid">' +
            '<label>Pilar <select name="pillarId">' + pillarOptions + '</select></label>' +
            '<label>Nome <input type="text" name="name" required></label>' +
            '<label>Direção <select name="direction"><option value="higher">Quanto maior, melhor</option><option value="lower">Quanto menor, melhor</option></select></label>' +
            '<label>Unidade <input type="text" name="unit" placeholder="%, horas, qtd..."></label>' +
            '<label>Meta <input type="number" step="any" name="target" required></label>' +
            '<label>Peso no pilar (%) <input type="number" name="weightInPillar" value="0" required></label>' +
            '<button class="btn btn-primary" type="submit">Adicionar KPI</button></form>' : '');
    }

    function renderConfigPenalidades() {
        var rows = db.penalty_rules.map(function (p) {
            return '<tr><td>' + escapeHtml(p.name) + '</td><td>' + escapeHtml(p.description) + '</td>' +
                '<td><input type="number" class="penalty-points-input" data-id="' + p.id + '" value="' + p.points + '" ' + (canEdit() ? '' : 'disabled') + ' style="width:60px"></td>' +
                '<td><label class="check"><input type="checkbox" class="penalty-active-toggle" data-id="' + p.id + '" ' + (p.active ? 'checked' : '') + ' ' + (canEdit() ? '' : 'disabled') + '> ativa</label></td></tr>';
        }).join('');
        var kpiOptions = db.kpis.map(function (k) { return '<option value="' + k.key + '">' + escapeHtml(k.name) + '</option>'; }).join('');
        return '<table class="data-table"><thead><tr><th>Regra</th><th>Condição</th><th>Pontos</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            (canEdit() ? '<button class="btn btn-primary" data-action="save-penalties">Salvar penalidades</button>' +
                '<h4 class="section-title">Nova Penalidade (baseada em KPI)</h4><form id="penaltyForm" class="form-grid">' +
                '<label>Nome <input type="text" name="name" required></label>' +
                '<label>Descrição <input type="text" name="description"></label>' +
                '<label>KPI <select name="kpiKey">' + kpiOptions + '</select></label>' +
                '<label>Operador <select name="operator"><option value="<">&lt;</option><option value="<=">&le;</option><option value=">">&gt;</option><option value=">=">&ge;</option><option value="==">=</option></select></label>' +
                '<label>Limite <input type="number" step="any" name="threshold" required></label>' +
                '<label>Pontos descontados <input type="number" name="points" value="10" required></label>' +
                '<button class="btn btn-primary" type="submit">Adicionar penalidade</button></form>' : '');
    }

    function renderConfigClassificacao() {
        var rows = db.classification_ranges.map(function (r, i) {
            return '<tr><td><input type="text" class="cls-label-input" data-idx="' + i + '" value="' + escapeHtml(r.label) + '" ' + (canEdit() ? '' : 'disabled') + '></td>' +
                '<td><input type="number" step="any" class="cls-min-input" data-idx="' + i + '" value="' + r.min + '" ' + (canEdit() ? '' : 'disabled') + ' style="width:70px"></td>' +
                '<td><input type="number" step="any" class="cls-max-input" data-idx="' + i + '" value="' + r.max + '" ' + (canEdit() ? '' : 'disabled') + ' style="width:70px"></td>' +
                '<td><input type="color" class="cls-color-input" data-idx="' + i + '" value="' + r.color + '" ' + (canEdit() ? '' : 'disabled') + '></td></tr>';
        }).join('');
        return '<table class="data-table"><thead><tr><th>Classificação</th><th>Mín</th><th>Máx</th><th>Cor</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            (canEdit() ? '<button class="btn btn-primary" data-action="save-classification">Salvar classificação</button>' : '');
    }

    function renderConfigCriticidade() {
        var rows = db.criticality_weights.map(function (c, i) {
            return '<tr><td>' + c.level + ' — ' + escapeHtml(c.label) + '</td>' +
                '<td><input type="number" step="0.1" class="crit-mult-input" data-idx="' + i + '" value="' + c.multiplier + '" ' + (canEdit() ? '' : 'disabled') + ' style="width:70px"></td></tr>';
        }).join('');
        return '<table class="data-table"><thead><tr><th>Criticidade</th><th>Peso multiplicador</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            (canEdit() ? '<button class="btn btn-primary" data-action="save-criticality">Salvar multiplicadores</button>' : '');
    }

    function renderConfigIntegracoes() {
        return db.integrations.map(function (integ) {
            var ct = I.getConnectorType(integ.type) || {};
            var fields = (ct.fields || []).map(function (f) {
                var v = integ.config[f.key] || '';
                var type = f.type === 'password' ? 'password' : (f.type === 'textarea' ? 'textarea' : 'text');
                return '<label>' + f.label + (type === 'textarea' ?
                    '<textarea class="integ-field" data-id="' + integ.id + '" data-key="' + f.key + '" ' + (canEdit() ? '' : 'disabled') + '>' + escapeHtml(v) + '</textarea>' :
                    '<input type="' + type + '" class="integ-field" data-id="' + integ.id + '" data-key="' + f.key + '" value="' + escapeHtml(v) + '" ' + (canEdit() ? '' : 'disabled') + '>') + '</label>';
            }).join('');
            return '<div class="integ-card"><h4>' + (ct.icon || '') + ' ' + escapeHtml(integ.name) + ' <span class="status-tag">' + integ.status + '</span></h4>' +
                '<div class="form-grid">' + fields + '</div>' +
                (canEdit() ? '<button class="btn btn-secondary" data-action="save-integration" data-id="' + integ.id + '">Salvar configuração</button> ' +
                    '<button class="btn btn-secondary" data-action="test-integration" data-id="' + integ.id + '">Testar Conexão</button> ' +
                    '<button class="btn btn-secondary" data-action="sync-integration" data-id="' + integ.id + '">Sincronizar</button>' : '') +
                (integ.lastSync ? '<div class="muted">Última sincronização: ' + new Date(integ.lastSync).toLocaleString('pt-BR') + '</div>' : '') +
                '<div class="integ-result" id="integResult-' + integ.id + '"></div></div>';
        }).join('');
    }

    function renderConfigAuditoria() {
        var rows = db.audit_logs.slice(0, 150).map(function (a) {
            return '<tr><td>' + new Date(a.at).toLocaleString('pt-BR') + '</td><td>' + escapeHtml(a.entity) + '</td><td>' + escapeHtml(a.action) + '</td><td>' + escapeHtml(a.entityId || '') + '</td><td>' + escapeHtml(a.user) + '</td></tr>';
        }).join('');
        return '<table class="data-table"><thead><tr><th>Quando</th><th>Entidade</th><th>Ação</th><th>ID</th><th>Usuário</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function renderConfigTestes() {
        return '<button class="btn btn-primary" data-action="run-tests">Executar Testes do Motor de Cálculo</button><div id="testResults"></div>';
    }

    function renderConfigBackup() {
        return '<p class="muted">Todos os dados ficam salvos no navegador (localStorage). Exporte periodicamente para não perder o histórico.</p>' +
            '<button class="btn btn-secondary" data-action="export-json">Exportar JSON</button> ' +
            '<label class="btn btn-secondary" style="cursor:pointer">Importar JSON<input type="file" id="importJsonFile" accept=".json" style="display:none"></label> ' +
            (canEdit() ? '<button class="btn btn-link" data-action="reset-seed">Restaurar dados de exemplo</button>' : '');
    }

    function runTests() {
        var r = global.ScoreTests.run();
        var rows = r.results.map(function (t) {
            return '<tr class="' + (t.pass ? 'ok-text' : 'err-text') + '"><td>' + (t.pass ? '✓' : '✗') + '</td><td>' + escapeHtml(t.name) + '</td><td>' + escapeHtml(t.detail) + '</td></tr>';
        }).join('');
        document.getElementById('testResults').innerHTML =
            '<div class="banner ' + (r.failed === 0 ? 'banner-info' : 'banner-error') + '"><b>' + r.passed + '/' + r.total + '</b> testes passaram</div>' +
            '<table class="data-table"><thead><tr><th></th><th>Teste</th><th>Detalhe</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    // -------------------------------------------------------- chart wiring
    function wireCharts() {
        if (state.tab === 'tendencia') drawTrendChart();
    }

    // ------------------------------------------------------------ events
    function onChangeFilters(e) {
        var bind = e.target.dataset.bind;
        if (!bind) return;
        if (bind === 'period') state.period = e.target.value;
        if (bind === 'serviceId') state.serviceId = e.target.value || null;
        if (bind === 'role') { db.meta.currentUser.role = e.target.value; persist(); }
        render();
    }

    function handleAction(e) {
        var target = e.target.closest('[data-action]');
        if (!target) return;
        var action = target.dataset.action;

        if (action === 'open-pillar') { openPillarModal(target.dataset.pillarId); return; }
        if (action === 'goto-metodologia') { state.tab = 'metodologia'; render(); return; }
        if (action === 'close-modal') { document.getElementById('pillarModal').classList.remove('open'); return; }
        if (action === 'calc-now') {
            var result = runCalculation(currentPeriod(), state.serviceId);
            if (!result.canPublish) { toast('Não é possível publicar: some 100% os pesos primeiro.', 'error'); return; }
            persistCalculation(currentPeriod(), state.serviceId, result, 'manual');
            toast('Score calculado e salvo no histórico.');
            render();
            return;
        }
        if (action === 'config-tab') { state.configTab = target.dataset.configTab; render(); return; }
        if (action === 'sim-reset') { state.simOverrides = {}; state.simSignals = {}; render(); return; }
        if (action === 'delete-service') {
            if (!canEdit()) return;
            var before = db.services.slice();
            db.services = db.services.filter(function (s) { return s.id !== target.dataset.id; });
            S.audit(db, 'service', target.dataset.id, 'delete', before, null); persist(); render();
            return;
        }
        if (action === 'resolve-alert') {
            db.alerts.forEach(function (a) { if (a.id === target.dataset.id) a.resolved = true; });
            persist(); render();
            return;
        }
        if (action === 'save-pillar-weights') { savePillarWeights(); return; }
        if (action === 'save-kpi-config') { saveKpiConfig(); return; }
        if (action === 'save-penalties') { savePenalties(); return; }
        if (action === 'save-classification') { saveClassification(); return; }
        if (action === 'save-criticality') { saveCriticality(); return; }
        if (action === 'save-integration') { saveIntegration(target.dataset.id); return; }
        if (action === 'test-integration') { testIntegration(target.dataset.id); return; }
        if (action === 'sync-integration') { syncIntegration(target.dataset.id); return; }
        if (action === 'show-pillar-history') { showPillarHistory(target.dataset.id); return; }
        if (action === 'run-tests') { runTests(); return; }
        if (action === 'export-json') { downloadExport(); return; }
        if (action === 'reset-seed') {
            if (!confirm('Isso substitui todos os dados atuais pelos dados de exemplo. Continuar?')) return;
            db = S.resetToSeed(); render(); toast('Dados de exemplo restaurados.');
            return;
        }
    }

    function savePillarWeights() {
        var before = JSON.parse(JSON.stringify(db.pillars));
        document.querySelectorAll('.pillar-weight-input').forEach(function (inp) {
            var p = pillarById(inp.dataset.id);
            if (p) p.weight = Number(inp.value) || 0;
        });
        document.querySelectorAll('.pillar-active-toggle').forEach(function (chk) {
            var p = pillarById(chk.dataset.id);
            if (p) p.active = chk.checked;
        });
        db.pillars.forEach(function (p) {
            db.pillar_weight_history.push({ id: S.uid('pwh'), pillarId: p.id, weight: p.weight, changedAt: S.nowIso(), changedBy: (db.meta.currentUser || {}).name, reason: 'Ajuste manual em Configurações' });
        });
        S.audit(db, 'pillars', null, 'update_weights', before, db.pillars);
        persist(); toast('Pesos dos pilares salvos.');
        autoRecalculate(currentPeriod(), state.serviceId);
        render();
    }

    function saveKpiConfig() {
        var before = JSON.parse(JSON.stringify(db.kpis));
        document.querySelectorAll('.kpi-target-input').forEach(function (inp) { var k = kpiById(inp.dataset.id); if (k) k.target = Number(inp.value); });
        document.querySelectorAll('.kpi-weight-input').forEach(function (inp) { var k = kpiById(inp.dataset.id); if (k) k.weightInPillar = Number(inp.value); });
        document.querySelectorAll('.kpi-active-toggle').forEach(function (chk) { var k = kpiById(chk.dataset.id); if (k) k.active = chk.checked; });
        S.audit(db, 'kpis', null, 'update', before, db.kpis);
        persist(); toast('KPIs salvos.');
        autoRecalculate(currentPeriod(), state.serviceId);
        render();
    }

    function savePenalties() {
        var before = JSON.parse(JSON.stringify(db.penalty_rules));
        document.querySelectorAll('.penalty-points-input').forEach(function (inp) {
            db.penalty_rules.forEach(function (p) { if (p.id === inp.dataset.id) p.points = Math.abs(Number(inp.value) || 0); });
        });
        document.querySelectorAll('.penalty-active-toggle').forEach(function (chk) {
            db.penalty_rules.forEach(function (p) { if (p.id === chk.dataset.id) p.active = chk.checked; });
        });
        S.audit(db, 'penalty_rules', null, 'update', before, db.penalty_rules);
        persist(); toast('Penalidades salvas.');
        autoRecalculate(currentPeriod(), state.serviceId);
        render();
    }

    function saveClassification() {
        var before = JSON.parse(JSON.stringify(db.classification_ranges));
        document.querySelectorAll('.cls-label-input').forEach(function (inp) { db.classification_ranges[inp.dataset.idx].label = inp.value; });
        document.querySelectorAll('.cls-min-input').forEach(function (inp) { db.classification_ranges[inp.dataset.idx].min = Number(inp.value); });
        document.querySelectorAll('.cls-max-input').forEach(function (inp) { db.classification_ranges[inp.dataset.idx].max = Number(inp.value); });
        document.querySelectorAll('.cls-color-input').forEach(function (inp) { db.classification_ranges[inp.dataset.idx].color = inp.value; });
        S.audit(db, 'classification_ranges', null, 'update', before, db.classification_ranges);
        persist(); toast('Faixas de classificação salvas.'); render();
    }

    function saveCriticality() {
        var before = JSON.parse(JSON.stringify(db.criticality_weights));
        document.querySelectorAll('.crit-mult-input').forEach(function (inp) { db.criticality_weights[inp.dataset.idx].multiplier = Number(inp.value) || 1; });
        S.audit(db, 'criticality_weights', null, 'update', before, db.criticality_weights);
        persist(); toast('Multiplicadores de criticidade salvos.'); render();
    }

    function saveIntegration(id) {
        var integ = null; db.integrations.forEach(function (i) { if (i.id === id) integ = i; });
        if (!integ) return;
        document.querySelectorAll('.integ-field[data-id="' + id + '"]').forEach(function (f) { integ.config[f.dataset.key] = f.value; });
        integ.status = 'configured';
        S.audit(db, 'integrations', id, 'update_config', null, integ.config);
        persist(); toast('Configuração da integração salva.'); render();
    }

    function testIntegration(id) {
        var integ = null; db.integrations.forEach(function (i) { if (i.id === id) integ = i; });
        if (!integ) return;
        var box = document.getElementById('integResult-' + id);
        box.textContent = 'Testando...';
        I.testConnection(integ).then(function (res) {
            box.innerHTML = '<span class="' + (res.ok ? 'ok-text' : 'muted') + '">' + escapeHtml(res.message) + '</span>';
        });
    }

    function syncIntegration(id) {
        var integ = null; db.integrations.forEach(function (i) { if (i.id === id) integ = i; });
        if (!integ) return;
        var box = document.getElementById('integResult-' + id);
        box.textContent = 'Sincronizando...';
        I.sync(integ).then(function (res) {
            integ.lastSync = res.at;
            db.imports.push({ id: S.uid('imp'), filename: '(integração: ' + integ.name + ')', rows: res.rowsImported, errors: 0, importedAt: res.at, importedBy: (db.meta.currentUser || {}).name, status: 'stub' });
            S.audit(db, 'integrations', id, 'sync', null, res);
            persist();
            box.innerHTML = '<span class="muted">' + escapeHtml(res.message) + '</span>';
        });
    }

    function showPillarHistory(pillarId) {
        var items = db.pillar_weight_history.filter(function (h) { return h.pillarId === pillarId; }).slice(-10).reverse();
        var box = document.getElementById('pillarHistoryBox');
        if (!items.length) { box.innerHTML = '<p class="muted">Sem histórico de alterações para este pilar ainda.</p>'; return; }
        box.innerHTML = '<table class="data-table"><thead><tr><th>Peso</th><th>Alterado em</th><th>Por</th></tr></thead><tbody>' +
            items.map(function (h) { return '<tr><td>' + fmt(h.weight, 0) + '%</td><td>' + new Date(h.changedAt).toLocaleString('pt-BR') + '</td><td>' + escapeHtml(h.changedBy) + '</td></tr>'; }).join('') + '</tbody></table>';
    }

    function downloadExport() {
        var blob = new Blob([S.exportJson()], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'ofb-score-backup-' + currentMonthPeriod() + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // -------------------------------------------------------------- init
    function init() {
        document.getElementById('tabs').addEventListener('click', function (e) {
            var t = e.target.closest('.tab');
            if (!t) return;
            state.tab = t.dataset.tab;
            render();
        });
        document.getElementById('filters').addEventListener('change', onChangeFilters);
        document.getElementById('view').addEventListener('click', handleAction);
        document.getElementById('view').addEventListener('change', function (e) {
            if (e.target.id === 'pillarSelect') { fillKpiSelect(e.target.value); return; }
            if (e.target.dataset.bind === 'compareA') { state.compareA = e.target.value; render(); return; }
            if (e.target.dataset.bind === 'compareB') { state.compareB = e.target.value; render(); return; }
            if (e.target.classList.contains('sim-input')) {
                var v = e.target.value === '' ? null : Number(e.target.value);
                if (v === null) delete state.simOverrides[e.target.dataset.kpiId]; else state.simOverrides[e.target.dataset.kpiId] = v;
                render();
                return;
            }
            if (e.target.classList.contains('sim-signal')) {
                state.simSignals[e.target.dataset.signal] = e.target.checked;
                render();
                return;
            }
            if (e.target.id === 'csvFile') { handleCsvSelected(e.target.files[0]); return; }
            if (e.target.id === 'importJsonFile') { handleJsonImport(e.target.files[0]); return; }
        });
        document.getElementById('view').addEventListener('submit', function (e) {
            e.preventDefault();
            if (e.target.id === 'manualForm') return submitManualForm(e.target);
            if (e.target.id === 'signalsForm') return submitSignalsForm(e.target);
            if (e.target.id === 'serviceForm') return submitServiceForm(e.target);
            if (e.target.id === 'pillarForm') return submitPillarForm(e.target);
            if (e.target.id === 'kpiForm') return submitKpiForm(e.target);
            if (e.target.id === 'penaltyForm') return submitPenaltyForm(e.target);
        });
        render();
    }

    function submitManualForm(form) {
        var fd = new FormData(form);
        var period = parseDateToPeriod(fd.get('period')) || fd.get('period');
        var kpiId = fd.get('kpiId'), value = Number(fd.get('value')), serviceId = fd.get('serviceId') || null;
        if (!kpiId || isNaN(value)) { toast('Preencha KPI e valor.', 'error'); return; }
        db.kpi_values.push({ id: S.uid('kv'), kpiId: kpiId, period: period, periodType: 'monthly', value: value, serviceId: serviceId, observation: fd.get('observation') || '', source: 'manual', createdAt: S.nowIso(), createdBy: (db.meta.currentUser || {}).name });
        S.audit(db, 'kpi_values', kpiId, 'create', null, { period: period, value: value, serviceId: serviceId });
        persist(); toast('Valor registrado.');
        autoRecalculate(period, serviceId);
        state.period = period; state.serviceId = serviceId;
        render();
    }

    function submitSignalsForm(form) {
        var fd = new FormData(form);
        var period = currentPeriod();
        var existing = null;
        db.period_signals.forEach(function (s) { if (s.period === period && (state.serviceId ? s.serviceId === state.serviceId : !s.serviceId)) existing = s; });
        var payload = { p1IncidentsActive: fd.get('p1IncidentsActive') ? 1 : 0, criticalUnavailability: !!fd.get('criticalUnavailability'), changeCriticalFailure: !!fd.get('changeCriticalFailure') };
        if (existing) Object.assign(existing, payload);
        else db.period_signals.push(Object.assign({ id: S.uid('sig'), period: period, serviceId: state.serviceId || null }, payload));
        S.audit(db, 'period_signals', null, 'update', null, payload);
        persist(); toast('Sinalizadores salvos.');
        autoRecalculate(period, state.serviceId);
        render();
    }

    function submitServiceForm(form) {
        var fd = new FormData(form);
        var service = { id: S.uid('svc'), name: fd.get('name'), criticality: fd.get('criticality'), owner: fd.get('owner') || '', category: fd.get('category') || '', environment: fd.get('environment') || 'Produção', active: true };
        db.services.push(service);
        S.audit(db, 'services', service.id, 'create', null, service);
        persist(); toast('Serviço adicionado.'); render();
    }

    function submitPillarForm(form) {
        var fd = new FormData(form);
        var pillar = { id: S.uid('pilar'), key: (fd.get('name') || '').toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: fd.get('name'), weight: Number(fd.get('weight')) || 0, active: true, order: db.pillars.length + 1 };
        db.pillars.push(pillar);
        S.audit(db, 'pillars', pillar.id, 'create', null, pillar);
        persist(); toast('Pilar adicionado. Ajuste os pesos para somarem 100%.'); render();
    }

    function submitKpiForm(form) {
        var fd = new FormData(form);
        var kpi = {
            id: S.uid('kpi'), pillarId: fd.get('pillarId'), key: (fd.get('name') || '').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
            name: fd.get('name'), direction: fd.get('direction'), unit: fd.get('unit') || '',
            target: Number(fd.get('target')), weightInPillar: Number(fd.get('weightInPillar')) || 0, active: true, period: 'monthly'
        };
        db.kpis.push(kpi);
        S.audit(db, 'kpis', kpi.id, 'create', null, kpi);
        persist(); toast('KPI adicionado. Ajuste os pesos do pilar para somarem 100%.'); render();
    }

    function submitPenaltyForm(form) {
        var fd = new FormData(form);
        var rule = {
            id: S.uid('pr'), name: fd.get('name'), description: fd.get('description') || '', type: 'kpi_threshold',
            points: Math.abs(Number(fd.get('points')) || 0), priority: db.penalty_rules.length + 1, active: true,
            params: { kpiKey: fd.get('kpiKey'), operator: fd.get('operator'), threshold: Number(fd.get('threshold')) }
        };
        db.penalty_rules.push(rule);
        S.audit(db, 'penalty_rules', rule.id, 'create', null, rule);
        persist(); toast('Penalidade adicionada.');
        autoRecalculate(currentPeriod(), state.serviceId);
        render();
    }

    function handleCsvSelected(file) {
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
            var rows = parseCsv(String(reader.result));
            var result = validateCsvRows(rows);
            state._csvResult = result;
            var box = document.getElementById('csvPreview');
            var errRows = result.errors.map(function (e) { return '<tr class="err-text"><td>' + e.row + '</td><td>' + escapeHtml(e.msg) + '</td></tr>'; }).join('');
            box.innerHTML =
                '<div class="banner ' + (result.errors.length ? 'banner-error' : 'banner-info') + '">' + result.valid.length + ' linha(s) válida(s), ' + result.errors.length + ' com erro.</div>' +
                (result.errors.length ? '<table class="data-table"><thead><tr><th>Linha</th><th>Erro</th></tr></thead><tbody>' + errRows + '</tbody></table>' : '') +
                (result.valid.length ? '<button class="btn btn-primary" data-action="confirm-import" id="confirmImportBtn">Confirmar Importação (' + result.valid.length + ' linhas)</button>' : '');
            var btn = document.getElementById('confirmImportBtn');
            if (btn) btn.onclick = function () { commitCsvImport(file.name); };
        };
        reader.readAsText(file, 'UTF-8');
    }

    function commitCsvImport(filename) {
        var result = state._csvResult;
        if (!result) return;
        result.valid.forEach(function (row) {
            db.kpi_values.push({ id: S.uid('kv'), kpiId: row.kpiId, period: row.period, periodType: 'monthly', value: row.value, serviceId: row.serviceId, observation: row.observation, source: 'import', createdAt: S.nowIso(), createdBy: (db.meta.currentUser || {}).name });
        });
        db.imports.push({ id: S.uid('imp'), filename: filename, rows: result.valid.length, errors: result.errors.length, importedAt: S.nowIso(), importedBy: (db.meta.currentUser || {}).name, status: 'ok' });
        S.audit(db, 'imports', null, 'csv_import', null, { filename: filename, rows: result.valid.length });
        persist(); toast(result.valid.length + ' linha(s) importada(s).');
        autoRecalculate(currentPeriod(), state.serviceId);
        state._csvResult = null;
        render();
    }

    function handleJsonImport(file) {
        if (!file) return;
        if (!confirm('Isso substitui todos os dados atuais pelo conteúdo do arquivo. Continuar?')) return;
        var reader = new FileReader();
        reader.onload = function () {
            try {
                db = S.importJson(String(reader.result));
                toast('Backup importado com sucesso.');
                render();
            } catch (err) {
                toast('Falha ao importar: ' + err.message, 'error');
            }
        };
        reader.readAsText(file, 'UTF-8');
    }

    document.addEventListener('DOMContentLoaded', init);
})(window);
