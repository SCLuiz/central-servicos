import os
import requests
from requests.auth import HTTPBasicAuth
import json
from datetime import datetime
import sys

# Carregar variáveis de ambiente (localmente usa .env, no GitHub Actions usa Secrets)
try:
    from dotenv import load_dotenv
    load_dotenv(override=True)
except ImportError:
    pass # No GitHub Actions o dotenv pode não estar instalado/necessário se as vars já estiverem no env

JIRA_URL = os.getenv("JIRA_URL")
JIRA_EMAIL = os.getenv("JIRA_EMAIL")
JIRA_TOKEN = os.getenv("JIRA_API_TOKEN")

if not JIRA_URL or not JIRA_EMAIL or not JIRA_TOKEN:
    print("Erro: Credenciais do Jira não configuradas.")
    sys.exit(1)

def fetch_jira_news():
    print("Conectando ao Jira...")
    auth = HTTPBasicAuth(JIRA_EMAIL, JIRA_TOKEN)
    headers = {"Accept": "application/json"}
    
    # Buscar Mudanças e Incidentes com nomes corretos
    # Os tipos têm prefixo [System] neste ambiente
    jql = 'project = OFBI AND issuetype in ("[System] Mudança", "[System] Incidente") ORDER BY updated DESC'
    
    url = f"{JIRA_URL}/rest/api/3/search/jql"
    params = {
        "jql": jql,
        "maxResults": 10,
        "fields": "summary,status,issuetype,updated,created,priority"
    }
    
    response = requests.get(url, headers=headers, auth=auth, params=params)
    
    if response.status_code != 200:
        print(f"Erro na API do Jira: {response.status_code} - {response.text}")
        return []
        
    issues = response.json().get('issues', [])
    news_items = []
    
    for issue in issues:
        fields = issue.get('fields', {})
        
        # Mapeamento de Tipo
        issue_type = fields.get('issuetype', {}).get('name', '')
        
        tag_class = "tag-servico" # Default
        if "Mudança" in issue_type:
            tag_class = "tag-mudanca"
        elif "Incidente" in issue_type:
            tag_class = "tag-incidente"
            
        # Mapeamento de Status para Cor
        status_name = fields.get('status', {}).get('name', '')
        status_dot = "dot-info" # Default (Azul)
        
        if status_name in ["Concluído", "Resolvido", "Fechado", "Implementado"]:
            status_dot = "dot-success" # Verde
        elif status_name in ["Monitorando", "Em progresso", "Em análise"]:
            status_dot = "dot-warning" # Laranja/Amarelo
        
        # Formatar Data
        date_str = fields.get('updated', '')
        formatted_date = ""
        if date_str:
            try:
                dt = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%S.%f%z")
                formatted_date = dt.strftime("%d/%m/%Y %H:%M")
            except:
                formatted_date = date_str[:10]
        
        item = {
            "source": "Jira",
            "key": issue.get('key'),
            "title": f"{issue.get('key')} - {fields.get('summary')}",
            "type_name": issue_type,
            "tag_class": tag_class,
            "status_name": status_name,
            "status_dot": status_dot,
            "date": formatted_date,
            "url": f"{JIRA_URL}/browse/{issue.get('key')}"
        }
        news_items.append(item)
        
    return news_items

def main():
    print("Iniciando atualização do Feed de Notícias...")
    
    items = fetch_jira_news()
    
    # Futuro: Integrar Confluence aqui
    # confluence_items = fetch_confluence_news()
    # items.extend(confluence_items)
    
    # Ordenar por data (se misturar fontes)? O JQL já traz ordenado, mas append pode bagunçar.
    
    output_file = "news_data.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2, ensure_ascii=False)
        
    print(f"Sucesso! {len(items)} itens salvos em {output_file}.")

if __name__ == "__main__":
    main()
