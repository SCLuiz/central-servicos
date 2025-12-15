/**
 * Cloudflare Worker - Jira API Proxy
 * Central de Serviços - Open Finance Brasil
 *
 * Este Worker consulta a API do Jira de forma segura para o Dashboard de Mudanças.
 * As credenciais ficam protegidas no Cloudflare, não no frontend.
 */

export default {
  async fetch(request, env) {
    // Permitir CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://scluiz.github.io',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Responder a preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Apenas aceitar GET
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      // Montar credenciais para autenticação básica
      const auth = btoa(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`);

      // JQL para buscar mudanças
      const jql = 'project = OFBI AND type = "[System] Mudança" ORDER BY created DESC';

      // Consultar API do Jira
      const jiraResponse = await fetch(
        `${env.JIRA_URL}/rest/api/3/search/jql`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jql: jql,
            fields: ['summary', 'status', 'created', 'updated', 'assignee', 'reporter', 'priority', 'labels', 'customfield_10037'],
            maxResults: 100,
          }),
        }
      );

      if (!jiraResponse.ok) {
        const errorText = await jiraResponse.text();
        console.error('Jira API error:', errorText);
        return new Response(JSON.stringify({
          error: 'Failed to fetch from Jira',
          status: jiraResponse.status,
          details: errorText
        }), {
          status: jiraResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const jiraData = await jiraResponse.json();
      const issues = jiraData.issues || [];

      // Processar dados
      const mudancas = issues.map(issue => {
        const fields = issue.fields || {};
        const assignee = fields.assignee || {};
        const reporter = fields.reporter || {};
        const priority = fields.priority || {};
        const status = fields.status || {};

        return {
          key: issue.key,
          summary: fields.summary || '',
          status: status.name || '',
          priority: priority.name || '',
          assignee: assignee.displayName || 'Sem responsável',
          reporter: reporter.displayName || '',
          created: fields.created || '',
          updated: fields.updated || '',
          labels: fields.labels || [],
          causouIncidente: fields.customfield_10037 || false,
        };
      });

      // Retornar dados formatados
      const response = {
        ultima_atualizacao: new Date().toISOString(),
        total: mudancas.length,
        mudancas: mudancas
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
