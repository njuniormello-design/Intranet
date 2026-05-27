const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken, authorizeRoles } = require('./auth');

const ITEM_STATUSES = ['em_uso', 'estoque', 'manutencao', 'baixado', 'emprestado', 'reservado', 'extraviado'];
const MOVEMENT_TYPES = ['entrada', 'entrega', 'devolucao', 'transferencia', 'manutencao', 'baixa', 'termo'];
const uploadDir = path.join(__dirname, '../uploads/inventario');
const canManageInventory = authorizeRoles('admin', 'creator');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const signedTermUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `termo-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  }),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || `${10 * 1024 * 1024}`, 10) },
  fileFilter: (req, file, cb) => {
    const allowedExt = /\.(pdf|jpg|jpeg|png|webp)$/i.test(file.originalname);
    const allowedMime = /^(application\/pdf|image\/jpeg|image\/png|image\/webp)$/i.test(file.mimetype);
    if (allowedExt && allowedMime) return cb(null, true);
    cb(new Error('Tipo de arquivo nao permitido. Envie PDF ou imagem.'));
  }
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || `${10 * 1024 * 1024}`, 10) },
  fileFilter: (req, file, cb) => {
    const allowedExt = /\.(csv|txt)$/i.test(file.originalname);
    const allowedMime = /^(text\/csv|text\/plain|application\/vnd\.ms-excel|application\/csv)$/i.test(file.mimetype || '');
    if (allowedExt || allowedMime) return cb(null, true);
    cb(new Error('Arquivo invalido. Exporte a planilha em CSV e tente novamente.'));
  }
});

function normalizeString(value, maxLength = null) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return maxLength ? normalized.slice(0, maxLength) : normalized;
}

function encodingScore(value) {
  const text = String(value || '');
  return (text.match(/[ÃÂ]/g) || []).length + ((text.match(/�/g) || []).length * 5);
}

function fixMojibake(value) {
  if (value === undefined || value === null) return value;
  let best = String(value);
  let bestScore = encodingScore(best);

  for (let i = 0; i < 2 && /[ÃÂ]/.test(best); i += 1) {
    const repaired = Buffer.from(best, 'latin1').toString('utf8');
    const score = encodingScore(repaired);
    if (score < bestScore) {
      best = repaired;
      bestScore = score;
    } else {
      break;
    }
  }

  return best;
}

function toDateOrToday(value) {
  const normalized = normalizeString(value, 10);
  return normalized || new Date().toISOString().slice(0, 10);
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function splitCsvLine(line, delimiter) {
  const values = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCsv(buffer) {
  const content = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];

  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const headers = splitCsvLine(lines[0], delimiter).map(normalizeHeader);

  return lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line, delimiter);
    const row = { __line: index + 2 };
    headers.forEach((header, headerIndex) => {
      if (header) row[header] = normalizeString(values[headerIndex]);
    });
    return row;
  });
}

function pickRowValue(row, aliases, maxLength = null) {
  for (const alias of aliases) {
    const value = normalizeString(row[normalizeHeader(alias)], maxLength);
    if (value) return value;
  }
  return null;
}

function normalizeStatus(value, fallback = 'estoque') {
  const normalized = normalizeHeader(value);
  const map = {
    em_uso: 'em_uso',
    uso: 'em_uso',
    estoque: 'estoque',
    em_estoque: 'estoque',
    manutencao: 'manutencao',
    em_manutencao: 'manutencao',
    baixado: 'baixado',
    baixa: 'baixado',
    emprestado: 'emprestado',
    reservado: 'reservado',
    extraviado: 'extraviado'
  };
  return ITEM_STATUSES.includes(map[normalized]) ? map[normalized] : fallback;
}

function buildImportObservation(row) {
  const parts = [
    ['Antivirus', pickRowValue(row, ['antivirus', 'antivírus'])],
    ['USB Lock', pickRowValue(row, ['usb_lock', 'usb lock'])],
    ['Monitores', pickRowValue(row, ['monitores', 'monitor'])],
    ['Ramal', pickRowValue(row, ['ramal'])],
    ['Senha ADM', pickRowValue(row, ['senha_adm', 'senha adm'])],
    ['Observacoes originais', pickRowValue(row, ['observacoes', 'observações', 'obs'])]
  ].filter(([, value]) => value);

  return parts.length ? parts.map(([label, value]) => `${label}: ${value}`).join('\n') : null;
}

function mapImportRowToItem(row) {
  const colaboradorNome = pickRowValue(row, ['colaborador', 'usuario', 'usuário', 'responsavel', 'responsável'], 150);
  const setor = pickRowValue(row, ['setor', 'departamento'], 150);
  const tipoComputador = pickRowValue(row, ['tipo_de_computador', 'tipo computador', 'tipo_pc'], 100);
  const tipo = pickRowValue(row, ['tipo', 'dispositivo', 'equipamento'], 100)
    || (tipoComputador ? tipoComputador : null)
    || (pickRowValue(row, ['pc', 'computador', 'hostname'], 150) ? 'Computador' : 'Outro');

  const status = normalizeStatus(pickRowValue(row, ['status', 'situacao', 'situação']), colaboradorNome ? 'em_uso' : 'estoque');

  return {
    item: {
      tipo,
      marca: pickRowValue(row, ['marca'], 100),
      modelo: pickRowValue(row, ['modelo'], 150),
      numero_serie: pickRowValue(row, ['numero_serie', 'número de série', 'serie', 'série', 'serial'], 150),
      patrimonio: pickRowValue(row, ['patrimonio', 'patrimônio', 'asset_tag'], 100),
      imobilizado: pickRowValue(row, ['imobilizado', 'codigo_imobilizado', 'código imobilizado'], 100),
      hostname: pickRowValue(row, ['hostname', 'pc', 'computador', 'nome_do_computador'], 150),
      ip: pickRowValue(row, ['ip', 'endereco_ip', 'endereço ip'], 45),
      mac_address: pickRowValue(row, ['mac', 'mac_address', 'endereco_mac', 'endereço mac'], 50),
      setor,
      status,
      observacoes: buildImportObservation(row)
    },
    vinculo: colaboradorNome ? {
      colaborador_nome: colaboradorNome,
      setor,
      data_entrega: pickRowValue(row, ['data_entrega', 'entrega'], 10) || new Date().toISOString().slice(0, 10),
      observacoes: 'Vinculo criado pela importacao da planilha de TI'
    } : null
  };
}

function mapItem(row) {
  if (!row) return row;
  return {
    ...row,
    usuario_atual: row.vinculo_status === 'ativo' ? row.colaborador_nome : null,
    setor_atual: row.vinculo_status === 'ativo' ? row.vinculo_setor : row.setor
  };
}

function mapTerm(row) {
  if (!row) return row;
  return {
    ...row,
    file_name: fixMojibake(row.file_name)
  };
}

async function fetchItemById(connection, id) {
  const [items] = await connection.query(
    `SELECT i.*,
            v.id AS vinculo_id,
            v.usuario_id,
            v.colaborador_nome,
            v.setor AS vinculo_setor,
            v.data_entrega,
            v.termo_responsabilidade,
            v.status AS vinculo_status
       FROM inventario_itens i
       LEFT JOIN inventario_vinculos v
         ON v.item_id = i.id
        AND v.status = 'ativo'
      WHERE i.id = ?
      LIMIT 1`,
    [id]
  );
  return mapItem(items[0]);
}

function assertValidItemId(id) {
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    const error = new Error('ID inválido');
    error.statusCode = 400;
    throw error;
  }
  return itemId;
}

const itemValidators = [
  body('tipo').trim().isLength({ min: 2, max: 100 }).withMessage('Tipo deve ter entre 2 e 100 caracteres'),
  body('marca').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Marca deve ter no máximo 100 caracteres'),
  body('modelo').optional({ checkFalsy: true }).trim().isLength({ max: 150 }).withMessage('Modelo deve ter no máximo 150 caracteres'),
  body('numero_serie').optional({ checkFalsy: true }).trim().isLength({ max: 150 }).withMessage('Número de série deve ter no máximo 150 caracteres'),
  body('patrimonio').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Patrimônio deve ter no máximo 100 caracteres'),
  body('imobilizado').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Imobilizado deve ter no máximo 100 caracteres'),
  body('hostname').optional({ checkFalsy: true }).trim().isLength({ max: 150 }).withMessage('Hostname deve ter no máximo 150 caracteres'),
  body('ip').optional({ checkFalsy: true }).trim().isLength({ max: 45 }).withMessage('IP deve ter no máximo 45 caracteres'),
  body('mac_address').optional({ checkFalsy: true }).trim().isLength({ max: 50 }).withMessage('MAC Address deve ter no máximo 50 caracteres'),
  body('setor').optional({ checkFalsy: true }).trim().isLength({ max: 150 }).withMessage('Setor deve ter no máximo 150 caracteres'),
  body('status').optional({ checkFalsy: true }).isIn(ITEM_STATUSES).withMessage('Status inválido'),
  body('observacoes').optional({ checkFalsy: true }).trim().isLength({ max: 3000 }).withMessage('Observações devem ter no máximo 3000 caracteres')
];

const vinculoValidators = [
  body('usuario_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Usuário inválido'),
  body('colaborador_nome').trim().isLength({ min: 2, max: 150 }).withMessage('Colaborador deve ter entre 2 e 150 caracteres'),
  body('setor').optional({ checkFalsy: true }).trim().isLength({ max: 150 }).withMessage('Setor deve ter no máximo 150 caracteres'),
  body('data_entrega').optional({ checkFalsy: true }).isISO8601().withMessage('Data de entrega inválida'),
  body('termo_responsabilidade').optional({ checkFalsy: true }).trim().isLength({ max: 255 }).withMessage('Termo deve ter no máximo 255 caracteres'),
  body('observacoes').optional({ checkFalsy: true }).trim().isLength({ max: 3000 }).withMessage('Observações devem ter no máximo 3000 caracteres')
];

router.get('/summary', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const [[totalRow]] = await connection.query('SELECT COUNT(*) AS total FROM inventario_itens');
    const [byStatus] = await connection.query('SELECT status, COUNT(*) AS total FROM inventario_itens GROUP BY status');
    const [[semImobilizado]] = await connection.query(
      "SELECT COUNT(*) AS total FROM inventario_itens WHERE (imobilizado IS NULL OR imobilizado = '') AND (patrimonio IS NULL OR patrimonio = '')"
    );
    const [[semVinculo]] = await connection.query(
      `SELECT COUNT(*) AS total
         FROM inventario_itens i
        WHERE NOT EXISTS (
          SELECT 1 FROM inventario_vinculos v WHERE v.item_id = i.id AND v.status = 'ativo'
        )`
    );
    const [bySetor] = await connection.query(
      `SELECT COALESCE(v.setor, i.setor, 'Sem setor') AS setor, COUNT(*) AS total
         FROM inventario_itens i
         LEFT JOIN inventario_vinculos v ON v.item_id = i.id AND v.status = 'ativo'
        GROUP BY COALESCE(v.setor, i.setor, 'Sem setor')
        ORDER BY total DESC, setor ASC
        LIMIT 12`
    );

    res.json({
      total: totalRow.total,
      byStatus,
      semImobilizado: semImobilizado.total,
      semVinculo: semVinculo.total,
      bySetor
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao carregar resumo do inventário' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/', authenticateToken, async (req, res) => {
  let connection;
  try {
    const filters = {
      tipo: normalizeString(req.query.tipo, 100),
      status: normalizeString(req.query.status, 30),
      setor: normalizeString(req.query.setor, 150),
      search: normalizeString(req.query.search, 150),
      semVinculo: String(req.query.semVinculo || '') === '1',
      semPatrimonio: String(req.query.semPatrimonio || '') === '1'
    };

    const where = [];
    const params = [];
    if (filters.tipo) {
      where.push('i.tipo = ?');
      params.push(filters.tipo);
    }
    if (filters.status) {
      where.push('i.status = ?');
      params.push(filters.status);
    }
    if (filters.setor) {
      where.push('COALESCE(v.setor, i.setor) = ?');
      params.push(filters.setor);
    }
    if (filters.semVinculo) {
      where.push('v.id IS NULL');
    }
    if (filters.semPatrimonio) {
      where.push("((i.patrimonio IS NULL OR i.patrimonio = '') AND (i.imobilizado IS NULL OR i.imobilizado = ''))");
    }
    if (filters.search) {
      where.push(`(
        i.tipo LIKE ? OR i.marca LIKE ? OR i.modelo LIKE ? OR i.numero_serie LIKE ?
        OR i.patrimonio LIKE ? OR i.imobilizado LIKE ? OR i.hostname LIKE ? OR i.ip LIKE ?
        OR v.colaborador_nome LIKE ?
      )`);
      const like = `%${filters.search}%`;
      params.push(like, like, like, like, like, like, like, like, like);
    }

    connection = await pool.getConnection();
    const [items] = await connection.query(
      `SELECT i.*,
              v.id AS vinculo_id,
              v.usuario_id,
              v.colaborador_nome,
              v.setor AS vinculo_setor,
              v.data_entrega,
              v.status AS vinculo_status
         FROM inventario_itens i
         LEFT JOIN inventario_vinculos v ON v.item_id = i.id AND v.status = 'ativo'
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY i.atualizado_em DESC, i.id DESC`,
      params
    );

    res.json(items.map(mapItem));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar inventário' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/termo/responsavel', authenticateToken, async (req, res) => {
  let connection;
  try {
    const usuarioId = req.query.usuario_id ? Number(req.query.usuario_id) : null;
    const colaboradorNome = normalizeString(req.query.colaborador_nome, 150);

    if (!usuarioId && !colaboradorNome) {
      return res.status(400).json({ error: 'Informe o usuário ou colaborador para gerar o termo' });
    }

    const where = ["v.status = 'ativo'"];
    const params = [];
    if (usuarioId) {
      where.push('v.usuario_id = ?');
      params.push(usuarioId);
    } else {
      where.push('v.colaborador_nome = ?');
      params.push(colaboradorNome);
    }

    connection = await pool.getConnection();
    const [rows] = await connection.query(
      `SELECT i.*,
              v.id AS vinculo_id,
              v.usuario_id,
              v.colaborador_nome,
              v.setor AS vinculo_setor,
              v.data_entrega,
              v.termo_responsabilidade,
              v.observacoes AS vinculo_observacoes,
              v.status AS vinculo_status
         FROM inventario_vinculos v
         JOIN inventario_itens i ON i.id = v.item_id
        WHERE ${where.join(' AND ')}
        ORDER BY v.data_entrega ASC, i.tipo ASC, i.patrimonio ASC, i.id ASC`,
      params
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Nenhum vínculo ativo encontrado para este colaborador' });
    }

    const first = rows[0];
    res.json({
      responsavel: {
        usuario_id: first.usuario_id,
        colaborador_nome: first.colaborador_nome,
        setor: first.vinculo_setor,
        total_itens: rows.length
      },
      itens: rows.map(mapItem)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar termo consolidado' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/termos/:termoId/download', authenticateToken, async (req, res) => {
  let connection;
  try {
    const termoId = Number(req.params.termoId);
    if (!Number.isInteger(termoId) || termoId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    connection = await pool.getConnection();
    const [rows] = await connection.query(
      'SELECT file_path, file_name FROM inventario_termos WHERE id = ?',
      [termoId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Termo nao encontrado' });

    const filePath = path.normalize(rows[0].file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo do termo nao encontrado' });
    }

    res.download(filePath, fixMojibake(rows[0].file_name));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ error: 'Erro ao baixar termo assinado' });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/importar-csv', authenticateToken, canManageInventory, csvUpload.single('planilha'), async (req, res) => {
  let connection;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo CSV da planilha e obrigatorio' });
    }

    const rows = parseCsv(req.file.buffer);
    if (!rows.length) {
      return res.status(400).json({ error: 'CSV sem linhas para importar' });
    }

    const result = {
      total: rows.length,
      importados: 0,
      vinculados: 0,
      erros: []
    };

    connection = await pool.getConnection();
    await connection.beginTransaction();

    for (const row of rows) {
      try {
        const mapped = mapImportRowToItem(row);
        if (!mapped.item.tipo || mapped.item.tipo.length < 2) {
          result.erros.push({ linha: row.__line, erro: 'Tipo do dispositivo ausente' });
          continue;
        }

        const [insert] = await connection.query(
          `INSERT INTO inventario_itens
           (tipo, marca, modelo, numero_serie, patrimonio, imobilizado, hostname, ip, mac_address, setor, status, observacoes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            mapped.item.tipo,
            mapped.item.marca,
            mapped.item.modelo,
            mapped.item.numero_serie,
            mapped.item.patrimonio,
            mapped.item.imobilizado,
            mapped.item.hostname,
            mapped.item.ip,
            mapped.item.mac_address,
            mapped.item.setor,
            mapped.item.status,
            mapped.item.observacoes
          ]
        );

        const itemId = insert.insertId;
        result.importados += 1;

        await connection.query(
          `INSERT INTO inventario_movimentacoes
           (item_id, setor_destino, tipo_movimentacao, descricao, realizado_por)
           VALUES (?, ?, 'entrada', ?, ?)`,
          [itemId, mapped.item.setor, 'Item importado da planilha de TI', req.user.id]
        );

        if (mapped.vinculo) {
          await connection.query(
            `INSERT INTO inventario_vinculos
             (item_id, usuario_id, colaborador_nome, setor, data_entrega, status, observacoes, criado_por)
             VALUES (?, NULL, ?, ?, ?, 'ativo', ?, ?)`,
            [
              itemId,
              mapped.vinculo.colaborador_nome,
              mapped.vinculo.setor,
              mapped.vinculo.data_entrega,
              mapped.vinculo.observacoes,
              req.user.id
            ]
          );

          await connection.query(
            `INSERT INTO inventario_movimentacoes
             (item_id, usuario_destino, setor_destino, tipo_movimentacao, descricao, realizado_por)
             VALUES (?, ?, ?, 'entrega', ?, ?)`,
            [
              itemId,
              mapped.vinculo.colaborador_nome,
              mapped.vinculo.setor,
              'Entrega criada pela importacao da planilha de TI',
              req.user.id
            ]
          );

          result.vinculados += 1;
        }
      } catch (rowError) {
        result.erros.push({ linha: row.__line, erro: rowError.message });
      }
    }

    await connection.commit();
    res.status(201).json({
      message: `Importacao concluida: ${result.importados} item(ns) importado(s), ${result.vinculados} vinculo(s) criado(s).`,
      ...result
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao importar planilha de TI' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    const itemId = assertValidItemId(req.params.id);
    connection = await pool.getConnection();
    const item = await fetchItemById(connection, itemId);
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });

    const [historico] = await connection.query(
      `SELECT m.*, u.name AS realizado_por_nome
         FROM inventario_movimentacoes m
         LEFT JOIN users u ON u.id = m.realizado_por
        WHERE m.item_id = ?
        ORDER BY m.criado_em DESC, m.id DESC`,
      [itemId]
    );
    const [vinculos] = await connection.query(
      `SELECT v.*, u.name AS usuario_nome, c.name AS criado_por_nome
         FROM inventario_vinculos v
         LEFT JOIN users u ON u.id = v.usuario_id
         LEFT JOIN users c ON c.id = v.criado_por
        WHERE v.item_id = ?
        ORDER BY v.criado_em DESC, v.id DESC`,
      [itemId]
    );
    const [termos] = await connection.query(
      `SELECT t.*, u.name AS uploaded_by_nome
         FROM inventario_termos t
         LEFT JOIN users u ON u.id = t.uploaded_by
        WHERE t.item_id = ?
        ORDER BY t.created_at DESC, t.id DESC`,
      [itemId]
    );

    res.json({ item, historico, vinculos, termos: termos.map(mapTerm) });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao buscar item' });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/', authenticateToken, canManageInventory, itemValidators, async (req, res) => {
  let connection;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const item = {
      tipo: normalizeString(req.body.tipo, 100),
      marca: normalizeString(req.body.marca, 100),
      modelo: normalizeString(req.body.modelo, 150),
      numero_serie: normalizeString(req.body.numero_serie, 150),
      patrimonio: normalizeString(req.body.patrimonio, 100),
      imobilizado: normalizeString(req.body.imobilizado, 100),
      hostname: normalizeString(req.body.hostname, 150),
      ip: normalizeString(req.body.ip, 45),
      mac_address: normalizeString(req.body.mac_address, 50),
      setor: normalizeString(req.body.setor, 150),
      status: normalizeString(req.body.status, 30) || 'estoque',
      observacoes: normalizeString(req.body.observacoes, 3000)
    };

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO inventario_itens
       (tipo, marca, modelo, numero_serie, patrimonio, imobilizado, hostname, ip, mac_address, setor, status, observacoes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.tipo, item.marca, item.modelo, item.numero_serie, item.patrimonio, item.imobilizado, item.hostname, item.ip, item.mac_address, item.setor, item.status, item.observacoes]
    );

    await connection.query(
      `INSERT INTO inventario_movimentacoes
       (item_id, usuario_destino, setor_destino, tipo_movimentacao, descricao, realizado_por)
       VALUES (?, NULL, ?, 'entrada', ?, ?)`,
      [result.insertId, item.setor, 'Item cadastrado no inventário', req.user.id]
    );
    await connection.commit();
    res.status(201).json({ message: 'Item cadastrado com sucesso', id: result.insertId });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(500).json({ error: 'Erro ao cadastrar item' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/:id/termos', authenticateToken, async (req, res) => {
  let connection;
  try {
    const itemId = assertValidItemId(req.params.id);
    connection = await pool.getConnection();
    const [termos] = await connection.query(
      `SELECT t.*, u.name AS uploaded_by_nome
         FROM inventario_termos t
         LEFT JOIN users u ON u.id = t.uploaded_by
        WHERE t.item_id = ?
        ORDER BY t.created_at DESC, t.id DESC`,
      [itemId]
    );
    res.json(termos.map(mapTerm));
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao buscar termos assinados' });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/:id/termo-assinado', authenticateToken, canManageInventory, signedTermUpload.single('termo'), async (req, res) => {
  let connection;
  try {
    const itemId = assertValidItemId(req.params.id);
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo do termo assinado e obrigatorio' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const item = await fetchItemById(connection, itemId);
    if (!item) {
      await connection.rollback();
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Item nao encontrado' });
    }
    if (!item.vinculo_id) {
      await connection.rollback();
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Item nao possui vinculo ativo para anexar termo' });
    }

    const originalFileName = fixMojibake(req.file.originalname);

    await connection.query(
      `INSERT INTO inventario_termos
       (vinculo_id, item_id, file_name, file_path, file_type, file_size, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [item.vinculo_id, itemId, originalFileName, req.file.path, req.file.mimetype, req.file.size, req.user.id]
    );

    await connection.query(
      'UPDATE inventario_vinculos SET termo_responsabilidade = ? WHERE id = ?',
      [originalFileName, item.vinculo_id]
    );

    await connection.query(
      `INSERT INTO inventario_movimentacoes
       (item_id, usuario_destino, setor_destino, tipo_movimentacao, descricao, realizado_por)
       VALUES (?, ?, ?, 'termo', ?, ?)`,
      [itemId, item.usuario_atual, item.setor_atual, `Termo assinado anexado: ${originalFileName}`, req.user.id]
    );

    await connection.commit();
    res.status(201).json({ message: 'Termo assinado anexado com sucesso' });
  } catch (error) {
    if (connection) await connection.rollback();
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao anexar termo assinado' });
  } finally {
    if (connection) connection.release();
  }
});

router.put('/:id', authenticateToken, canManageInventory, itemValidators, async (req, res) => {
  let connection;
  try {
    const itemId = assertValidItemId(req.params.id);
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const values = [
      normalizeString(req.body.tipo, 100),
      normalizeString(req.body.marca, 100),
      normalizeString(req.body.modelo, 150),
      normalizeString(req.body.numero_serie, 150),
      normalizeString(req.body.patrimonio, 100),
      normalizeString(req.body.imobilizado, 100),
      normalizeString(req.body.hostname, 150),
      normalizeString(req.body.ip, 45),
      normalizeString(req.body.mac_address, 50),
      normalizeString(req.body.setor, 150),
      normalizeString(req.body.status, 30) || 'estoque',
      normalizeString(req.body.observacoes, 3000),
      itemId
    ];

    connection = await pool.getConnection();
    const [result] = await connection.query(
      `UPDATE inventario_itens
          SET tipo = ?, marca = ?, modelo = ?, numero_serie = ?, patrimonio = ?, imobilizado = ?,
              hostname = ?, ip = ?, mac_address = ?, setor = ?, status = ?, observacoes = ?
        WHERE id = ?`,
      values
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Item não encontrado' });
    res.json({ message: 'Item atualizado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao atualizar item' });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/:id/vincular', authenticateToken, canManageInventory, vinculoValidators, async (req, res) => {
  let connection;
  try {
    const itemId = assertValidItemId(req.params.id);
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const usuarioId = req.body.usuario_id ? Number(req.body.usuario_id) : null;
    const colaboradorNome = normalizeString(req.body.colaborador_nome, 150);
    const setor = normalizeString(req.body.setor, 150);
    const dataEntrega = toDateOrToday(req.body.data_entrega);
    const termo = normalizeString(req.body.termo_responsabilidade, 255);
    const observacoes = normalizeString(req.body.observacoes, 3000);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const item = await fetchItemById(connection, itemId);
    if (!item) {
      await connection.rollback();
      return res.status(404).json({ error: 'Item não encontrado' });
    }

    if (item.vinculo_id) {
      await connection.query(
        `UPDATE inventario_vinculos
            SET data_devolucao = ?, status = 'transferido'
          WHERE id = ?`,
        [dataEntrega, item.vinculo_id]
      );
    }

    await connection.query(
      `INSERT INTO inventario_vinculos
       (item_id, usuario_id, colaborador_nome, setor, data_entrega, status, termo_responsabilidade, observacoes, criado_por)
       VALUES (?, ?, ?, ?, ?, 'ativo', ?, ?, ?)`,
      [itemId, usuarioId, colaboradorNome, setor, dataEntrega, termo, observacoes, req.user.id]
    );

    await connection.query(
      "UPDATE inventario_itens SET status = 'em_uso', setor = COALESCE(?, setor) WHERE id = ?",
      [setor, itemId]
    );

    await connection.query(
      `INSERT INTO inventario_movimentacoes
       (item_id, usuario_origem, usuario_destino, setor_origem, setor_destino, tipo_movimentacao, descricao, realizado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        itemId,
        item.usuario_atual,
        colaboradorNome,
        item.setor_atual,
        setor,
        item.vinculo_id ? 'transferencia' : 'entrega',
        observacoes || (item.vinculo_id ? 'Transferência de responsável' : 'Entrega de equipamento'),
        req.user.id
      ]
    );

    await connection.commit();
    res.json({ message: 'Item vinculado com sucesso' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao vincular item' });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/:id/devolver', authenticateToken, canManageInventory, [
  body('data_devolucao').optional({ checkFalsy: true }).isISO8601().withMessage('Data de devolução inválida'),
  body('novo_status').optional({ checkFalsy: true }).isIn(['estoque', 'manutencao', 'baixado']).withMessage('Status inválido'),
  body('observacoes').optional({ checkFalsy: true }).trim().isLength({ max: 3000 }).withMessage('Observações devem ter no máximo 3000 caracteres')
], async (req, res) => {
  let connection;
  try {
    const itemId = assertValidItemId(req.params.id);
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const dataDevolucao = toDateOrToday(req.body.data_devolucao);
    const novoStatus = normalizeString(req.body.novo_status, 30) || 'estoque';
    const observacoes = normalizeString(req.body.observacoes, 3000);

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const item = await fetchItemById(connection, itemId);
    if (!item) {
      await connection.rollback();
      return res.status(404).json({ error: 'Item não encontrado' });
    }
    if (!item.vinculo_id) {
      await connection.rollback();
      return res.status(400).json({ error: 'Item não possui vínculo ativo' });
    }

    await connection.query(
      `UPDATE inventario_vinculos
          SET data_devolucao = ?, status = 'devolvido'
        WHERE id = ?`,
      [dataDevolucao, item.vinculo_id]
    );
    await connection.query('UPDATE inventario_itens SET status = ? WHERE id = ?', [novoStatus, itemId]);
    await connection.query(
      `INSERT INTO inventario_movimentacoes
       (item_id, usuario_origem, setor_origem, tipo_movimentacao, descricao, realizado_por)
       VALUES (?, ?, ?, 'devolucao', ?, ?)`,
      [itemId, item.usuario_atual, item.setor_atual, observacoes || 'Devolução de equipamento', req.user.id]
    );

    await connection.commit();
    res.json({ message: 'Devolução registrada com sucesso' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao devolver item' });
  } finally {
    if (connection) connection.release();
  }
});

router.delete('/:id', authenticateToken, canManageInventory, async (req, res) => {
  let connection;
  try {
    const itemId = assertValidItemId(req.params.id);
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const item = await fetchItemById(connection, itemId);
    if (!item) {
      await connection.rollback();
      return res.status(404).json({ error: 'Item não encontrado' });
    }
    if (item.vinculo_id) {
      await connection.rollback();
      return res.status(400).json({ error: 'Não é possível excluir item com vínculo ativo. Registre a devolução primeiro.' });
    }

    await connection.query('DELETE FROM inventario_itens WHERE id = ?', [itemId]);
    await connection.commit();
    res.json({ message: 'Item excluído com sucesso' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao excluir item' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/:id/historico', authenticateToken, async (req, res) => {
  let connection;
  try {
    const itemId = assertValidItemId(req.params.id);
    connection = await pool.getConnection();
    const [historico] = await connection.query(
      `SELECT m.*, u.name AS realizado_por_nome
         FROM inventario_movimentacoes m
         LEFT JOIN users u ON u.id = m.realizado_por
        WHERE m.item_id = ?
        ORDER BY m.criado_em DESC, m.id DESC`,
      [itemId]
    );
    res.json(historico);
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao buscar histórico' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
