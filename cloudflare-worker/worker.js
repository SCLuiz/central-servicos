/**
 * Cloudflare Worker - OAuth Token Exchange
 * Central de Serviços - Open Finance Brasil
 *
 * Este Worker troca o authorization code por access token de forma segura.
 * O CLIENT_SECRET fica protegido no Cloudflare, não no frontend.
 */

export default {
  async fetch(request, env) {
    // Permitir CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://scluiz.github.io',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Responder a preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Apenas aceitar POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      // Ler dados da requisição
      const { code, redirect_uri } = await request.json();

      if (!code) {
        return new Response(JSON.stringify({ error: 'Missing authorization code' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Trocar code por token na API da Atlassian
      const tokenResponse = await fetch('https://auth.atlassian.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: env.CLIENT_ID,
          client_secret: env.CLIENT_SECRET, // SECRET protegido no Cloudflare
          code: code,
          redirect_uri: redirect_uri,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error('Token exchange failed:', errorData);
        return new Response(JSON.stringify({
          error: 'Failed to exchange token',
          details: errorData
        }), {
          status: tokenResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const tokenData = await tokenResponse.json();

      // Retornar tokens para o frontend
      return new Response(JSON.stringify(tokenData), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
