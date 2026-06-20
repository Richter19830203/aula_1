# Controle de Orcamentos - INOVA Mudancas

Este pacote contem a especificacao completa para implementacao no Microsoft 365.

## Documentos
0. inova_orcamentos.html
1. 01-arquitetura-e-seguranca.md
2. 02-sharepoint-lists.md
3. 03-powerapps-app.md
4. 04-powerautomate-fluxos.md
5. 05-excel-powerquery-dashboard.md
6. 06-implantacao-passo-a-passo.md
7. 07-checklist-go-live.md

## Ordem recomendada de execucao
1. Criar listas SharePoint
2. Criar fluxo fnGerarNumeroOrcamento
3. Montar app Power Apps
4. Configurar Excel e Power Query
5. Testar e publicar

## Resultado
Com estes documentos, voce consegue implantar o sistema completo solicitado com:
- Cadastro de clientes
- Orcamentos com numeracao automatica sem duplicidade
- Consulta com filtros e paginacao
- Atualizacao de entregas
- Dashboard operacional

## Execucao com Neon (PostgreSQL)
1. Abra terminal na pasta docs.
2. Copie .env.example para .env.
3. Preencha DATABASE_URL com a sua string de conexao do Neon.
4. Se voce copiou do Console do Neon, use apenas a URL postgresql://... e nao o comando completo psql '...'.
5. Se quiser trocar a assinatura dos tokens, preencha AUTH_SECRET.
6. Instale dependencias: npm install.
7. Inicie API e pagina: npm start.
8. Acesse no navegador: http://localhost:3001.

Observacoes:
- O login e obrigatorio. Sem autenticacao valida, a pagina permanece bloqueada.
- As credenciais de acesso ficam em [docs/credenciais-responsaveis.txt](credenciais-responsaveis.txt) e sao sincronizadas para a tabela usuarios no Neon ao subir a API.

## Publicacao do backend no Render
1. Suba este repositorio para o GitHub.
2. No Render, clique em New + e depois Blueprint.
3. Selecione o repositorio.
4. O Render vai ler automaticamente [render.yaml](../render.yaml) e criar o servico inova-api apontando para a pasta docs.
5. Em Environment, configure:
	- DATABASE_URL: string do Neon.
	- AUTH_SECRET: segredo forte para assinatura do token.
6. Clique em Apply e aguarde o deploy.
7. Copie a URL publica da API, por exemplo: https://inova-api.onrender.com.

## Como compartilhar o link do Netlify funcionando
1. Use o link do site com o parametro api apontando para a API publica:
	- https://SEU-SITE.netlify.app/?api=https://inova-api.onrender.com
2. Ao abrir com esse parametro, a pagina salva a URL da API no navegador do usuario e passa a usar esse backend para login e dados.
3. Se quiser trocar a API depois, abra novamente com outro parametro api.
