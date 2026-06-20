# SharePoint Online - Estrutura de Listas

Criar as listas no mesmo site SharePoint (exemplo: INOVA-Mudancas).

## 1) Lista CLIENTES
Nome tecnico sugerido: CLIENTES

Campos:
- IDCliente
  - Tipo: ID nativo SharePoint (automatico)
- NomeCliente
  - Tipo: Single line of text
  - Obrigatorio: Sim
- Telefone
  - Tipo: Single line of text
  - Obrigatorio: Nao
- Email
  - Tipo: Single line of text
  - Obrigatorio: Nao
- Origem
  - Tipo: Multiple lines of text
  - Obrigatorio: Nao
- Destino
  - Tipo: Multiple lines of text
  - Obrigatorio: Nao
- DataCadastro
  - Tipo: Date and Time
  - Obrigatorio: Sim
  - Valor padrao recomendado: [Today]
- Observacao
  - Tipo: Multiple lines of text
  - Obrigatorio: Nao

Indices recomendados:
- NomeCliente
- Telefone
- DataCadastro

## 2) Lista ORCAMENTOS
Nome tecnico sugerido: ORCAMENTOS

Campos:
- NumeroOrcamento
  - Tipo: Single line of text
  - Obrigatorio: Sim
  - Unico: Sim (enforce unique values)
- DataOrcamento
  - Tipo: Date and Time
  - Obrigatorio: Sim
- Cliente
  - Tipo: Single line of text
  - Obrigatorio: Sim
- Telefone
  - Tipo: Single line of text
  - Obrigatorio: Nao
- Email
  - Tipo: Single line of text
  - Obrigatorio: Nao
- Origem
  - Tipo: Multiple lines of text
  - Obrigatorio: Nao
- Destino
  - Tipo: Multiple lines of text
  - Obrigatorio: Nao
- TipoServico
  - Tipo: Choice (single)
  - Obrigatorio: Sim
  - Valores:
    - Mudanca Residencial
    - Mudanca Comercial
    - Mudanca Predial
- DataPrevistaMudanca
  - Tipo: Date and Time
  - Obrigatorio: Sim
- Valor
  - Tipo: Currency
  - Obrigatorio: Sim
  - Moeda: Real (BRL)
  - Casas decimais: 2
- StatusOrcamento
  - Tipo: Choice (single)
  - Obrigatorio: Sim
  - Valor padrao: Novo
  - Valores:
    - Novo
    - Enviado
    - Aguardando Cliente
    - Em Negociacao
    - Aprovado
    - Reprovado
    - Cancelado
- StatusEntrega
  - Tipo: Choice (single)
  - Obrigatorio: Sim
  - Valor padrao: Nao Agendada
  - Valores:
    - Nao Agendada
    - Agendada
    - Equipe Designada
    - Em Coleta
    - Em Transporte
    - Em Entrega
    - Entregue
    - Finalizada
- Atendente
  - Tipo: Single line of text
  - Obrigatorio: Sim
- Observacao
  - Tipo: Multiple lines of text
  - Obrigatorio: Nao
- DataCadastroSistema
  - Tipo: Date and Time
  - Obrigatorio: Sim

Indices recomendados:
- NumeroOrcamento (alem de unico)
- Cliente
- Atendente
- DataOrcamento
- StatusOrcamento
- StatusEntrega
- DataPrevistaMudanca

## 3) Lista PARAMETROS
Nome tecnico sugerido: PARAMETROS

Campos:
- Chave
  - Tipo: Single line of text
  - Obrigatorio: Sim
  - Unico: Sim
- Valor
  - Tipo: Single line of text
  - Obrigatorio: Sim

Registro inicial:
- Chave: UltimoOrcamento
- Valor: 1

Observacao tecnica:
- Esta lista sera usada pelo fluxo para controlar a sequencia de numero de orcamento.
- O controle de concorrencia sera feito com ETag + repeticao ate sucesso (sem duplicidade).
