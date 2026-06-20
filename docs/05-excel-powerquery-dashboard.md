# Excel Online + Power Query - Dashboard Operacional

## Fonte de dados
Conectar o Excel Online nas listas SharePoint:
- ORCAMENTOS
- CLIENTES (opcional para enriquecimento)

Caminho no Excel:
Dados -> Obter Dados -> Do SharePoint Online List

## Consultas Power Query

## 1) Orcamentos por mes
Passos:
- Base: ORCAMENTOS
- Converter DataOrcamento para tipo date
- Criar coluna AnoMes = Date.ToText([DataOrcamento], "yyyy-MM")
- Agrupar por AnoMes
- Medidas:
  - QtdeOrcamentos
  - ValorTotal

## 2) Orcamentos por atendente
Agrupar por Atendente:
- QtdeOrcamentos
- ValorTotal
- ValorAprovado (somente StatusOrcamento = Aprovado)

## 3) Taxa de conversao
Definicao:
- Conversao = Orcamentos Aprovados / Orcamentos Totais

Criar consulta com:
- TotalOrcamentos = CountRows
- TotalAprovados = CountRows(StatusOrcamento = Aprovado)
- TaxaConversao = TotalAprovados / TotalOrcamentos

## 4) Valor aprovado
Filtrar StatusOrcamento = Aprovado e somar Valor

## 5) Valor perdido
Filtrar StatusOrcamento em (Reprovado, Cancelado) e somar Valor

## 6) Mudancas concluidas
Filtrar StatusEntrega em (Entregue, Finalizada) e contar

## 7) Mudancas em andamento
Filtrar StatusEntrega em:
- Agendada
- Equipe Designada
- Em Coleta
- Em Transporte
- Em Entrega

Contar registros.

## Modelo de dados recomendado
Criar tabelas nomeadas no Excel:
- tbOrcamentos
- tbOrcPorMes
- tbOrcPorAtendente
- tbConversao
- tbMudancasStatus

## Graficos no Dashboard Excel
- Pizza por Status do Orcamento
  - Fonte: resumo por StatusOrcamento
- Colunas por Atendente
  - Fonte: tbOrcPorAtendente (Qtde ou Valor)
- Linha por Mes
  - Fonte: tbOrcPorMes
- Funil Comercial
  - Etapas sugeridas:
    - Novo + Enviado
    - Aguardando Cliente + Em Negociacao
    - Aprovado
    - Reprovado + Cancelado

## KPIs no topo do dashboard
- Orcamentos no mes
- Valor total orcado
- Valor total aprovado
- Taxa de conversao
- Mudancas em andamento
- Mudancas concluidas

## Atualizacao
- Configurar atualizacao manual no Excel Online antes de reunioes
- Em ambiente com Power BI, considerar migracao futura para refresh agendado centralizado
