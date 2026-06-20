# Power Apps Canvas App - Telas, Power Fx e Regras

## 1) Conexoes de dados
Adicionar conexoes no app:
- SharePoint: CLIENTES
- SharePoint: ORCAMENTOS
- SharePoint: PARAMETROS
- Power Automate: fluxo fnGerarNumeroOrcamento

## 2) Variaveis globais (App.OnStart)
Formula sugerida:
Set(varUsuarioNome; User().FullName);
Set(varUsuarioEmail; User().Email);
Set(varCorPrimaria; ColorValue("#0B1F3A"));
Set(varCorFundo; ColorValue("#F2F4F7"));
Set(varCorBranco; ColorValue("#FFFFFF"));
Set(varCorTexto; ColorValue("#5B6573"));
Set(varPaginaConsulta; 1);
Set(varItensPorPagina; 20);

## 3) Navegacao e menu lateral
Itens do menu:
- Dashboard
- Clientes
- Orcamentos
- Entregas
- Relatorios

OnSelect dos itens:
Navigate(scrDashboard; ScreenTransition.Fade)
Navigate(scrClientes; ScreenTransition.Fade)
Navigate(scrOrcamentos; ScreenTransition.Fade)
Navigate(scrEntregas; ScreenTransition.Fade)
Navigate(scrRelatorios; ScreenTransition.Fade)

## 4) Tela DASHBOARD (scrDashboard)
KPIs:
- Orcamentos Hoje
  CountRows(Filter(ORCAMENTOS; DateValue(DataOrcamento) = Today()))
- Orcamentos Mes
  CountRows(Filter(ORCAMENTOS; Month(DataOrcamento) = Month(Today()) && Year(DataOrcamento) = Year(Today())))
- Valor Total Orcado
  Sum(Filter(ORCAMENTOS; Month(DataOrcamento) = Month(Today()) && Year(DataOrcamento) = Year(Today())); Valor)
- Valor Total Aprovado
  Sum(Filter(ORCAMENTOS; StatusOrcamento.Value = "Aprovado"); Valor)
- Mudancas Agendadas
  CountRows(Filter(ORCAMENTOS; StatusEntrega.Value = "Agendada" || StatusEntrega.Value = "Equipe Designada" || StatusEntrega.Value = "Em Coleta" || StatusEntrega.Value = "Em Transporte" || StatusEntrega.Value = "Em Entrega"))
- Mudancas Finalizadas
  CountRows(Filter(ORCAMENTOS; StatusEntrega.Value = "Finalizada"))

Graficos (controles de grafico ou galerias agregadas):
- Status Orcamentos
  AddColumns(GroupBy(ORCAMENTOS; StatusOrcamento; grp); Total; CountRows(grp))
- Status Entregas
  AddColumns(GroupBy(ORCAMENTOS; StatusEntrega; grp); Total; CountRows(grp))
- Ranking Atendentes
  SortByColumns(AddColumns(GroupBy(ORCAMENTOS; Atendente; grp); Total; CountRows(grp)); "Total"; Descending)

## 5) Tela CLIENTES (scrClientes)
Campos de cadastro:
- NomeCliente
- Telefone
- Email
- Origem
- Destino
- Observacao

Formulario:
- DataSource: CLIENTES
- Modo novo: NewForm(frmCliente)
- Modo edicao: EditForm(frmCliente)

Botao Novo (OnSelect):
NewForm(frmCliente); ResetForm(frmCliente)

Botao Salvar (OnSelect):
SubmitForm(frmCliente)

frmCliente.OnSuccess:
Notify("Cliente salvo com sucesso"; NotificationType.Success)

Botao Editar (OnSelect):
If(!IsBlank(galClientes.Selected); EditForm(frmCliente))

Botao Excluir (OnSelect):
If(!IsBlank(galClientes.Selected);
   Remove(CLIENTES; galClientes.Selected);
   Notify("Cliente excluido com sucesso"; NotificationType.Success)
)

Pesquisa (galClientes.Items):
SortByColumns(
    Filter(
        CLIENTES;
        IsBlank(txtBuscaCliente.Text)
        || StartsWith(NomeCliente; txtBuscaCliente.Text)
        || StartsWith(Telefone; txtBuscaCliente.Text)
    );
    "NomeCliente";
    Ascending
)

## 6) Tela ORCAMENTOS (scrOrcamentos)
Campos de cadastro:
- NumeroOrcamento (automatico)
- Cliente
- Telefone
- Email
- Origem
- Destino
- TipoServico
- DataPrevistaMudanca
- Valor
- Observacao

Carregar dropdown de cliente (ddCliente.Items):
SortByColumns(CLIENTES; "NomeCliente"; Ascending)

Preencher dados automaticos ao escolher cliente:
- txtTelefone.Default: ddCliente.Selected.Telefone
- txtEmail.Default: ddCliente.Selected.Email
- txtOrigem.Default: ddCliente.Selected.Origem
- txtDestino.Default: ddCliente.Selected.Destino

Botao Novo (OnSelect):
NewForm(frmOrcamento);
ResetForm(frmOrcamento);
Set(varNumeroOrcamento; Blank())

Botao Gerar Numero (OnSelect):
Set(varNumeroOrcamento; fnGerarNumeroOrcamento.Run().numeroOrcamento)

