# Projeto Controle de Orcamentos - Empresa de Mudancas (Microsoft 365)

## Objetivo
Implementar um sistema corporativo para:
- Cadastro de clientes
- Cadastro e consulta de orcamentos
- Acompanhamento de entregas
- Dashboard operacional

## Stack Tecnologica
- Power Apps Canvas App (front-end)
- SharePoint Online Lists (persistencia)
- Power Automate Cloud Flows (automacoes)
- Excel Online + Power Query (analytics)
- Microsoft Entra ID (autenticacao nativa Microsoft 365)

## Arquitetura
Power Apps -> SharePoint Lists -> Power Query -> Dashboard Excel

## Usuarios
- INOVA
- BIANCA
- FABIOLA
- ANDERSON
- MARIA
- GIOVANNA
- ALLANA
- ALLAN

## Identificacao do usuario logado
No Power Apps, usar:
- User().FullName
- User().Email

Nao criar tela de login customizada.

## Modelo de permissao recomendado
- Site SharePoint dedicado: INOVA-Mudancas
- Grupos:
  - INOVA-App-Usuarios: Leitura e Edicao nas listas
  - INOVA-App-Gestores: Controle total + publicacao
- App compartilhado com os grupos acima
- Fluxos com conexao de conta de servico para estabilidade

## Convencoes
- Fuso horario: E. South America Standard Time (America/Sao_Paulo)
- Moeda: BRL
- Prefixo de Orcamento: ORC-ANO-XXXXX
- Campos de auditoria padrao:
  - Atendente (nome do usuario logado)
  - DataCadastroSistema (Now())

## Componentes de interface
- Componente menu lateral unico
- Componente cabecalho com usuario logado e data
- Componente cartao KPI para dashboard
- Componente de filtro reutilizavel para listas

## Responsividade
- Breakpoints sugeridos:
  - Celular: App.Width < 600
  - Tablet: App.Width >= 600 && App.Width < 1024
  - Desktop: App.Width >= 1024
- Usar containers com AutoLayout para evitar sobreposicao.

## Nomenclatura padrao
- Telas: scrDashboard, scrClientes, scrOrcamentos, scrConsulta, scrEntregas, scrRelatorios
- Galerias: galClientes, galOrcamentos, galEntregas
- Formularios: frmCliente, frmOrcamento
- Controles de filtro: fltNumero, fltCliente, fltAtendente, fltStatusOrc, fltStatusEntrega, fltPeriodoIni, fltPeriodoFim

## Tema visual
- Azul escuro: #0B1F3A
- Branco: #FFFFFF
- Cinza claro: #F2F4F7
- Cinza texto: #5B6573
- Sucesso: #16A34A
- Alerta: #F59E0B
- Erro: #DC2626

## Resultado esperado
Sistema pronto para operacao diaria, sem login customizado, com rastreabilidade de atendente, numeracao automatica concorrente e painel gerencial atualizado via Power Query.
