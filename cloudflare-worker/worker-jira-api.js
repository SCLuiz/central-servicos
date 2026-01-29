/**
 * Cloudflare Worker - Jira API Proxy & Reservations Backend
 * Central de Serviços - Open Finance Brasil
 */

export default {
  async fetch(request, env) {
    // CORS Configuration
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*', // Em produção, restrinja para seu domínio
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      // --- ROTA 1: RESERVAS (BACKEND KV) ---
      if (url.pathname.endsWith('/reservations')) {
        // Verifica se o KV está configurado
        if (!env.RESERVATIONS_KV) {
          return new Response(JSON.stringify({ error: 'KV não configurado no Worker' }), {
            status: 500, headers: corsHeaders
          });
        }

        // GET: Ler Dia
        if (request.method === 'GET') {
          const date = url.searchParams.get('date');
          if (!date) return new Response('Date required', { status: 400, headers: corsHeaders });

          const data = await env.RESERVATIONS_KV.get(date);
          return new Response(data || '[]', {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // POST: Salvar Dia
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

      return new Response('Not found', { status: 404, headers: corsHeaders });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
  },
};
