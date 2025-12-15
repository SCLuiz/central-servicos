# -*- coding: utf-8 -*-
"""
Atlassian Connect App Server
Central de Serviços - Open Finance Brasil
"""
from flask import Flask, request, jsonify, send_file, render_template_string
from flask_cors import CORS
import jwt
import requests
import json
import sys
import os

# Fix encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

app = Flask(__name__)
CORS(app)

# Armazenar informações de instalação (em produção, use banco de dados)
installations = {}

# Jira Configuration
JIRA_URL = "https://openfinancebrasil.atlassian.net"

@app.route('/atlassian-connect.json', methods=['GET'])
def descriptor():
    """Descriptor do app Atlassian Connect"""
    with open('atlassian-connect.json', 'r') as f:
        return jsonify(json.load(f))

@app.route('/installed', methods=['POST'])
def installed():
    """Webhook chamado quando o app é instalado no Jira"""
    data = request.get_json()

    # Salvar informações da instalação
    client_key = data.get('clientKey')
    installations[client_key] = {
        'baseUrl': data.get('baseUrl'),
        'sharedSecret': data.get('sharedSecret'),
        'clientKey': client_key,
        'publicKey': data.get('publicKey')
    }

    print(f"✅ App instalado para: {data.get('baseUrl')}")
    return jsonify({'status': 'installed'}), 200

@app.route('/uninstalled', methods=['POST'])
def uninstalled():
    """Webhook chamado quando o app é desinstalado"""
    data = request.get_json()
    client_key = data.get('clientKey')

    if client_key in installations:
        del installations[client_key]
        print(f"❌ App desinstalado: {client_key}")

    return jsonify({'status': 'uninstalled'}), 200

@app.route('/dashboard', methods=['GET'])
def dashboard():
    """Página principal do dashboard"""
    jwt_token = request.args.get('jwt')

    # Em produção, validar o JWT aqui
    # decoded = verify_jwt(jwt_token)

    # Retornar o HTML do dashboard
    html = """
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Central de Serviços</title>
        <link rel="stylesheet" href="https://scluiz.github.io/central-servicos/dashboard.css">
        <style>
            body { margin: 0; padding: 20px; background: linear-gradient(135deg, #FF1493 0%, #FFD700 100%); }
        </style>
    </head>
    <body>
        <div class="dashboard-container">
            <h1>🎯 Central de Serviços - Open Finance Brasil</h1>
            <p>Dashboard integrado ao Jira via Atlassian Connect</p>

            <div id="tickets-container"></div>
        </div>

        <script>
            // Buscar tickets via API do Jira
            async function loadTickets() {
                try {
                    const response = await fetch('/api/tickets');
                    const data = await response.json();
                    displayTickets(data.issues);
                } catch (error) {
                    console.error('Erro ao carregar tickets:', error);
                }
            }

            function displayTickets(issues) {
                const container = document.getElementById('tickets-container');
                container.innerHTML = issues.map(issue => `
                    <div style="background: white; padding: 15px; margin: 10px 0; border-radius: 8px;">
                        <h3>${issue.key}: ${issue.fields.summary}</h3>
                        <p>Status: ${issue.fields.status.name}</p>
                    </div>
                `).join('');
            }

            loadTickets();
        </script>
    </body>
    </html>
    """
    return render_template_string(html)

@app.route('/panel', methods=['GET'])
def panel():
    """Web panel para exibir em páginas do Jira"""
    return """
    <div style="padding: 15px;">
        <h3>SecOps Dashboard</h3>
        <p>Painel integrado ao Jira</p>
    </div>
    """

@app.route('/api/tickets', methods=['GET'])
def get_tickets():
    """Buscar tickets do Jira usando credenciais do app"""
    # Em produção, usar JWT para autenticar
    # Por enquanto, usar credenciais básicas

    try:
        # Aqui você usaria as credenciais do app instalado
        # Para teste, vou usar API Token
        email = os.environ.get('JIRA_EMAIL', 'seu.email@empresa.com')
        token = os.environ.get('JIRA_TOKEN', 'seu_token_aqui')

        from requests.auth import HTTPBasicAuth
        auth = HTTPBasicAuth(email, token)

        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }

        jql = 'project = 105 ORDER BY created DESC'
        url = f'{JIRA_URL}/rest/api/3/search'
        params = {
            'jql': jql,
            'maxResults': 50,
            'fields': 'summary,description,status,priority,created,assignee,reporter'
        }

        response = requests.get(url, auth=auth, headers=headers, params=params)

        if response.status_code == 200:
            return jsonify(response.json())
        else:
            return jsonify({'error': 'Erro ao buscar tickets'}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check"""
    return jsonify({
        'status': 'ok',
        'app': 'Central de Serviços - Atlassian Connect',
        'installations': len(installations)
    })

if __name__ == '__main__':
    print("=" * 80)
    print("🔌 ATLASSIAN CONNECT APP - CENTRAL DE SERVIÇOS")
    print("   Open Finance Brasil")
    print("=" * 80)
    print()
    print("📡 Servidor rodando em: http://localhost:5000")
    print()
    print("📋 ENDPOINTS:")
    print("   GET  /atlassian-connect.json - Descriptor do app")
    print("   POST /installed              - Webhook de instalação")
    print("   GET  /dashboard              - Dashboard principal")
    print("   GET  /health                 - Health check")
    print()
    print("🎯 PRÓXIMOS PASSOS:")
    print("   1. Fazer deploy no Render.com ou Vercel")
    print("   2. Atualizar baseUrl no atlassian-connect.json")
    print("   3. Instalar app no Jira via 'Gerenciar apps'")
    print()
    print("=" * 80)
    print()

    app.run(host='0.0.0.0', port=5000, debug=True)
