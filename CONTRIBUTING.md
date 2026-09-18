# Como contribuir

## Fluxo de mudanças de código

Mudanças de **código** (HTML, JS, Workers, workflows, configuração) devem passar
por Pull Request antes de ir pra `main`:

1. Crie uma branch a partir de `main` (`git checkout -b minha-mudanca`)
2. Faça as alterações e commit
3. Abra um Pull Request pra `main`
4. Revise (mesmo sozinho, é uma chance de reler o diff antes de mergear) e só
   então faça o merge

Evite `git push` direto pra `main` para mudanças de código.

## Exceção: dados automáticos

Os workflows abaixo **empurram direto pra `main` sozinhos**, sem PR — isso é
esperado e não deve ser mudado, pois eles só tocam nos arquivos de dados
gerados automaticamente a partir do Jira (não é código):

| Workflow | Arquivo que atualiza |
|---|---|
| `atualizar-incidentes.yml` | `dados-incidentes.json` |
| `atualizar-dashboard.yml` | `dados-mudancas.json` |
| `atualizar-score.yml` | `score-jira-data.json` |
| `update_feed.yml` | `news_data.json` / `spaces_data.json` |

Se algum dia esses workflows precisarem de mudança de **lógica** (o script
Python em si), essa mudança de código segue o fluxo normal de PR — só a
publicação automática dos dados é que é direto na `main`.

## Segredos

Nunca commite um `.env` real, tokens ou senhas. Veja `.env.example` pra saber
quais variáveis o projeto usa e onde cada uma precisa ser configurada
(GitHub Actions Secrets, Cloudflare Worker Secrets, ou `.env` local).
