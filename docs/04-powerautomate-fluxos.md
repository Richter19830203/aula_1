# Power Automate - Fluxos do Sistema

## Fluxo 1 - fnGerarNumeroOrcamento (obrigatorio)
Objetivo: gerar numero unico no padrao ORC-ANO-00001 sem duplicidade com usuarios simultaneos.

Tipo de fluxo:
- Instant cloud flow (trigger Power Apps V2)

Conexao:
- SharePoint Online (conta de servico recomendada)

## Estrategia anti-duplicidade
Usar atualizacao com controle de concorrencia otimista por ETag:
1. Ler item da chave UltimoOrcamento em PARAMETROS
2. Calcular proximo valor
3. Tentar atualizar o mesmo item com If-Match = ETag atual
4. Se falhar (412 Precondition Failed), reler e repetir
5. Quando atualizar com sucesso, retornar numero

Essa abordagem evita dois usuarios receberem o mesmo numero.

## Estrutura detalhada do fluxo
1. Trigger: Power Apps (V2)
2. Initialize variable: varSucesso (Boolean) = false
3. Do until: varSucesso = true
4. Dentro do loop:
   - Get items (PARAMETROS)
     - Filter Query: Chave eq 'UltimoOrcamento'
     - Top count: 1
   - Compose itemAtual = first(body('Get_items')?['value'])
   - Compose ultimo = int(outputs('itemAtual')?['Valor'])
   - Compose proximo = add(outputs('ultimo'); 1)
   - Compose ano = formatDateTime(convertTimeZone(utcNow(); 'UTC'; 'E. South America Standard Time'); 'yyyy')
   - Compose numeroFormatado = concat('ORC-'; outputs('ano'); '-'; padLeft(string(outputs('proximo')); 5; '0'))

   - Send an HTTP request to SharePoint
     - Method: POST
     - Uri:
       _api/web/lists/GetByTitle('PARAMETROS')/items(@{outputs('itemAtual')?['ID']})
     - Headers:
       IF-MATCH: @{outputs('itemAtual')?['@odata.etag']}
       X-HTTP-Method: MERGE
       Accept: application/json;odata=verbose
       Content-Type: application/json;odata=verbose
     - Body:
       {
         "__metadata": { "type": "SP.Data.PARAMETROSListItem" },
         "Valor": "@{string(outputs('proximo'))}"
       }

   - Configurar run after:
     - Se HTTP sucesso: Set variable varSucesso = true
     - Se HTTP falhar por conflito: manter varSucesso = false (loop continua)

5. Response para Power Apps:
   - numeroOrcamento = outputs('numeroFormatado')

## Boas praticas adicionais
- Desativar paralelismo no loop (Concurrency Control = Off)
- Definir timeout do loop (exemplo PT1M)
- Registrar logs de erro em lista LOGS_APP (opcional)

## Fluxo 2 - fnNotificarOrcamentoAprovado (opcional)
Objetivo: enviar notificacao quando StatusOrcamento mudar para Aprovado.

Trigger:
- When an item is created or modified (ORCAMENTOS)

Condicao:
- StatusOrcamento = Aprovado

Acoes:
- Enviar email para atendente e gestor
- Registrar data de aprovacao em coluna adicional (se criada)

## Fluxo 3 - fnLembreteMudanca (opcional)
Objetivo: avisar equipe para mudancas no dia seguinte.

Trigger:
- Recurrence diaria (07:00)

Filtro:
- DataPrevistaMudanca = amanha
- StatusEntrega diferente de Finalizada

Acoes:
- Envio de resumo por email/Teams
