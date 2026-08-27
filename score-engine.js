/*
 * ScoreEngine — motor de cálculo do Operations Health Score.
 * Camada pura: sem DOM, sem localStorage. Toda fórmula do sistema vive aqui.
 * Nenhuma tela deve reimplementar cálculo — sempre chamar estas funções.
 */
(function (global) {
    'use strict';

    function clamp(n, min, max) {
        if (n === null || n === undefined || isNaN(n)) return null;
        return Math.max(min, Math.min(max, n));
    }

    function round2(n) {
        if (n === null || n === undefined || isNaN(n)) return null;
        return Math.round(n * 100) / 100;
    }

    function toNum(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isNaN(n) ? null : n;
    }

    // ---- 4. Normalização de KPI (0-100) -------------------------------------
    function normalizeKpiScore(kpi, rawValue) {
        var value = toNum(rawValue);
        if (value === null) return null; // sem dado no período
        var target = toNum(kpi.target);

        if (kpi.direction === 'higher') {
            if (target === null || target <= 0) return value > 0 ? 100 : 0;
            return round2(clamp((value / target) * 100, 0, 100));
        }

        // direction === 'lower': quanto menor, melhor
        if (value === 0) return 100; // zero é sempre o melhor resultado possível
        if (value < 0) return 0; // valor inválido defensivo
        if (target === null || target <= 0) return 0; // meta é 0 mas houve ocorrência: pior caso
        return round2(clamp((target / value) * 100, 0, 100));
    }

    // ---- Validação de pesos (devem somar 100%) ------------------------------
    function validateWeightsSum100(items, weightKey) {
        var sum = (items || []).reduce(function (acc, it) {
            return acc + (toNum(it[weightKey]) || 0);
        }, 0);
        return { valid: Math.abs(round2(sum) - 100) < 0.01, sum: round2(sum) };
    }

    // Média ponderada tolerante a dados ausentes (renormaliza pelos pesos presentes)
    function weightedAverage(items, scoreKey, weightKey) {
        var totalWeight = 0, sum = 0;
        (items || []).forEach(function (it) {
            var score = it[scoreKey];
            if (score === null || score === undefined) return;
            var w = toNum(it[weightKey]) || 0;
            totalWeight += w;
            sum += score * w;
        });
        if (totalWeight <= 0) return { score: null, effectiveWeight: 0 };
        return { score: round2(sum / totalWeight), effectiveWeight: round2(totalWeight) };
    }

    // ---- 5/6. Score do Pilar e Score Geral ----------------------------------
    function calcPillarScore(kpiBreakdown) {
        // kpiBreakdown: [{ kpi, value, score }] (score já normalizado, opcional — calculado se ausente)
        var items = (kpiBreakdown || []).map(function (kb) {
            var score = (kb.score !== undefined) ? kb.score : normalizeKpiScore(kb.kpi, kb.value);
            return { score: score, weight: kb.kpi.weightInPillar };
        });
        var r = weightedAverage(items, 'score', 'weight');
        return { score: r.score, dataCompleteness: r.effectiveWeight };
    }

    function calcOverallGross(pillarScores) {
        // pillarScores: [{ pillar, score }]
        var items = (pillarScores || []).map(function (p) {
            return { score: p.score, weight: p.pillar.weight };
        });
        var r = weightedAverage(items, 'score', 'weight');
        return { score: r.score === null ? 0 : r.score, dataCompleteness: r.effectiveWeight };
    }

    // ---- 7. Penalidades ------------------------------------------------------
    var PENALTY_EVALUATORS = {
        p1_incident_active: function (ctx) {
            return toNum(ctx.signals.p1IncidentsActive) > 0;
        },
        critical_unavailability: function (ctx) {
            return !!ctx.signals.criticalUnavailability;
        },
        sla_below_threshold: function (ctx, rule) {
            var threshold = (rule.params && toNum(rule.params.threshold) !== null) ? toNum(rule.params.threshold) : 80;
            var v = ctx.kpiValuesByKey[(rule.params && rule.params.kpiKey) || 'sla_cumprido'];
            return v !== null && v !== undefined && toNum(v) < threshold;
        },
        change_critical_failure: function (ctx) {
            return !!ctx.signals.changeCriticalFailure;
        },
        kpi_threshold: function (ctx, rule) {
            var p = rule.params || {};
            var v = toNum(ctx.kpiValuesByKey[p.kpiKey]);
            if (v === null || !p.operator) return false;
            var t = toNum(p.threshold);
            if (t === null) return false;
            switch (p.operator) {
                case '<': return v < t;
                case '<=': return v <= t;
                case '>': return v > t;
                case '>=': return v >= t;
                case '==': return v === t;
                default: return false;
            }
        }
    };

    function evaluatePenalties(rules, ctx) {
        var applied = [];
        (rules || []).filter(function (r) { return r.active; }).forEach(function (rule) {
            var evaluator = PENALTY_EVALUATORS[rule.type];
            var triggered = evaluator ? !!evaluator(ctx, rule) : false;
            if (triggered) {
                applied.push({ ruleId: rule.id, name: rule.name, points: Math.abs(toNum(rule.points) || 0), priority: rule.priority || 0 });
            }
        });
        applied.sort(function (a, b) { return b.points - a.points; });
        return applied;
    }

    function calcFinalScore(grossScore, appliedPenalties) {
        var totalPenalty = (appliedPenalties || []).reduce(function (acc, p) { return acc + p.points; }, 0);
        var gross = grossScore === null ? 0 : grossScore;
        var final = clamp(round2(gross - totalPenalty), 0, 100);
        return { grossScore: round2(gross), penaltiesTotal: round2(totalPenalty), finalScore: final };
    }

    // ---- 8. Classificação -----------------------------------------------------
    var DEFAULT_CLASSIFICATION = [
        { id: 'excelente', min: 90, max: 100, label: 'EXCELENTE', color: '#00875A' },
        { id: 'saudavel', min: 80, max: 89.99, label: 'SAUDÁVEL', color: '#36B37E' },
        { id: 'atencao', min: 70, max: 79.99, label: 'ATENÇÃO', color: '#FFAB00' },
        { id: 'risco', min: 60, max: 69.99, label: 'RISCO OPERACIONAL', color: '#FF5630' },
        { id: 'critico', min: 0, max: 59.99, label: 'CRÍTICO', color: '#DE350B' }
    ];

    function classify(score, ranges) {
        ranges = (ranges && ranges.length) ? ranges : DEFAULT_CLASSIFICATION;
        for (var i = 0; i < ranges.length; i++) {
            var r = ranges[i];
            if (score >= r.min && score <= r.max) return r;
        }
        return ranges[ranges.length - 1];
    }

    // ---- 10. Explicação dos fatores de impacto --------------------------------
    function explainScore(pillarResults, appliedPenalties) {
        var negatives = [], positives = [], missing = [];

        (pillarResults || []).forEach(function (p) {
            var pw = (toNum(p.pillar.weight) || 0) / 100;
            (p.kpiBreakdown || []).forEach(function (kb) {
                if (kb.score === null || kb.score === undefined) {
                    missing.push({ type: 'missing', label: kb.kpi.name, pillar: p.pillar.name });
                    return;
                }
                var kw = (toNum(kb.kpi.weightInPillar) || 0) / 100;
                var effective = pw * kw;
                var maxPoints = round2(effective * 100);
                var actualPoints = round2(effective * kb.score);
                var impact = round2(actualPoints - maxPoints);
                var factor = {
                    label: kb.kpi.name, pillar: p.pillar.name, value: kb.value, target: kb.kpi.target,
                    unit: kb.kpi.unit, direction: kb.kpi.direction, kpiScore: kb.score,
                    points: impact, maxPoints: maxPoints, actualPoints: actualPoints
                };
                if (impact < -0.01) negatives.push(factor); else positives.push(factor);
            });
        });

        (appliedPenalties || []).forEach(function (p) {
            negatives.push({ type: 'penalty', label: p.name, points: -p.points, isPenalty: true });
        });

        negatives.sort(function (a, b) { return a.points - b.points; });
        positives.sort(function (a, b) { return b.actualPoints - a.actualPoints; });
        return { negatives: negatives, positives: positives, missing: missing };
    }

    // ---- Orquestração completa -------------------------------------------------
    function calculate(params) {
        // params: { pillars, kpisByPillar: {pillarId:[kpi]}, valuesByKpi: {kpiId:value},
        //           penaltyRules, signals, classificationRanges }
        var activePillars = (params.pillars || []).filter(function (p) { return p.active; });
        var pillarWeightCheck = validateWeightsSum100(activePillars, 'weight');
        var pillarResults = [];
        var kpiValuesByKey = {};
        var allKpiWeightsValid = true;

        activePillars.forEach(function (pillar) {
            var kpis = (params.kpisByPillar[pillar.id] || []).filter(function (k) { return k.active; });
            var kpiWeightCheck = validateWeightsSum100(kpis, 'weightInPillar');
            if (!kpiWeightCheck.valid) allKpiWeightsValid = false;

            var kpiBreakdown = kpis.map(function (kpi) {
                var value = params.valuesByKpi[kpi.id];
                var score = normalizeKpiScore(kpi, value);
                if (value !== null && value !== undefined) kpiValuesByKey[kpi.key] = toNum(value);
                return { kpi: kpi, value: (value === undefined ? null : value), score: score };
            });

            var pr = calcPillarScore(kpiBreakdown);
            pillarResults.push({
                pillar: pillar, score: pr.score, dataCompleteness: pr.dataCompleteness,
                kpiBreakdown: kpiBreakdown, weightValid: kpiWeightCheck.valid, weightSum: kpiWeightCheck.sum
            });
        });

        var weightsValid = pillarWeightCheck.valid && allKpiWeightsValid;
        // Pilares sem nenhum dado no período ficam de fora da média (renormalizada pelos
        // pesos presentes) em vez de contar como 0 — isso é o que torna "dataCompleteness"
        // um sinal confiável de "sem dado" em vez de sempre 100%.
        var gross = calcOverallGross(pillarResults.map(function (p) {
            return { pillar: p.pillar, score: p.score };
        }));

        var ctx = { signals: params.signals || {}, kpiValuesByKey: kpiValuesByKey };
        var applied = evaluatePenalties(params.penaltyRules || [], ctx);
        var finalCalc = calcFinalScore(gross.score, applied);
        var classification = classify(finalCalc.finalScore, params.classificationRanges);
        var explanation = explainScore(pillarResults, applied);

        return {
            pillarResults: pillarResults,
            grossScore: finalCalc.grossScore,
            penaltiesApplied: applied,
            penaltiesTotal: finalCalc.penaltiesTotal,
            finalScore: finalCalc.finalScore,
            classification: classification,
            explanation: explanation,
            weightsValid: weightsValid,
            pillarWeightSum: pillarWeightCheck.sum,
            dataCompleteness: gross.dataCompleteness,
            canPublish: weightsValid
        };
    }

    global.ScoreEngine = {
        clamp: clamp, round2: round2, toNum: toNum,
        normalizeKpiScore: normalizeKpiScore,
        validateWeightsSum100: validateWeightsSum100,
        weightedAverage: weightedAverage,
        calcPillarScore: calcPillarScore,
        calcOverallGross: calcOverallGross,
        PENALTY_EVALUATORS: PENALTY_EVALUATORS,
        evaluatePenalties: evaluatePenalties,
        calcFinalScore: calcFinalScore,
        DEFAULT_CLASSIFICATION: DEFAULT_CLASSIFICATION,
        classify: classify,
        explainScore: explainScore,
        calculate: calculate
    };
})(window);
