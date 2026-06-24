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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
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
          itens_produto, quantidade, descricao, tipo_veiculo, tipo_carga, peso, volume, prazo, valor, validade, status_orcamento, status_entrega, responsavel, observacoes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
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
  .then(() => {
    app.listen(port, () => {
      console.log(`API INOVA/Neon ativa em http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Falha ao inicializar schema no Neon:", error.message);
    process.exit(1);
  });
