/**
 * Cloudflare Worker - Jira API Proxy & Reservations Backend
 * Central de Servicos - Open Finance Brasil
 */

const ALLOWED_ORIGINS = [
  'https://scluiz.github.io',
  'http://localhost:3000',
  'http://localhost:5000',
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

// Busca todas as Mudanças do Jira paginando via nextPageToken (evita truncar em 100)
async function buscarMudancas(env) {
  const auth = btoa(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`);
  const jql = 'project = OFBI AND type = "[System] Mudança" ORDER BY created DESC';
  const fields = ['summary', 'status', 'created', 'updated', 'resolutiondate', 'assignee', 'reporter', 'priority', 'labels', 'customfield_11073', 'customfield_10087', 'customfield_10088'];

  let mudancas = [];
  let nextPageToken = null;

  while (true) {
    const payload = { jql, fields, maxResults: 100 };
    if (nextPageToken) payload.nextPageToken = nextPageToken;

    const jiraResponse = await fetch(`${env.JIRA_URL}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!jiraResponse.ok) {
      const errorText = await jiraResponse.text();
      const err = new Error('Failed to fetch from Jira');
      err.status = jiraResponse.status;
      err.details = errorText;
      throw err;
    }

    const jiraData = await jiraResponse.json();
    const issues = jiraData.issues || [];

    mudancas = mudancas.concat(issues.map((issue) => {
      const f = issue.fields || {};
      const assignee = f.assignee || {};
      const reporter = f.reporter || {};
      const priority = f.priority || {};
      const status = f.status || {};
      return {
        key: issue.key,
        summary: f.summary || '',
        status: status.name || '',
        priority: priority.name || '',
        assignee: assignee.displayName || 'Sem responsável',
        reporter: reporter.displayName || '',
        created: f.created || '',
        updated: f.updated || '',
        resolution_date: f.resolutiondate || null,
        labels: f.labels || [],
        causouIncidente: f.customfield_11073 || false,
        inicio_planejado: f.customfield_10087 || null,
        conclusao_planejada: f.customfield_10088 || null,
      };
    }));

    nextPageToken = jiraData.nextPageToken;
    if (jiraData.isLast !== false && !nextPageToken) break;
    if (!nextPageToken) break;
  }

  return {
    ultima_atualizacao: new Date().toISOString(),
    total: mudancas.length,
    mudancas,
  };
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request);

    // Rejeita origens não permitidas (exceto OPTIONS)
    if (request.method !== 'OPTIONS') {
      const origin = request.headers.get('Origin') || '';
      if (origin && !ALLOWED_ORIGINS.includes(origin)) {
        return new Response(JSON.stringify({ error: 'Origem não autorizada' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      // --- ROTA 1: RESERVAS (BACKEND KV) ---
      if (url.pathname.endsWith('/reservations')) {
        if (!env.RESERVATIONS_KV) {
          return new Response(JSON.stringify({ error: 'KV nao configurado no Worker' }), {
            status: 500, headers: corsHeaders
          });
        }

        if (request.method === 'GET') {
          const date = url.searchParams.get('date');
          if (!date) return new Response('Date required', { status: 400, headers: corsHeaders });

          const data = await env.RESERVATIONS_KV.get(date);
          return new Response(data || '[]', {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (request.method === 'POST') {
          const body = await request.json();
          const { date, seats } = body;
          if (!date || !Array.isArray(seats)) {
            return new Response('Invalid Data', { status: 400, headers: corsHeaders });
          }

          await env.RESERVATIONS_KV.put(date, JSON.stringify(seats));

          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // --- ROTA 2: JIRA PROXY (USERS) ---
      if (url.pathname.endsWith('/users') || url.searchParams.get('type') === 'users') {
        const auth = btoa(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`);
        const query = url.searchParams.get('query') || '';

        const jiraResponse = await fetch(
          `${env.JIRA_URL}/rest/api/3/users/search?query=${encodeURIComponent(query)}&maxResults=50`,
          {
            method: 'GET',
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
          }
        );

        if (!jiraResponse.ok) {
          const errText = await jiraResponse.text();
          return new Response(errText, { status: jiraResponse.status, headers: corsHeaders });
        }

        const data = await jiraResponse.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // --- ROTA 3 (padrão): MUDANÇAS DO JIRA (usada pelo dashboard-mudancas-v2.html) ---
      try {
        const response = await buscarMudancas(env);
        return new Response(JSON.stringify(response), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({
          error: 'Failed to fetch from Jira',
          status: err.status || 500,
          details: err.details || err.message,
        }), {
          status: err.status || 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
  },
};
