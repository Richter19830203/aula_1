# Implantacao Passo a Passo

## Fase 1 - Preparacao
1. Criar site SharePoint dedicado (exemplo: INOVA-Mudancas).
2. Criar grupos de permissao:
   - INOVA-App-Usuarios
   - INOVA-App-Gestores
3. Adicionar usuarios informados aos grupos.

## Fase 2 - Listas SharePoint
1. Criar listas CLIENTES, ORCAMENTOS, PARAMETROS conforme definicao tecnica.
2. Ativar valor unico em:
   - ORCAMENTOS.NumeroOrcamento
   - PARAMETROS.Chave
3. Inserir registro inicial em PARAMETROS:
   - Chave = UltimoOrcamento
   - Valor = 1
4. Criar indices nas colunas de filtro.

## Fase 3 - Power Automate
1. Criar fluxo fnGerarNumeroOrcamento (Instant, Power Apps V2).
2. Implementar loop com ETag (documento 04).
3. Testar concorrencia com 5 disparos simultaneos.
4. Validar retorno sem repeticao.

## Fase 4 - Power Apps
1. Criar Canvas App (Tablet layout responsivo).
2. Adicionar conexoes para listas e fluxo.
3. Configurar App.OnStart com variaveis de usuario e tema.
4. Criar telas:
   - Dashboard
   - Clientes
   - Orcamentos
   - Consulta
   - Entregas
   - Relatorios
5. Aplicar formulas Power Fx conforme documento 03.
6. Configurar menu lateral fixo.
7. Ajustar responsividade (containers + breakpoints).

## Fase 5 - Excel + Power Query
1. Criar arquivo Excel no SharePoint: Dashboard-Orcamentos.xlsx
2. Conectar nas listas SharePoint via Power Query.
3. Criar consultas e tabelas conforme documento 05.
4. Montar aba Dashboard com KPIs e graficos.

## Fase 6 - Testes integrados
1. Testar cadastro de cliente.
2. Testar criacao de orcamento com numero automatico.
3. Validar bloqueios de campos obrigatorios.
4. Testar atualizacao de StatusEntrega.
5. Validar filtros da consulta com paginacao.
6. Conferir dados no dashboard Excel.

## Fase 7 - Publicacao
1. Publicar app no ambiente correto.
2. Compartilhar app com grupos de usuarios.
3. Compartilhar fluxo com conexao de servico.
4. Comunicar URL do app para operacao.

## Fase 8 - Operacao assistida (primeira semana)
1. Monitorar erros em execucoes de fluxo.
2. Acompanhar performance de filtros no app.
3. Ajustar indices SharePoint se necessario.
4. Coletar feedback dos usuarios.

## Criticos de producao
- Nunca remover restricao de unicidade de NumeroOrcamento.
- Nunca gerar numero de orcamento diretamente no Power Apps sem fluxo concorrente.
- Sempre manter PARAMETROS com chave UltimoOrcamento.
