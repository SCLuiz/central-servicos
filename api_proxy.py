# -*- coding: utf-8 -*-
"""
Proxy API para Jira - Resolve problema de CORS
Central de Serviços - Open Finance Brasil
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from requests.auth import HTTPBasicAuth
import sys

# Fix encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

app = Flask(__name__)
CORS(app)

JIRA_URL = "https://openfinancebrasil.atlassian.net"


@app.route('/api/tickets', methods=['POST'])
def get_tickets():
    """
    POST /api/tickets
    Body JSON: {"email": "xxx", "token": "xxx", "project": "105"}
    Retorna lista de tickets do Jira Service Desk.
    Token trafega no body, nunca na URL.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Body JSON obrigatório'}), 400

        email = data.get('email')
        token = data.get('token')
        project = data.get('project', '105')

        if not email or not token:
            return jsonify({'error': 'Email e token são obrigatórios'}), 400

        auth = HTTPBasicAuth(email, token)
        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }

        jql = f'project = {project} ORDER BY created DESC'
        url = f'{JIRA_URL}/rest/api/3/search'
        params = {
            'jql': jql,
            'maxResults': 100,
            'fields': 'summary,description,status,priority,created,assignee,reporter'
        }

        response = requests.get(url, auth=auth, headers=headers, params=params)

        if response.status_code == 200:
            return jsonify(response.json())
        else:
            return jsonify({
                'error': f'Erro na API do Jira: {response.status_code}',
                'details': response.text
            }), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/validate', methods=['POST'])
def validate_credentials():
    """
    POST /api/validate
    Body JSON: {"email": "xxx", "token": "xxx"}
    Valida credenciais do Jira. Token trafega no body, nunca na URL.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Body JSON obrigatório'}), 400

        email = data.get('email')
        token = data.get('token')

        if not email or not token:
            return jsonify({'error': 'Email e token são obrigatórios'}), 400

        auth = HTTPBasicAuth(email, token)
        headers = {'Accept': 'application/json'}

        url = f'{JIRA_URL}/rest/api/3/myself'
        response = requests.get(url, auth=auth, headers=headers)

        if response.status_code == 200:
            user_data = response.json()
            return jsonify({
                'success': True,
                'user': {
                    'displayName': user_data.get('displayName'),
                    'emailAddress': user_data.get('emailAddress'),
                    'avatarUrl': user_data.get('avatarUrls', {}).get('48x48', '')
                }
            })
        elif response.status_code == 401:
            return jsonify({'success': False, 'error': 'Credenciais inválidas'}), 401
        else:
            return jsonify({'success': False, 'error': f'Erro {response.status_code}'}), response.status_code

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health():
    """Health check"""
    return jsonify({'status': 'ok', 'message': 'API Proxy funcionando!'})


if __name__ == '__main__':
    print("=" * 80)
    print("🚀 API PROXY - CENTRAL DE SERVIÇOS")
    print("   Open Finance Brasil")
    print("=" * 80)
    print()
    print("📡 Servidor rodando em: http://localhost:5000")
    print()
    print("📋 ENDPOINTS:")
    print("   GET  /api/health    - Health check")
    print("   POST /api/tickets   - Listar tickets (token no body, não na URL)")
    print("   POST /api/validate  - Validar credenciais")
    print()
    print("⚠️  PARA PARAR: Ctrl+C")
    print("=" * 80)

    app.run(host='0.0.0.0', port=5000, debug=False)
