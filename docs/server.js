const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const { Pool } = require("pg");
require("dotenv").config();

console.log("PORT =", process.env.PORT);
console.log("DATABASE_URL =", process.env.DATABASE_URL ? "ENCONTRADA" : "VAZIA");
console.log("AUTH_SECRET =", process.env.AUTH_SECRET ? "ENCONTRADA" : "VAZIA");

const app = express();
const port = Number(process.env.PORT || 3001);

function normalizeDatabaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (raw.startsWith("postgresql://") || raw.startsWith("postgres://")) {
    return raw;
  }

  const match = raw.match(/postgres(?:ql)?:\/\/[^'"\s]+/i);
  return match ? match[0] : raw;
}

const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
const authSecret = process.env.AUTH_SECRET || "inova-auth-secret-dev";
const credentialsFilePath = path.join(__dirname, "credenciais-responsaveis.txt");

if (!databaseUrl) {
  console.error("DATABASE_URL nao configurada. Crie um arquivo .env com a string de conexao do Neon.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function normalizeUserName(value) {
  return String(value || "").trim().toUpperCase();
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  const left = Buffer.from(hash, "hex");
  const right = Buffer.from(expectedHash, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function ensureUsersTable(target = pool) {
  await target.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      username TEXT PRIMARY KEY,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role_name TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ
    );
  `);
}

function signAuthToken(username) {
  const payload = JSON.stringify({
    username,
    exp: Date.now() + 1000 * 60 * 60 * 12
  });
  const payloadBase64 = Buffer.from(payload).toString("base64url");
  const signature = crypto.createHmac("sha256", authSecret).update(payloadBase64).digest("base64url");
  return `${payloadBase64}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || !token.includes(".")) {
    return null;
  }

  const [payloadBase64, signature] = token.split(".");
  const expectedSignature = crypto.createHmac("sha256", authSecret).update(payloadBase64).digest("base64url");
  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
    if (!payload.exp || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch (_error) {
    return null;
  }
}

async function readCredentialsFile() {
  const defaultContent = [
    "PEDRO;PEDRO@123",
    "ANDERSON;ANDERSON@123",
    "MARIA;MARIA@123",
    "BIANCA;BIANCA@123",
    "GIOVANNA;GIOVANNA@123",
    "FABIOLA;FABIOLA@123",
    "ALLANA;ALLANA@123",
    "ALLAN;ALLAN@123",
    "INOVA;INOVA@ADM123"
  ].join("\n");

  try {
    const content = await fs.readFile(credentialsFilePath, "utf8");
    return content || defaultContent;
  } catch (_error) {
    await fs.writeFile(credentialsFilePath, `${defaultContent}\n`, "utf8");
    return defaultContent;
  }
}

function parseCredentialsContent(content) {
  return String(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [username, password] = line.split(";").map((part) => part.trim());
      if (!username || !password) {
        return null;
      }
      return { username: normalizeUserName(username), password };
    })
    .filter(Boolean);
}

async function writeCredentialsFile(credentials) {
  const lines = credentials
    .filter((item) => item && item.username && item.password)
    .map((item) => `${normalizeUserName(item.username)};${String(item.password).trim()}`);
  const content = lines.join("\n");
  await fs.writeFile(credentialsFilePath, content ? `${content}\n` : "", "utf8");
}

async function syncUsersFromFile() {
  const content = await readCredentialsFile();
  const credentials = parseCredentialsContent(content);

  await ensureUsersTable();

  for (const credential of credentials) {
    const roleName = credential.username === "INOVA" ? "ADMIN" : "RESPONSAVEL";
    const passwordRecord = createPasswordRecord(credential.password);
    await pool.query(
      `
      INSERT INTO usuarios (username, password_salt, password_hash, role_name, atualizado_em)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (username) DO UPDATE SET
        password_salt = EXCLUDED.password_salt,
        password_hash = EXCLUDED.password_hash,
        role_name = EXCLUDED.role_name,
        atualizado_em = NOW();
      `,
      [credential.username, passwordRecord.salt, passwordRecord.hash, roleName]
    );
  }
}

async function syncResponsaveisSeedFromFile() {
  const content = await readCredentialsFile();
  const credentials = parseCredentialsContent(content);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS responsaveis (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL UNIQUE,
      rg TEXT,
      telefone TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ
    );
  `);

  const countResult = await pool.query("SELECT COUNT(*)::int AS total FROM responsaveis");
  const total = Number(countResult.rows[0] && countResult.rows[0].total ? countResult.rows[0].total : 0);
  if (total > 0) {
    return;
  }

  for (let i = 0; i < credentials.length; i += 1) {
    const credential = credentials[i];
    await pool.query(
      `
      INSERT INTO responsaveis (id, nome, rg, telefone, atualizado_em)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (id) DO NOTHING;
      `,
      [i + 1, credential.username, "", ""]
    );
  }
}

const TIPOS_SERVICO_PADRAO = [
  { codigo: "001", descricao: "Mudança Residencial", categoria: "Mudanças", abrangencia: "Municipal", necessitaSeguro: true, status: "Ativo", observacoes: "" },
  { codigo: "002", descricao: "Mudança Comercial", categoria: "Mudanças", abrangencia: "Municipal", necessitaSeguro: true, status: "Ativo", observacoes: "" },
  { codigo: "003", descricao: "Transporte de Veículos", categoria: "Transportes", abrangencia: "Interestadual", necessitaSeguro: true, status: "Ativo", observacoes: "" },
  { codigo: "004", descricao: "Transporte de Motocicletas", categoria: "Transportes", abrangencia: "Interestadual", necessitaSeguro: true, status: "Ativo", observacoes: "" },
  { codigo: "005", descricao: "Transporte de Móveis", categoria: "Transportes", abrangencia: "Municipal", necessitaSeguro: true, status: "Ativo", observacoes: "" },
  { codigo: "006", descricao: "Carga Fracionada", categoria: "Transportes", abrangencia: "Interestadual", necessitaSeguro: true, status: "Ativo", observacoes: "" },
  { codigo: "007", descricao: "Carga Fechada", categoria: "Transportes", abrangencia: "Interestadual", necessitaSeguro: true, status: "Ativo", observacoes: "" },
  { codigo: "008", descricao: "Objetos de Valor", categoria: "Especial", abrangencia: "Interestadual", necessitaSeguro: true, status: "Ativo", observacoes: "" },
  { codigo: "009", descricao: "Obras de Arte", categoria: "Especial", abrangencia: "Interestadual", necessitaSeguro: true, status: "Ativo", observacoes: "" },
  { codigo: "010", descricao: "Guarda-Móveis", categoria: "Armazenagem", abrangencia: "Municipal", necessitaSeguro: false, status: "Ativo", observacoes: "" },
  { codigo: "011", descricao: "Mudança Interestadual", categoria: "Mudanças", abrangencia: "Interestadual", necessitaSeguro: true, status: "Ativo", observacoes: "" },
  { codigo: "012", descricao: "Mudança Intermunicipal", categoria: "Mudanças", abrangencia: "Intermunicipal", necessitaSeguro: true, status: "Ativo", observacoes: "" },
  { codigo: "013", descricao: "Mudança Local", categoria: "Mudanças", abrangencia: "Municipal", necessitaSeguro: true, status: "Ativo", observacoes: "" },
  { codigo: "014", descricao: "Frete Dedicado", categoria: "Logística", abrangencia: "Interestadual", necessitaSeguro: true, status: "Ativo", observacoes: "" },
  { codigo: "015", descricao: "Coleta e Entrega", categoria: "Logística", abrangencia: "Municipal", necessitaSeguro: false, status: "Ativo", observacoes: "" }
];

const OPCOES_LOOKUP_PADRAO = {
  tipo_veiculo: [
    { codigo: "001", descricao: "Moto", ordem: 1 },
    { codigo: "002", descricao: "Utilitario Pequeno", ordem: 2 },
    { codigo: "003", descricao: "Fiorino", ordem: 3 },
    { codigo: "004", descricao: "Van", ordem: 4 },
    { codigo: "005", descricao: "VUC (Veiculo Urbano de Carga)", ordem: 5 },
    { codigo: "006", descricao: "3/4", ordem: 6 },
    { codigo: "007", descricao: "Toco", ordem: 7 },
    { codigo: "008", descricao: "Truck", ordem: 8 },
    { codigo: "009", descricao: "Carreta Simples", ordem: 9 },
    { codigo: "010", descricao: "Carreta LS", ordem: 10 },
    { codigo: "011", descricao: "Bitrem", ordem: 11 },
    { codigo: "012", descricao: "Rodotrem", ordem: 12 },
    { codigo: "013", descricao: "Bau", ordem: 13 },
    { codigo: "014", descricao: "Bau Refrigerado", ordem: 14 },
    { codigo: "015", descricao: "Sider", ordem: 15 },
    { codigo: "016", descricao: "Graneleiro", ordem: 16 },
    { codigo: "017", descricao: "Tanque", ordem: 17 },
    { codigo: "018", descricao: "Plataforma", ordem: 18 },
    { codigo: "019", descricao: "Prancha", ordem: 19 },
    { codigo: "020", descricao: "Munck", ordem: 20 },
    { codigo: "021", descricao: "Cegonha", ordem: 21 },
    { codigo: "022", descricao: "Container 20 pes", ordem: 22 },
    { codigo: "023", descricao: "Container 40 pes", ordem: 23 }
  ],
  tipo_carga: [
    { codigo: "Carga Geral", descricao: "Carga Geral", ordem: 1 },
    { codigo: "Carga Fracionada", descricao: "Carga Fracionada", ordem: 2 },
    { codigo: "Carga Completa (FTL)", descricao: "Carga Completa (FTL)", ordem: 3 },
    { codigo: "Carga Refrigerada", descricao: "Carga Refrigerada", ordem: 4 },
    { codigo: "Carga Perigosa", descricao: "Carga Perigosa", ordem: 5 },
    { codigo: "Moveis", descricao: "Moveis", ordem: 6 },
    { codigo: "Eletrodomesticos", descricao: "Eletrodomesticos", ordem: 7 },
    { codigo: "Eletronicos", descricao: "Eletronicos", ordem: 8 },
    { codigo: "Veiculos", descricao: "Veiculos", ordem: 9 },
    { codigo: "Documentos", descricao: "Documentos", ordem: 10 },
    { codigo: "Animais Vivos", descricao: "Animais Vivos", ordem: 11 },
    { codigo: "Obras de Arte", descricao: "Obras de Arte", ordem: 12 },
    { codigo: "Alimenticios", descricao: "Alimenticios", ordem: 13 },
    { codigo: "Texteis", descricao: "Texteis", ordem: 14 },
    { codigo: "Outros", descricao: "Outros", ordem: 15 }
  ],
  status_orcamento: [
    { codigo: "Solicitado", descricao: "Solicitado", ordem: 1 },
    { codigo: "Em Elaboracao", descricao: "Em Elaboração", ordem: 2 },
    { codigo: "Enviado", descricao: "Enviado", ordem: 3 },
    { codigo: "Em Negociacao", descricao: "Em Negociação", ordem: 4 },
    { codigo: "Aguardando Retorno", descricao: "Aguardando Retorno", ordem: 5 },
    { codigo: "Aprovado", descricao: "Aprovado", ordem: 6 },
    { codigo: "Contratado", descricao: "Contratado", ordem: 7 },
    { codigo: "Reprovado", descricao: "Reprovado", ordem: 8 },
    { codigo: "Cancelado", descricao: "Cancelado", ordem: 9 }
  ],
  status_entrega: [
    { codigo: "Aguardando", descricao: "Aguardando", ordem: 1 },
    { codigo: "Pedido Recebido", descricao: "Pedido Recebido", ordem: 2 },
    { codigo: "Programado", descricao: "Programado", ordem: 3 },
    { codigo: "Coletado", descricao: "Coletado", ordem: 4 },
    { codigo: "Em Rota", descricao: "Em Rota", ordem: 5 },
    { codigo: "Em Transporte", descricao: "Em Transporte", ordem: 6 },
    { codigo: "Entregue", descricao: "Entregue", ordem: 7 },
    { codigo: "Reagendado", descricao: "Reagendado", ordem: 8 },
    { codigo: "Ocorrencia", descricao: "Ocorrencia", ordem: 9 },
    { codigo: "Cancelado", descricao: "Cancelado", ordem: 10 }
  ],
  categoria_servico: [
    { codigo: "Mudanças", descricao: "Mudanças", ordem: 1 },
    { codigo: "Transportes", descricao: "Transportes", ordem: 2 },
    { codigo: "Armazenagem", descricao: "Armazenagem", ordem: 3 },
    { codigo: "Logística", descricao: "Logística", ordem: 4 },
    { codigo: "Especial", descricao: "Especial", ordem: 5 }
  ],
  abrangencia_servico: [
    { codigo: "Municipal", descricao: "Municipal", ordem: 1 },
    { codigo: "Intermunicipal", descricao: "Intermunicipal", ordem: 2 },
    { codigo: "Interestadual", descricao: "Interestadual", ordem: 3 },
    { codigo: "Internacional", descricao: "Internacional", ordem: 4 }
  ],
  nome_categoria_despesa: [
    { codigo: "Agua", descricao: "Agua", ordem: 1 },
    { codigo: "Alimentacao", descricao: "Alimentacao", ordem: 2 },
    { codigo: "Aluguel", descricao: "Aluguel", ordem: 3 },
    { codigo: "Borracharia", descricao: "Borracharia", ordem: 4 },
    { codigo: "Combustivel", descricao: "Combustivel", ordem: 5 },
    { codigo: "Contabilidade", descricao: "Contabilidade", ordem: 6 },
    { codigo: "Energia", descricao: "Energia", ordem: 7 },
    { codigo: "Estacionamento", descricao: "Estacionamento", ordem: 8 },
    { codigo: "Hospedagem", descricao: "Hospedagem", ordem: 9 },
    { codigo: "Impostos", descricao: "Impostos", ordem: 10 },
    { codigo: "Internet", descricao: "Internet", ordem: 11 },
    { codigo: "IPVA", descricao: "IPVA", ordem: 12 },
    { codigo: "Lavagem", descricao: "Lavagem", ordem: 13 },
    { codigo: "Licenciamento", descricao: "Licenciamento", ordem: 14 },
    { codigo: "Manutencao", descricao: "Manutencao", ordem: 15 },
    { codigo: "Marketing", descricao: "Marketing", ordem: 16 },
    { codigo: "Material de Escritorio", descricao: "Material de Escritorio", ordem: 17 },
    { codigo: "Pedagio", descricao: "Pedagio", ordem: 18 },
    { codigo: "Pneus", descricao: "Pneus", ordem: 19 },
    { codigo: "Salario", descricao: "Salario", ordem: 20 },
    { codigo: "Seguro", descricao: "Seguro", ordem: 21 },
    { codigo: "Sistema", descricao: "Sistema", ordem: 22 },
    { codigo: "Telefone", descricao: "Telefone", ordem: 23 },
    { codigo: "Vale Alimentacao", descricao: "Vale Alimentacao", ordem: 24 },
    { codigo: "Vale Refeicao", descricao: "Vale Refeicao", ordem: 25 },
    { codigo: "Outros", descricao: "Outros", ordem: 26 }
  ],
  nome_forma_pagamento: [
    { codigo: "Boleto Bancario", descricao: "Boleto Bancario", ordem: 1 },
    { codigo: "Cartao de Credito", descricao: "Cartao de Credito", ordem: 2 },
    { codigo: "Cartao de Debito", descricao: "Cartao de Debito", ordem: 3 },
    { codigo: "Dinheiro", descricao: "Dinheiro", ordem: 4 },
    { codigo: "DOC", descricao: "DOC", ordem: 5 },
    { codigo: "PIX", descricao: "PIX", ordem: 6 },
    { codigo: "TED", descricao: "TED", ordem: 7 },
    { codigo: "Transferencia Bancaria", descricao: "Transferencia Bancaria", ordem: 8 },
    { codigo: "Outros", descricao: "Outros", ordem: 9 }
  ],
  nome_centro_custo: [
    { codigo: "Administrativo", descricao: "Administrativo", ordem: 1 },
    { codigo: "Comercial", descricao: "Comercial", ordem: 2 },
    { codigo: "Diretoria", descricao: "Diretoria", ordem: 3 },
    { codigo: "Financeiro", descricao: "Financeiro", ordem: 4 },
    { codigo: "Frota", descricao: "Frota", ordem: 5 },
    { codigo: "Logistica", descricao: "Logistica", ordem: 6 },
    { codigo: "Operacional", descricao: "Operacional", ordem: 7 },
    { codigo: "Recursos Humanos", descricao: "Recursos Humanos", ordem: 8 },
    { codigo: "Tecnologia", descricao: "Tecnologia", ordem: 9 }
  ]
};

async function syncTiposServicoSeed() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tipos_servico (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      codigo TEXT NOT NULL UNIQUE,
      descricao TEXT NOT NULL,
      categoria TEXT NOT NULL,
      abrangencia TEXT NOT NULL,
      necessita_seguro BOOLEAN NOT NULL,
      status TEXT NOT NULL,
      observacoes TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ
    );
  `);

  for (const item of TIPOS_SERVICO_PADRAO) {
    await pool.query(
      `
      INSERT INTO tipos_servico (codigo, descricao, categoria, abrangencia, necessita_seguro, status, observacoes, atualizado_em)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      ON CONFLICT (codigo) DO NOTHING;
      `,
      [item.codigo, item.descricao, item.categoria, item.abrangencia, item.necessitaSeguro, item.status, item.observacoes]
    );
  }
}

async function syncOpcoesDropdownSeed() {
  for (const [tipo, opcoes] of Object.entries(OPCOES_LOOKUP_PADRAO)) {
    for (const op of opcoes) {
      await pool.query(
        `
        INSERT INTO opcoes_lookup (tipo, codigo, descricao, ordem)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (tipo, codigo) DO NOTHING;
        `,
        [tipo, op.codigo, op.descricao, op.ordem]
      );
    }
  }
}

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      rg TEXT NOT NULL,
      telefone TEXT NOT NULL,
      endereco TEXT NOT NULL,
      estado TEXT NOT NULL,
      bairro TEXT NOT NULL,
      cep TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orcamentos (
      codigo TEXT PRIMARY KEY,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ,
      cliente TEXT NOT NULL,
      a_c TEXT,
      contato TEXT,
      origem TEXT NOT NULL,
      origem_uf TEXT,
      destino TEXT NOT NULL,
      destino_uf TEXT,
      itens_produto JSONB,
      tipo_carga TEXT,
      peso NUMERIC,
      volume NUMERIC,
      prazo INTEGER,
      valor NUMERIC NOT NULL,
      validade DATE,
      status_orcamento TEXT NOT NULL,
      status_entrega TEXT NOT NULL,
      responsavel TEXT,
      observacoes TEXT
    );
  `);

  await pool.query("ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS a_c TEXT");
  await pool.query("ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS origem_uf TEXT");
  await pool.query("ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS destino_uf TEXT");
  await pool.query("ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS quantidade INTEGER");
  await pool.query("ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS descricao TEXT");
  await pool.query("ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS tipo_veiculo TEXT");
  await pool.query("ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS itens_produto JSONB");
  await pool.query("ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS tipo_servico_id INTEGER");
  await pool.query("ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS tipo_servico_descricao TEXT");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS responsaveis (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL UNIQUE,
      rg TEXT,
      telefone TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS motoristas (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      cpf TEXT NOT NULL,
      rg TEXT NOT NULL,
      cnh TEXT NOT NULL,
      categoria_cnh TEXT NOT NULL,
      validade_cnh DATE NOT NULL,
      telefone TEXT NOT NULL,
      email TEXT NOT NULL,
      endereco TEXT NOT NULL,
      cidade TEXT NOT NULL,
      estado TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS veiculos (
      id TEXT PRIMARY KEY,
      placa TEXT NOT NULL UNIQUE,
      modelo TEXT NOT NULL,
      marca TEXT NOT NULL,
      ano INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      capacidade TEXT NOT NULL,
      motorista_responsavel TEXT NOT NULL,
      observacoes TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS categorias_despesas (
      codigo INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      status TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS formas_pagamento (
      codigo INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      status TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS centros_custo (
      codigo INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      status TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS despesas (
      codigo TEXT PRIMARY KEY,
      data_despesa DATE NOT NULL,
      competencia TEXT NOT NULL,
      tipo_despesa TEXT NOT NULL,
      categoria TEXT NOT NULL,
      centro_custo TEXT NOT NULL,
      fornecedor TEXT,
      descricao TEXT NOT NULL,
      valor NUMERIC NOT NULL,
      forma_pagamento TEXT NOT NULL,
      situacao TEXT NOT NULL,
      cliente TEXT,
      orcamento TEXT,
      veiculo TEXT,
      motorista TEXT,
      responsavel TEXT,
      anexo_nome TEXT,
      observacoes TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tipos_servico (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      codigo TEXT NOT NULL UNIQUE,
      descricao TEXT NOT NULL,
      categoria TEXT NOT NULL,
      abrangencia TEXT NOT NULL,
      necessita_seguro BOOLEAN NOT NULL,
      status TEXT NOT NULL,
      observacoes TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS opcoes_lookup (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      tipo TEXT NOT NULL,
      codigo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      ordem INTEGER NOT NULL DEFAULT 0,
      UNIQUE(tipo, codigo)
    );
  `);
}

