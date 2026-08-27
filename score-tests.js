/*
 * ScoreTests — suíte de autoteste do motor de cálculo.
 * Roda inteiramente no navegador (sem test runner) e valida o ScoreEngine
 * contra os exemplos numéricos descritos na especificação do Operations Health Score.
 */
(function (global) {
    'use strict';

    function approx(a, b, tol) {
        tol = tol === undefined ? 0.01 : tol;
        return Math.abs(a - b) <= tol;
    }

    function run() {
        var E = global.ScoreEngine;
        var results = [];

        function check(name, cond, detail) {
            results.push({ name: name, pass: !!cond, detail: detail || '' });
        }

        // 1. Quanto maior, melhor — exemplo do spec: meta 95, valor 90 -> 94.74
        check('Normalização "maior é melhor" (SLA 90/95)',
            approx(E.normalizeKpiScore({ direction: 'higher', target: 95 }, 90), 94.74),
            'esperado 94.74, obtido ' + E.normalizeKpiScore({ direction: 'higher', target: 95 }, 90));

        // 2. Quanto menor, melhor — exemplo do spec: meta 4h, valor 6h -> 66.67
        check('Normalização "menor é melhor" (MTTR 6/4)',
            approx(E.normalizeKpiScore({ direction: 'lower', target: 4 }, 6), 66.67),
            'esperado 66.67, obtido ' + E.normalizeKpiScore({ direction: 'lower', target: 4 }, 6));

        // 3. Cap em 100 quando o resultado supera a meta
        check('Cap em 100 (maior é melhor, valor > meta)',
            E.normalizeKpiScore({ direction: 'higher', target: 90 }, 150) === 100);
        check('Cap em 100 (menor é melhor, valor bem abaixo da meta)',
            E.normalizeKpiScore({ direction: 'lower', target: 10 }, 1) === 100);

        // 4. Valor zero em "menor é melhor" não gera divisão por zero e vira 100
        check('Valor 0 em "menor é melhor" não quebra e retorna 100',
            E.normalizeKpiScore({ direction: 'lower', target: 4 }, 0) === 100);

        // 5. Meta 0 em "menor é melhor" com ocorrência: pior caso (0)
        check('Meta 0 com ocorrência real vira score 0',
            E.normalizeKpiScore({ direction: 'lower', target: 0 }, 2) === 0);

        // 6. Piso em 0 (não pode ficar negativo)
        var scoreNeg = E.normalizeKpiScore({ direction: 'higher', target: 100 }, -50);
        check('Score nunca fica negativo', scoreNeg >= 0);

        // 7. Score geral bruto — exemplo do spec (seção 6): 85.85
        var pillarScores = [
            { pillar: { weight: 25 }, score: 80 },
            { pillar: { weight: 20 }, score: 95 },
            { pillar: { weight: 20 }, score: 98 },
            { pillar: { weight: 15 }, score: 85 },
            { pillar: { weight: 10 }, score: 75 },
            { pillar: { weight: 10 }, score: 70 }
        ];
        var gross = E.calcOverallGross(pillarScores);
        check('Score geral bruto = 85,85 (exemplo do spec, seção 6)',
            approx(gross.score, 85.85), 'obtido ' + gross.score);

        // 8. Penalidades reduzem o score final corretamente
        var finalCalc = E.calcFinalScore(91, [{ points: 20 }, { points: 10 }]);
        check('Penalidades: 91 - 20 - 10 = 61 (exemplo do spec, seção 7)',
            finalCalc.finalScore === 61, 'obtido ' + finalCalc.finalScore);

        // 9. Score final nunca fica abaixo de 0
        var clampedLow = E.calcFinalScore(10, [{ points: 20 }, { points: 15 }]);
        check('Score final nunca fica negativo (clamp em 0)', clampedLow.finalScore === 0);

        // 10. Score final nunca ultrapassa 100
        var clampedHigh = E.clamp(150, 0, 100);
        check('clamp() nunca ultrapassa 100', clampedHigh === 100);

        // 11. Validação de soma de pesos = 100%
        var validWeights = E.validateWeightsSum100([{ w: 40 }, { w: 20 }, { w: 25 }, { w: 15 }], 'w');
        var invalidWeights = E.validateWeightsSum100([{ w: 40 }, { w: 20 }, { w: 25 }], 'w');
        check('Detecta soma de pesos válida (=100%)', validWeights.valid === true);
        check('Detecta soma de pesos inválida (≠100%)', invalidWeights.valid === false);

        // 12. Classificação segue as faixas padrão
        check('Classificação 86 = SAUDÁVEL', E.classify(86).label === 'SAUDÁVEL');
        check('Classificação 61 = RISCO OPERACIONAL', E.classify(61).label === 'RISCO OPERACIONAL');
        check('Classificação 45 = CRÍTICO', E.classify(45).label === 'CRÍTICO');

        // 13. calculate() ponta a ponta com pesos válidos deve permitir publicação
        var calcResult = E.calculate({
            pillars: [{ id: 'p1', weight: 100, active: true }],
            kpisByPillar: { p1: [{ id: 'k1', key: 'x', direction: 'higher', target: 100, weightInPillar: 100, active: true }] },
            valuesByKpi: { k1: 100 },
            penaltyRules: [],
            signals: {}
        });
        check('calculate() com pesos válidos permite publicação', calcResult.canPublish === true);
        check('calculate() com KPI no alvo retorna score final 100', calcResult.finalScore === 100);

        // 14. Pilar sem nenhum dado não deve ser tratado como 0 — deve ser excluído
        // e o cálculo renormalizado pelos pilares que de fato têm dado.
        var partialCalc = E.calculate({
            pillars: [{ id: 'pa', weight: 50, active: true }, { id: 'pb', weight: 50, active: true }],
            kpisByPillar: {
                pa: [{ id: 'ka', key: 'a', direction: 'higher', target: 100, weightInPillar: 100, active: true }],
                pb: [{ id: 'kb', key: 'b', direction: 'higher', target: 100, weightInPillar: 100, active: true }]
            },
            valuesByKpi: { ka: 100 }, // kb sem valor => pilar pb fica sem dado
            penaltyRules: [], signals: {}
        });
        check('Pilar sem dado é excluído (renormalizado), não vira 0',
            partialCalc.finalScore === 100, 'esperado 100 (só o pilar com dado conta), obtido ' + partialCalc.finalScore);
        check('dataCompleteness reflete só os pilares com dado (50%)',
            approx(partialCalc.dataCompleteness, 50), 'obtido ' + partialCalc.dataCompleteness);

        // 15. Nenhum pilar com dado => score final seguro (0), não erro/NaN
        var emptyCalc = E.calculate({
            pillars: [{ id: 'pc', weight: 100, active: true }],
            kpisByPillar: { pc: [{ id: 'kc', key: 'c', direction: 'higher', target: 100, weightInPillar: 100, active: true }] },
            valuesByKpi: {}, penaltyRules: [], signals: {}
        });
        check('Sem nenhum dado: score final = 0 (nunca NaN/negativo) e dataCompleteness = 0',
            emptyCalc.finalScore === 0 && emptyCalc.dataCompleteness === 0);

        var total = results.length;
        var passed = results.filter(function (r) { return r.pass; }).length;
        return { total: total, passed: passed, failed: total - passed, results: results };
    }

    global.ScoreTests = { run: run };
})(window);
