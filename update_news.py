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
    
    # Buscar APENAS Mudanças em aberto (removido Incidentes a pedido do usuário)
    # Mudanças: statusCategory != Done
    jql = 'project = OFBI AND issuetype = "[System] Mudança" AND statusCategory != Done ORDER BY updated DESC'
    
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
        elif status_name in ["Monitorando", "Em progresso", "Em análise", "Aguardando"]:
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
            "type_name": issue_type.replace("[System] ", ""), # Remove prefixo feio se existir
            "tag_class": tag_class,
            "status_name": status_name,
            "status_dot": status_dot,
            "date": formatted_date,
            "url": f"{JIRA_URL}/browse/{issue.get('key')}"
        }
        news_items.append(item)
        
    return news_items

def fetch_confluence_news():
    print("Conectando ao Confluence...")
    auth = HTTPBasicAuth(JIRA_EMAIL, JIRA_TOKEN)
    headers = {"Accept": "application/json"}
    
    # Derivar URL do Confluence
    base_url = JIRA_URL.replace(JIRA_URL.split('/')[-1], "") if JIRA_URL.endswith('/') else JIRA_URL
    # Se JIRA_URL for algo como https://dominio.atlassian.net, ok.
    # Ajuste fino pode ser necessário dependendo da URL exata do Jira enviada no env
    if "atlassian.net" in base_url:
        confluence_url = f"https://{base_url.split('//')[1].split('.')[0]}.atlassian.net/wiki"
    else:
        confluence_url = f"{base_url}/wiki"

    # Buscar páginas com label 'portal-news'
    # CQL: label = "portal-news" AND type = "page" order by created desc
    cql = 'label = "portal-news" AND type = "page" order by created desc'
    
    url = f"{confluence_url}/rest/api/content/search"
    params = {
        "cql": cql,
        "limit": 5,
        "expand": "metadata.labels,history"
    }
    
    response = requests.get(url, headers=headers, auth=auth, params=params)
    
    if response.status_code != 200:
        # Tentar sem /wiki se falhar (algumas instances personalizadas)
        print(f"Erro no Confluence ({url}): {response.status_code}. Tentando sem /wiki...")
        confluence_url = base_url
        url = f"{confluence_url}/rest/api/content/search"
        response = requests.get(url, headers=headers, auth=auth, params=params)
        
        if response.status_code != 200:
            print(f"Erro persistente no Confluence: {response.status_code} - {response.text}")
            return []

    results = response.json().get('results', [])
    news_items = []
    
    for page in results:
        title = page.get('title')
        webui = page.get('_links', {}).get('webui')
        full_url = f"{confluence_url}{webui}"
        
        # Data de criação
        date_str = page.get('history', {}).get('createdDate', '')
        formatted_date = ""
        if date_str:
            try:
                dt = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%S.%f%z")
                formatted_date = dt.strftime("%d/%m/%Y")
            except:
                formatted_date = date_str[:10]

        item = {
            "source": "Confluence",
            "key": page.get('id'),
            "title": title,
            "type_name": "Comunicado",
            "tag_class": "tag-comunicado", # Classe nova a ser criada no CSS
            "status_name": "Publicado",
            "status_dot": "dot-info",
            "date": formatted_date,
            "url": full_url
        }
        news_items.append(item)
        
    return news_items

def main():
    print("Iniciando atualização do Feed de Notícias...")
    
    jira_items = fetch_jira_news()
    confluence_items = fetch_confluence_news()
    
    # Unir e ordenar por data
    # (simplificado: concatena, idealmente parsear data para sort preciso se formato for igual)
    all_items = jira_items + confluence_items
    
    output_file = "news_data.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_items, f, indent=2, ensure_ascii=False)
        
    print(f"Sucesso! {len(all_items)} itens salvos em {output_file} (Jira: {len(jira_items)}, Confluence: {len(confluence_items)}).")

if __name__ == "__main__":
    main()