function ensureArray(input) {
  return Array.isArray(input) ? input : [];
}

function authenticateRequest(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const payload = verifyAuthToken(token);

  if (!payload) {
    return res.status(401).json({ error: "Nao autenticado" });
  }

  req.auth = payload;
  next();
}

// Rotas publicas - registradas ANTES do middleware de autenticacao
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const username = normalizeUserName(req.body && req.body.username);
    const password = String(req.body && req.body.password ? req.body.password : "");

    if (!username || !password) {
      return res.status(400).json({ error: "Usuario e senha sao obrigatorios" });
    }

    const result = await pool.query(
      `
      SELECT username, password_salt, password_hash, role_name
      FROM usuarios
      WHERE username = $1
      `,
      [username]
    );

    const user = result.rows[0];
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      return res.status(401).json({ error: "Usuario ou senha invalidos" });
    }

    const token = signAuthToken(user.username);
    res.json({
      token,
      user: {
        username: user.username,
        role: user.role_name
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Middleware de autenticacao aplicado a todas as rotas protegidas abaixo


app.use("/api", authenticateRequest);

app.get("/api/auth/me", async (req, res) => {
  res.json({
    user: {
      username: req.auth.username,
      exp: req.auth.exp
    }
  });
});

app.get("/api/clientes", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        nome,
        rg,
        telefone,
        endereco,
        estado,
        bairro,
        cep,
        criado_em AS "criadoEm",
        atualizado_em AS "atualizadoEm"
      FROM clientes
      ORDER BY nome ASC;
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/clientes/bulk", async (req, res) => {
  const items = ensureArray(req.body && req.body.items);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM clientes");

    for (const item of items) {
      await client.query(
        `
        INSERT INTO clientes (
          id, nome, rg, telefone, endereco, estado, bairro, cep, criado_em, atualizado_em
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `,
        [
          item.id,
          item.nome,
          item.rg,
          item.telefone,
          item.endereco,
          item.estado,
          item.bairro,
          item.cep,
          item.criadoEm || new Date().toISOString(),
          item.atualizadoEm || null
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, count: items.length });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("========================================");
    console.error("ERRO NA ROTA /api/responsaveis/bulk");
    console.error("Mensagem:", error.message);
    console.error("Stack:");
    console.error(error.stack);
    console.error("Payload recebido:");
    console.error(JSON.stringify(req.body, null, 2));
    console.error("========================================");

    res.status(500).json({
      ok: false,
      error: error.message
    });
  } finally {
    client.release();
  }
});

app.get("/api/responsaveis", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        nome,
        COALESCE(rg, '') AS rg,
        COALESCE(telefone, '') AS telefone,
        criado_em AS "criadoEm",
        atualizado_em AS "atualizadoEm"
      FROM responsaveis
      ORDER BY id ASC;
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/responsaveis/bulk", async (req, res) => {
  const items = ensureArray(req.body && req.body.items);
  const client = await pool.connect();

  try {
    await ensureUsersTable(client);

    const credentialsFromFile = parseCredentialsContent(await readCredentialsFile());
    const credentialsMap = new Map(
      credentialsFromFile.map((item) => [normalizeUserName(item.username), String(item.password).trim()])
    );

    const normalizedItems = items.map((item) => ({
      id: Number(item.id),
      nome: normalizeUserName(item.nome),
      nomeAnterior: normalizeUserName(item.nomeAnterior || item.nome),
      rg: item.rg || "",
      telefone: item.telefone || "",
      senha: String(item.senha || "").trim(),
      criadoEm: item.criadoEm || new Date().toISOString(),
      atualizadoEm: item.atualizadoEm || null
    }));

    const credentialsToPersist = [];

    const usernames = Array.from(new Set(normalizedItems.flatMap((item) => [item.nome, item.nomeAnterior]).filter(Boolean)));
    await client.query("BEGIN");

    const existingUsersResult = usernames.length > 0
      ? await client.query(
          `
          SELECT username, password_salt, password_hash
          FROM usuarios
          WHERE username = ANY($1::text[])
          `,
          [usernames]
        )
      : { rows: [] };
    const existingUsersMap = new Map(
      existingUsersResult.rows.map((row) => [normalizeUserName(row.username), row])
    );

    await client.query("DELETE FROM responsaveis");

    for (const item of normalizedItems) {
      if (!Number.isFinite(item.id) || item.id <= 0 || !item.nome) {
        throw new Error("Responsavel invalido no payload.");
      }

      const senhaPlana = item.senha
        || credentialsMap.get(item.nome)
        || credentialsMap.get(item.nomeAnterior)
        || "";

      if (!senhaPlana) {
        throw new Error(`O responsavel ${item.nome} precisa de senha para atualizar credenciais.`);
      }

      credentialsMap.set(item.nome, senhaPlana);
      if (item.nomeAnterior && item.nomeAnterior !== item.nome) {
        credentialsMap.delete(item.nomeAnterior);
      }
      credentialsToPersist.push({ username: item.nome, password: senhaPlana });

      await client.query(
        `
        INSERT INTO responsaveis (
          id, nome, rg, telefone, criado_em, atualizado_em
        ) VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [
          item.id,
          item.nome,
          item.rg,
          item.telefone,
          item.criadoEm,
          item.atualizadoEm
        ]
      );

      const existingUser = existingUsersMap.get(item.nome) || existingUsersMap.get(item.nomeAnterior);
      let passwordSalt = existingUser ? existingUser.password_salt : "";
      let passwordHash = existingUser ? existingUser.password_hash : "";

      if (item.senha) {
        const passwordRecord = createPasswordRecord(item.senha);
        passwordSalt = passwordRecord.salt;
        passwordHash = passwordRecord.hash;
      }

      if (!passwordSalt || !passwordHash) {
        throw new Error(`O responsavel ${item.nome} precisa de uma senha para acessar.`);
      }

      const roleName = item.nome === "INOVA" ? "ADMIN" : "RESPONSAVEL";

      await client.query(
        `
        INSERT INTO usuarios (username, password_salt, password_hash, role_name, atualizado_em)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (username) DO UPDATE SET
          password_salt = EXCLUDED.password_salt,
          password_hash = EXCLUDED.password_hash,
          role_name = EXCLUDED.role_name,
          atualizado_em = NOW();
        `,
        [item.nome, passwordSalt, passwordHash, roleName]
      );

      if (item.nomeAnterior && item.nomeAnterior !== item.nome) {
        await client.query(
          "DELETE FROM usuarios WHERE username = $1 AND role_name = 'RESPONSAVEL'",
          [item.nomeAnterior]
        );
      }
    }

    const activeUsernames = normalizedItems.map((item) => item.nome);
    await client.query(
      `
      DELETE FROM usuarios
      WHERE role_name = 'RESPONSAVEL'
        AND NOT (username = ANY($1::text[]))
      `,
      [activeUsernames]
    );

    await client.query("COMMIT");
    await writeCredentialsFile(credentialsToPersist);
    res.json({ ok: true, count: items.length });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("======================================");
    console.error("ERRO NA ROTA /api/responsaveis/bulk");
    console.error("Mensagem:", error.message);
    console.error("Stack:");
    console.error(error.stack);
    console.error("Payload recebido:");
    console.error(JSON.stringify(req.body, null, 2));
    console.error("======================================");

    res.status(500).json({
      ok: false,
      error: error.message
    });
  } finally {
    client.release();
  }
});

app.get("/api/motoristas", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        nome,
        cpf,
        rg,
        cnh,
        categoria_cnh AS "categoriaCnh",
        validade_cnh AS "validadeCnh",
        telefone,
        email,
        endereco,
        cidade,
        estado,
        criado_em AS "criadoEm",
        atualizado_em AS "atualizadoEm"
      FROM motoristas
      ORDER BY nome ASC;
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/motoristas/bulk", async (req, res) => {
  const items = ensureArray(req.body && req.body.items);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM motoristas");

    for (const item of items) {
      await client.query(
        `
        INSERT INTO motoristas (
          id, nome, cpf, rg, cnh, categoria_cnh, validade_cnh, telefone, email, endereco, cidade, estado, criado_em, atualizado_em
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        `,
        [
          item.id,
          item.nome,
          item.cpf,
          item.rg,
          item.cnh,
          item.categoriaCnh,
          item.validadeCnh,
          item.telefone,
          item.email,
          item.endereco,
          item.cidade,
          item.estado,
          item.criadoEm || new Date().toISOString(),
          item.atualizadoEm || null
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, count: items.length });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
});

app.get("/api/veiculos", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        placa,
        modelo,
        marca,
        ano,
        tipo,
        capacidade,
        motorista_responsavel AS "motoristaResponsavel",
        observacoes,
        criado_em AS "criadoEm",
        atualizado_em AS "atualizadoEm"
      FROM veiculos
      ORDER BY placa ASC;
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/veiculos/bulk", async (req, res) => {
  const items = ensureArray(req.body && req.body.items);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM veiculos");

    for (const item of items) {
      await client.query(
        `
        INSERT INTO veiculos (
          id, placa, modelo, marca, ano, tipo, capacidade, motorista_responsavel, observacoes, criado_em, atualizado_em
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `,
        [
          item.id,
          item.placa,
          item.modelo,
          item.marca,
          Number(item.ano),
          item.tipo,
          item.capacidade,
          item.motoristaResponsavel,
          item.observacoes || null,
          item.criadoEm || new Date().toISOString(),
          item.atualizadoEm || null
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, count: items.length });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
});

app.get("/api/categorias-despesas", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        codigo,
        nome,
        tipo,
        status,
        criado_em AS "criadoEm",
        atualizado_em AS "atualizadoEm"
      FROM categorias_despesas
      ORDER BY codigo ASC;
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/categorias-despesas/bulk", async (req, res) => {
  const items = ensureArray(req.body && req.body.items);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM categorias_despesas");

    for (const item of items) {
      await client.query(
        `
        INSERT INTO categorias_despesas (
          codigo, nome, tipo, status, criado_em, atualizado_em
        ) VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [
          Number(item.codigo),
          item.nome,
          item.tipo,
          item.status,
          item.criadoEm || new Date().toISOString(),
          item.atualizadoEm || null
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, count: items.length });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
});

app.get("/api/formas-pagamento", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        codigo,
        nome,
        status,
        criado_em AS "criadoEm",
        atualizado_em AS "atualizadoEm"
      FROM formas_pagamento
      ORDER BY codigo ASC;
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/formas-pagamento/bulk", async (req, res) => {
  const items = ensureArray(req.body && req.body.items);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM formas_pagamento");

    for (const item of items) {
      await client.query(
        `
        INSERT INTO formas_pagamento (
          codigo, nome, status, criado_em, atualizado_em
        ) VALUES ($1,$2,$3,$4,$5)
        `,
        [
          Number(item.codigo),
          item.nome,
          item.status,
          item.criadoEm || new Date().toISOString(),
          item.atualizadoEm || null
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, count: items.length });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
});

app.get("/api/centros-custo", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        codigo,
        nome,
        status,
        criado_em AS "criadoEm",
        atualizado_em AS "atualizadoEm"
      FROM centros_custo
      ORDER BY codigo ASC;
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/centros-custo/bulk", async (req, res) => {
  const items = ensureArray(req.body && req.body.items);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM centros_custo");

    for (const item of items) {
      await client.query(
        `
        INSERT INTO centros_custo (
          codigo, nome, status, criado_em, atualizado_em
        ) VALUES ($1,$2,$3,$4,$5)
        `,
        [
          Number(item.codigo),
          item.nome,
          item.status,
          item.criadoEm || new Date().toISOString(),
          item.atualizadoEm || null
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, count: items.length });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
});

app.get("/api/despesas", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        codigo,
        data_despesa AS "dataDespesa",
        competencia,
        tipo_despesa AS "tipoDespesa",
        categoria,
        centro_custo AS "centroCusto",
        fornecedor,
        descricao,
        valor,
        forma_pagamento AS "formaPagamento",
        situacao,
        cliente,
        orcamento,
        veiculo,
        motorista,
        responsavel,
        anexo_nome AS "anexoNome",
        observacoes,
        criado_em AS "criadoEm",
        atualizado_em AS "atualizadoEm"
      FROM despesas
      ORDER BY criado_em DESC;
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/despesas/bulk", async (req, res) => {
  const items = ensureArray(req.body && req.body.items);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM despesas");

    for (const item of items) {
      await client.query(
        `
        INSERT INTO despesas (
          codigo, data_despesa, competencia, tipo_despesa, categoria, centro_custo, fornecedor, descricao, valor,
          forma_pagamento, situacao, cliente, orcamento, veiculo, motorista, responsavel, anexo_nome, observacoes, criado_em, atualizado_em
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        `,
        [
          item.codigo,
          item.dataDespesa,
          item.competencia,
          item.tipoDespesa,
          item.categoria,
          item.centroCusto,
          item.fornecedor || null,
          item.descricao,
          Number(item.valor),
          item.formaPagamento,
          item.situacao,
          item.cliente || null,
          item.orcamento || null,
          item.veiculo || null,
          item.motorista || null,
          item.responsavel || null,
          item.anexoNome || null,
          item.observacoes || null,
          item.criadoEm || new Date().toISOString(),
          item.atualizadoEm || null
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, count: items.length });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
});

app.get("/api/tipos-servico", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        codigo,
        descricao,
        categoria,
        abrangencia,
        necessita_seguro AS "necessitaSeguro",
        status,
        COALESCE(observacoes, '') AS observacoes,
        criado_em AS "criadoEm",
        atualizado_em AS "atualizadoEm"
      FROM tipos_servico
      ORDER BY descricao ASC;
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tipos-servico", async (req, res) => {
  try {
    const codigo = String(req.body && req.body.codigo ? req.body.codigo : "").trim();
    const descricao = String(req.body && req.body.descricao ? req.body.descricao : "").trim();
    const categoria = String(req.body && req.body.categoria ? req.body.categoria : "").trim();
    const abrangencia = String(req.body && req.body.abrangencia ? req.body.abrangencia : "").trim();
    const necessitaSeguro = Boolean(req.body && req.body.necessitaSeguro);
    const status = String(req.body && req.body.status ? req.body.status : "").trim();
    const observacoes = String(req.body && req.body.observacoes ? req.body.observacoes : "").trim();

    if (!codigo || !descricao || !categoria || !abrangencia || !status) {
      return res.status(400).json({ error: "Campos obrigatorios nao informados" });
    }

    const result = await pool.query(
      `
      INSERT INTO tipos_servico (codigo, descricao, categoria, abrangencia, necessita_seguro, status, observacoes, atualizado_em)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      RETURNING
        id,
        codigo,
        descricao,
        categoria,
        abrangencia,
        necessita_seguro AS "necessitaSeguro",
        status,
        COALESCE(observacoes, '') AS observacoes,
        criado_em AS "criadoEm",
        atualizado_em AS "atualizadoEm";
      `,
      [codigo, descricao, categoria, abrangencia, necessitaSeguro, status, observacoes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/tipos-servico/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const codigo = String(req.body && req.body.codigo ? req.body.codigo : "").trim();
    const descricao = String(req.body && req.body.descricao ? req.body.descricao : "").trim();
    const categoria = String(req.body && req.body.categoria ? req.body.categoria : "").trim();
    const abrangencia = String(req.body && req.body.abrangencia ? req.body.abrangencia : "").trim();
    const necessitaSeguro = Boolean(req.body && req.body.necessitaSeguro);
    const status = String(req.body && req.body.status ? req.body.status : "").trim();
    const observacoes = String(req.body && req.body.observacoes ? req.body.observacoes : "").trim();

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "ID invalido" });
    }

    if (!codigo || !descricao || !categoria || !abrangencia || !status) {
      return res.status(400).json({ error: "Campos obrigatorios nao informados" });
    }

    const result = await pool.query(
      `
      UPDATE tipos_servico
      SET
        codigo = $2,
        descricao = $3,
        categoria = $4,
        abrangencia = $5,
        necessita_seguro = $6,
        status = $7,
        observacoes = $8,
        atualizado_em = NOW()
      WHERE id = $1
      RETURNING
        id,
        codigo,
        descricao,
        categoria,
        abrangencia,
        necessita_seguro AS "necessitaSeguro",
        status,
        COALESCE(observacoes, '') AS observacoes,
        criado_em AS "criadoEm",
        atualizado_em AS "atualizadoEm";
      `,
      [id, codigo, descricao, categoria, abrangencia, necessitaSeguro, status, observacoes || null]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Tipo de servico nao encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/tipos-servico/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "ID invalido" });
    }

    const result = await pool.query("DELETE FROM tipos_servico WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Tipo de servico nao encontrado" });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/opcoes/:tipo", async (req, res) => {
  try {
    const { tipo } = req.params;
    if (!tipo || !/^[a-z_]+$/.test(tipo)) {
      return res.status(400).json({ error: "Tipo invalido" });
    }
    const result = await pool.query(
      `SELECT codigo, descricao, ordem FROM opcoes_lookup WHERE tipo = $1 ORDER BY ordem ASC`,
      [tipo]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/opcoes", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT tipo, codigo, descricao, ordem FROM opcoes_lookup ORDER BY tipo ASC, ordem ASC`
    );
    const agrupado = {};
    for (const row of result.rows) {
      if (!agrupado[row.tipo]) agrupado[row.tipo] = [];
      agrupado[row.tipo].push({ codigo: row.codigo, descricao: row.descricao, ordem: row.ordem });
    }
    res.json(agrupado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/orcamentos", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        codigo,
        criado_em AS "criadoEm",
        atualizado_em AS "atualizadoEm",
        cliente,
        a_c AS "aC",
        contato,
        origem,
        origem_uf AS "origemUF",
        destino,
        destino_uf AS "destinoUF",
        itens_produto AS "itensProduto",
        quantidade,
        descricao,
        tipo_veiculo AS "tipoVeiculo",
        tipo_servico_id AS "tipoServicoId",
        tipo_servico_descricao AS "tipoServicoDescricao",
        tipo_carga AS "tipoCarga",
        peso,
        volume,
        prazo,
        valor,
        validade,
        status_orcamento AS "statusOrcamento",
        status_entrega AS "statusEntrega",
        responsavel,
        observacoes
      FROM orcamentos
      ORDER BY criado_em DESC;
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/orcamentos/bulk", async (req, res) => {
  const items = ensureArray(req.body && req.body.items);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM orcamentos");

    for (const item of items) {
      await client.query(
        `
        INSERT INTO orcamentos (
          codigo, criado_em, atualizado_em, cliente, a_c, contato, origem, origem_uf, destino, destino_uf,
          itens_produto, quantidade, descricao, tipo_veiculo, tipo_servico_id, tipo_servico_descricao,
          tipo_carga, peso, volume, prazo, valor, validade, status_orcamento, status_entrega, responsavel, observacoes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
        `,
        [
          item.codigo,
          item.criadoEm || new Date().toISOString(),
          item.atualizadoEm || null,
          item.cliente,
          item.aC || null,
          item.contato || null,
          item.origem,
          item.origemUF || null,
          item.destino,
          item.destinoUF || null,
          Array.isArray(item.itensProduto) && item.itensProduto.length > 0 ? JSON.stringify(item.itensProduto) : null,
          item.quantidade !== "" && item.quantidade != null ? Number(item.quantidade) : null,
          item.descricao || null,
          item.tipoVeiculo || null,
          item.tipoServicoId != null ? Number(item.tipoServicoId) : null,
          item.tipoServicoDescricao || null,
          item.tipoCarga || null,
          item.peso !== "" && item.peso != null ? Number(item.peso) : null,
          item.volume !== "" && item.volume != null ? Number(item.volume) : null,
          item.prazo !== "" && item.prazo != null ? Number(item.prazo) : null,
          Number(item.valor),
          item.validade || null,
          item.statusOrcamento,
          item.statusEntrega,
          item.responsavel || null,
          item.observacoes || null
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, count: items.length });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Serve o HTML e assets estaticos APOS todas as rotas da API
app.use(express.static(path.join(__dirname)));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "inova_orcamentos.html"));
});

initSchema()
  .then(syncUsersFromFile)
  .then(syncResponsaveisSeedFromFile)
  .then(syncTiposServicoSeed)
  .then(syncOpcoesDropdownSeed)
  .then(() => {
    app.listen(port, () => {
      console.log(`API INOVA/Neon ativa em http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Falha ao inicializar schema no Neon:", error.message);
    process.exit(1);
  });
