# Excel Desktop + Power Query - Dashboard Operacional

## Fonte de dados
Conectar o Excel diretamente no Neon PostgreSQL:
- orcamentos
- clientes
- responsaveis

## Caminho no Excel Desktop
Dados -> Obter Dados -> De Banco de Dados -> Do PostgreSQL

Se a opcao do PostgreSQL nao aparecer, instale o driver do PostgreSQL no Windows e reinicie o Excel.

## Dados de conexao
- Host: o host do Neon informado na DATABASE_URL
- Porta: 5432
- Banco: neondb ou o nome configurado no Neon
- Usuario: neondb_owner ou o usuario criado no Neon
- SSL: habilitado

## Tabelas recomendadas para consulta
- orcamentos
- clientes
- responsaveis

## Consulta base recomendada
Use a tabela orcamentos como fonte principal e, se quiser enriquecer o dashboard, relacione com clientes e responsaveis.

Exemplo de SQL para o Power Query:

```sql
SELECT
  codigo,
  criado_em,
  cliente,
  origem,
  destino,
  tipo_carga,
  tipo_veiculo,
  itens_produto,
  valor,
  status_orcamento,
  status_entrega,
  responsavel
FROM orcamentos
ORDER BY criado_em DESC;
```

## Power Query com SQL nativo
No Excel, use a opcao de consulta e informe o SQL acima para carregar os dados do Neon em uma tabela do workbook.

## Observacao sobre Excel Online
O Excel Online tem suporte limitado para conexoes diretas com PostgreSQL. Para conexoes automatizadas e atualizacao simples, prefira o Excel Desktop.

Se precisar usar Excel Online, o caminho mais estavel e publicar os dados via API ou usar um fluxo intermediario.
