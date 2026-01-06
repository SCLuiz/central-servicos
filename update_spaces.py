import os
import requests
from requests.auth import HTTPBasicAuth
import json
import sys

# Carregar variáveis de ambiente
try:
    from dotenv import load_dotenv
    load_dotenv(override=True)
except ImportError:
    pass

JIRA_URL = os.getenv("JIRA_URL")
JIRA_EMAIL = os.getenv("JIRA_EMAIL")
JIRA_TOKEN = os.getenv("JIRA_API_TOKEN")

if not JIRA_URL or not JIRA_EMAIL or not JIRA_TOKEN:
    print("Erro: Credenciais do Jira não configuradas.")
    sys.exit(1)

def get_confluence_url(jira_url):
    base_url = jira_url.replace(jira_url.split('/')[-1], "") if jira_url.endswith('/') else jira_url
    if "atlassian.net" in base_url:
        return f"https://{base_url.split('//')[1].split('.')[0]}.atlassian.net/wiki"
    return f"{base_url}/wiki"

def fetch_spaces():
    print("Conectando ao Confluence para buscar espaços...")
    confluence_url = get_confluence_url(JIRA_URL)
    url = f"{confluence_url}/rest/api/space"
    
    auth = HTTPBasicAuth(JIRA_EMAIL, JIRA_TOKEN)
    headers = {"Accept": "application/json"}
    
    params = {
        "limit": 20, # Limitar para não poluir demais o feed
        "type": "global",
        "expand": "icon,description.plain"
    }
    
    try:
        response = requests.get(url, headers=headers, auth=auth, params=params)
        
        # Fallback se /wiki não existir
        if response.status_code == 404:
             confluence_url = JIRA_URL.rstrip('/')
             url = f"{confluence_url}/rest/api/space"
             response = requests.get(url, headers=headers, auth=auth, params=params)

        if response.status_code != 200:
            print(f"Erro ao buscar espaços: {response.status_code} - {response.text}")
            return []

        data = response.json()
        results = data.get('results', [])
        spaces_items = []
        
        for space in results:
            name = space.get('name')
            key = space.get('key')
            webui = space.get('_links', {}).get('webui')
            full_url = f"{confluence_url}{webui}"
            
            # Tentar pegar ícone se disponível, senão usar padrão
            icon_path = space.get('icon', {}).get('path', '')
            icon_url = f"{confluence_url}{icon_path}" if icon_path else ""

            item = {
                "name": name,
                "key": key,
                "url": full_url,
                "icon": icon_url
            }
            spaces_items.append(item)
            
        return spaces_items

    except Exception as e:
        print(f"Erro de exceção: {e}")
        return []

def main():
    items = fetch_spaces()
    
    output_file = "spaces_data.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2, ensure_ascii=False)
        
    print(f"Sucesso! {len(items)} espaços salvos em {output_file}.")

if __name__ == "__main__":
    main()