Campo NumeroOrcamento no formulario:
- Default: varNumeroOrcamento
- DisplayMode: DisplayMode.View

Validacoes antes de salvar (botao Salvar - OnSelect):
If(
    IsBlank(ddCliente.Selected.NomeCliente)
    || IsBlank(ddTipoServico.Selected.Value)
    || IsBlank(dtPrevista.SelectedDate)
    || IsBlank(Value(txtValor.Text));
    Notify("Preencha Cliente, Tipo de Servico, Data Prevista e Valor"; NotificationType.Error);
    If(
        IsBlank(varNumeroOrcamento);
        Notify("Gere o numero do orcamento antes de salvar"; NotificationType.Error);
        Patch(
            ORCAMENTOS;
            Defaults(ORCAMENTOS);
            {
                NumeroOrcamento: varNumeroOrcamento;
                DataOrcamento: Today();
                Cliente: ddCliente.Selected.NomeCliente;
                Telefone: ddCliente.Selected.Telefone;
                Email: ddCliente.Selected.Email;
                Origem: ddCliente.Selected.Origem;
                Destino: ddCliente.Selected.Destino;
                TipoServico: { Value: ddTipoServico.Selected.Value };
                DataPrevistaMudanca: dtPrevista.SelectedDate;
                Valor: Value(txtValor.Text);
                StatusOrcamento: { Value: "Novo" };
                StatusEntrega: { Value: "Nao Agendada" };
                Atendente: varUsuarioNome;
                Observacao: txtObservacao.Text;
                DataCadastroSistema: Now()
            }
        );
        Notify("Orcamento salvo com sucesso"; NotificationType.Success);
        ResetForm(frmOrcamento)
    )
)

Botao Editar (OnSelect):
If(!IsBlank(galOrcamentos.Selected); EditForm(frmOrcamento))

Botao Cancelar (OnSelect):
ResetForm(frmOrcamento); ViewForm(frmOrcamento)

## 7) Tela CONSULTA DE ORCAMENTOS (scrConsulta)
Filtros:
- Numero
- Cliente
- Atendente
- StatusOrcamento
- StatusEntrega
- Periodo inicial/final

Colecao base filtrada (botao Buscar - OnSelect):
ClearCollect(
    colOrcamentosFiltrados;
    Filter(
        ORCAMENTOS;
        (IsBlank(fltNumero.Text) || StartsWith(NumeroOrcamento; fltNumero.Text))
        && (IsBlank(fltCliente.Text) || StartsWith(Cliente; fltCliente.Text))
        && (IsBlank(fltAtendente.Text) || StartsWith(Atendente; fltAtendente.Text))
        && (IsBlank(fltStatusOrc.Selected.Value) || StatusOrcamento.Value = fltStatusOrc.Selected.Value)
        && (IsBlank(fltStatusEntrega.Selected.Value) || StatusEntrega.Value = fltStatusEntrega.Selected.Value)
        && (IsBlank(fltPeriodoIni.SelectedDate) || DateValue(DataOrcamento) >= fltPeriodoIni.SelectedDate)
        && (IsBlank(fltPeriodoFim.SelectedDate) || DateValue(DataOrcamento) <= fltPeriodoFim.SelectedDate)
    )
);
Set(varPaginaConsulta; 1)

Galeria com paginacao (galConsulta.Items):
FirstN(
    Skip(
        SortByColumns(colOrcamentosFiltrados; "DataOrcamento"; Descending);
        (varPaginaConsulta - 1) * varItensPorPagina
    );
    varItensPorPagina
)

Botao Proxima pagina (OnSelect):
If(varPaginaConsulta * varItensPorPagina < CountRows(colOrcamentosFiltrados); Set(varPaginaConsulta; varPaginaConsulta + 1))

Botao Pagina anterior (OnSelect):
If(varPaginaConsulta > 1; Set(varPaginaConsulta; varPaginaConsulta - 1))

## 8) Tela ENTREGAS (scrEntregas)
Galeria (galEntregas.Items):
SortByColumns(
    Filter(ORCAMENTOS; !IsBlank(NumeroOrcamento));
    "DataPrevistaMudanca";
    Ascending
)

Campos exibidos:
- NumeroOrcamento
- Cliente
- DataPrevistaMudanca
- StatusEntrega

Atualizacao de status (botao Atualizar - OnSelect):
Patch(
    ORCAMENTOS;
    galEntregas.Selected;
    {
        StatusEntrega: { Value: ddStatusEntregaAtual.Selected.Value }
    }
);
Notify("Status de entrega atualizado"; NotificationType.Success)

## 9) Regras de negocio implementadas
- Atendente automatico: varUsuarioNome
- DataCadastroSistema: Now()
- Valor em moeda: coluna Currency + Value(txtValor.Text)
- Bloqueio de salvamento sem:
  - Cliente
  - Tipo de servico
  - Valor
  - Data prevista

## 10) Lista de status e tipos para controles
TipoServico:
- Mudanca Residencial
- Mudanca Comercial
- Mudanca Predial

StatusOrcamento:
- Novo
- Enviado
- Aguardando Cliente
- Em Negociacao
- Aprovado
- Reprovado
- Cancelado

StatusEntrega:
- Nao Agendada
- Agendada
- Equipe Designada
- Em Coleta
- Em Transporte
- Em Entrega
- Entregue
- Finalizada
