/**
 * Cloudflare Worker - Jira API Proxy
 * Central de Serviços - Open Finance Brasil
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const auth = btoa(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`);

      // ==========================================
      // ROTA: IT OPS SCORE (/it-ops-score)
      // ==========================================
      if (path === '/it-ops-score') {
        // Query 1: Tickets no prazo (SLA Met) - Base Inteira (Até 5000 tickets)
        const jqlMet = 'project = HELP AND resolution != Unresolved AND "Tempo de resolução" != breached()';
        // Query 2: Tickets estourados (SLA Breached) - Base Inteira
        const jqlBreached = 'project = HELP AND resolution != Unresolved AND "Tempo de resolução" = breached()';

        const fetchJira = async (jql) => {
          const res = await fetch(`${env.JIRA_URL}/rest/api/3/search/jql`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ jql: jql, maxResults: 5000, fields: ['issuekey'] }),
          });
          if (!res.ok) throw new Error(await res.text());
          const data = await res.json();
          return data.issues ? data.issues.length : 0;
        };

        const [countMet, countBreached] = await Promise.all([
          fetchJira(jqlMet),
          fetchJira(jqlBreached)
        ]);

        const totalResolved = countMet + countBreached;
        const slaPercentage = totalResolved > 0 ? Math.round((countMet / totalResolved) * 100) : 100;

        return new Response(JSON.stringify({
          metrics: {
            sla_resolucao: {
              value: slaPercentage,
              total_resolved: totalResolved,
              met: countMet,
              breached: countBreached
            }
          }
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ==========================================
      // ROTA: MUDANÇAS (Padrão)
      // ==========================================
      const jql = 'project = OFBI AND type = "[System] Mudança" ORDER BY created DESC';
      const jiraResponse = await fetch(`${env.JIRA_URL}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jql: jql,
          fields: ['summary', 'status', 'created', 'updated', 'resolutiondate', 'assignee', 'reporter', 'priority', 'labels', 'customfield_11073', 'customfield_10087', 'customfield_10088'],
          maxResults: 100,
        }),
      });

      if (!jiraResponse.ok) {
        return new Response(JSON.stringify({ error: 'Failed to fetch from Jira', details: await jiraResponse.text() }), {
          status: jiraResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const jiraData = await jiraResponse.json();
      const mudancas = (jiraData.issues || []).map(issue => {
        const fields = issue.fields || {};
        return {
          key: issue.key,
          summary: fields.summary || '',
          status: (fields.status || {}).name || '',
          priority: (fields.priority || {}).name || '',
          assignee: (fields.assignee || {}).displayName || 'Sem responsável',
          reporter: (fields.reporter || {}).displayName || '',
          created: fields.created || '',
          updated: fields.updated || '',
          resolution_date: fields.resolutiondate || null,
          labels: fields.labels || [],
          causouIncidente: fields.customfield_11073 || false,
          inicio_planejado: fields.customfield_10087 || null,
          conclusao_planejada: fields.customfield_10088 || null,
        };
      });

      return new Response(JSON.stringify({ ultima_atualizacao: new Date().toISOString(), total: mudancas.length, mudancas }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal server error', message: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
