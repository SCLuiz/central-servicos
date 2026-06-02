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
import hmac
import hashlib

# Fix encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

app = Flask(__name__)
CORS(app)

# Armazenar informações de instalação (em produção, use banco de dados)
installations = {}

# Jira Configuration
JIRA_URL = "https://openfinancebrasil.atlassian.net"


def verify_jwt(token, client_key):
    """
    Valida o JWT enviado pelo Atlassian.
    O sharedSecret é obtido no momento da instalação.
    """
    if not token:
        return None, "Token JWT ausente"

    installation = installations.get(client_key)
    if not installation:
        return None, f"Instalação não encontrada para clientKey: {client_key}"

    shared_secret = installation.get('sharedSecret')
    if not shared_secret:
        return None, "sharedSecret não encontrado para esta instalação"

    try:
        decoded = jwt.decode(
            token,
            shared_secret,
            algorithms=["HS256"],
            options={"verify_exp": True}
        )
        return decoded, None
    except jwt.ExpiredSignatureError:
        return None, "Token JWT expirado"
    except jwt.InvalidTokenError as e:
        return None, f"Token JWT inválido: {str(e)}"


def require_jwt(f):
    """Decorator para proteger endpoints que exigem JWT válido do Atlassian."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        jwt_token = request.args.get('jwt') or request.headers.get('Authorization', '').replace('JWT ', '')
        client_key = request.args.get('clientKey') or request.headers.get('X-Client-Key')

        if not jwt_token:
            return jsonify({'error': 'Token JWT obrigatório'}), 401

        # Tentar validar contra todas as instalações se clientKey não informado
        if not client_key:
            for ck in installations:
                decoded, error = verify_jwt(jwt_token, ck)
                if decoded:
                    return f(*args, **kwargs)
            return jsonify({'error': 'Token JWT inválido ou instalação não encontrada'}), 401

        decoded, error = verify_jwt(jwt_token, client_key)
        if not decoded:
            return jsonify({'error': error}), 401

        return f(*args, **kwargs)
    return decorated


@app.route('/atlassian-connect.json', methods=['GET'])
def descriptor():
    """Descriptor do app Atlassian Connect"""
    with open('atlassian-connect.json', 'r') as f:
        return jsonify(json.load(f))


@app.route('/installed', methods=['POST'])
def installed():
    """Webhook chamado quando o app é instalado no Jira"""
    data = request.get_json()

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
@require_jwt
def dashboard():
    """Página principal do dashboard — protegida por JWT Atlassian"""
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
            async function loadTickets() {
                try {
                    // Passa o JWT na query string para o backend validar
                    const jwtToken = new URLSearchParams(window.location.search).get('jwt');
                    const response = await fetch('/api/tickets?jwt=' + jwtToken);
                    const data = await response.json();
                    displayTickets(data.issues || []);
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
@require_jwt
def panel():
    """Web panel para exibir em páginas do Jira — protegido por JWT"""
    return """
    <div style="padding: 15px;">
        <h3>SecOps Dashboard</h3>
        <p>Painel integrado ao Jira</p>
    </div>
    """


@app.route('/api/tickets', methods=['GET'])
@require_jwt
def get_tickets():
    """Buscar tickets do Jira usando credenciais seguras de env vars"""
    try:
        email = os.environ.get('JIRA_EMAIL')
        token = os.environ.get('JIRA_TOKEN')

        if not email or not token:
            return jsonify({'error': 'Credenciais Jira não configuradas no servidor'}), 500

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
    """Health check — sem autenticação"""
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
    print("📋 ENDPOINTS PROTEGIDOS POR JWT:")
    print("   GET  /dashboard    - Dashboard principal")
    print("   GET  /panel        - Web panel")
    print("   GET  /api/tickets  - Listar tickets")
    print()
    print("📋 ENDPOINTS PÚBLICOS:")
    print("   GET  /atlassian-connect.json - Descriptor do app")
    print("   POST /installed              - Webhook de instalação")
    print("   GET  /health                 - Health check")
    print()
    print("=" * 80)

    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=5000, debug=debug)
