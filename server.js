const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const path = require('path');

const app = express();

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

const auth = (req, res, next) =>
  req.session.uid
    ? next()
    : res.status(401).json({ error: 'پێویستە بچیتە ژوورەوە' });

const admin = (req, res, next) =>
  req.session.role === 'admin'
    ? next()
    : res.status(403).json({ error: 'ڕێگەپێدان نییە' });


async function initDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      customer_code TEXT UNIQUE NOT NULL,
      role TEXT DEFAULT 'customer',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS shipments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tracking TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL,
      weight REAL DEFAULT 0,
      cost REAL DEFAULT 0,
      method TEXT DEFAULT 'Air',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const adminPhone = '07507028898';

  const existing = await db.query(
    'SELECT id FROM users WHERE phone=$1',
    [adminPhone]
  );

  if (existing.rows.length === 0) {
    const h = bcrypt.hashSync('123456', 10);

    const result = await db.query(`
      INSERT INTO users
      (name, phone, password, customer_code, role)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id
    `, [
      'Admin',
      adminPhone,
      h,
      'AM-0001',
      'admin'
    ]);

    const adminId = result.rows[0].id;

    await db.query(`
      INSERT INTO shipments
      (user_id, tracking, status, weight, cost, method)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (tracking) DO NOTHING
    `, [
      adminId,
      'AM-98124',
      'لە ڕێگادا',
      4.8,
      52,
      'Air'
    ]);
  }

  console.log('PostgreSQL database ready');
}


app.post('/api/register', async (req, res) => {
  try {
    let { name, phone, password } = req.body;

    name = String(name || '').trim();
    phone = String(phone || '').trim();
    password = String(password || '');

    if (!name || !phone || !password || password.length < 6) {
      return res.status(400).json({
        error: 'زانیارییەکان تەواو بکە'
      });
    }

    let code;
    let exists = true;

    while (exists) {
      code = 'AM-' + String(
        Math.floor(100000 + Math.random() * 900000)
      );

      const check = await db.query(
        'SELECT id FROM users WHERE customer_code=$1',
        [code]
      );

      exists = check.rows.length > 0;
    }

    const h = bcrypt.hashSync(password, 10);

    const result = await db.query(`
      INSERT INTO users
      (name, phone, password, customer_code)
      VALUES ($1,$2,$3,$4)
      RETURNING id
    `, [
      name,
      phone,
      h,
      code
    ]);

    req.session.uid = result.rows[0].id;
    req.session.role = 'customer';

    res.json({
      ok: true,
      customer_code: code
    });

  } catch (e) {
    console.error(e);

    if (e.code === '23505') {
      return res.status(400).json({
        error: 'ئەم ژمارەیە پێشتر تۆمارکراوە'
      });
    }

    res.status(500).json({
      error: 'هەڵەیەک ڕوویدا'
    });
  }
});


app.post('/api/login', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').trim();

    const result = await db.query(
      'SELECT * FROM users WHERE phone=$1',
      [phone]
    );

    const u = result.rows[0];

    if (
      !u ||
      !bcrypt.compareSync(
        req.body.password || '',
        u.password
      )
    ) {
      return res.status(401).json({
        error: 'ژمارە یان وشەی نهێنی هەڵەیە'
      });
    }

    req.session.uid = u.id;
    req.session.role = u.role;

    res.json({
      ok: true,
      role: u.role
    });

  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: 'هەڵەیەک ڕوویدا'
    });
  }
});


app.post('/api/logout', (req, res) =>
  req.session.destroy(() =>
    res.json({ ok: true })
  )
);


app.get('/api/me', auth, async (req, res) => {
  try {
    const userResult = await db.query(`
      SELECT id,name,phone,customer_code,role
      FROM users
      WHERE id=$1
    `, [req.session.uid]);

    const u = userResult.rows[0];

    if (!u) {
      return res.status(404).json({
        error: 'هەژمار نەدۆزرایەوە'
      });
    }

    const shipmentResult = await db.query(`
      SELECT
        id,
        tracking,
        status,
        weight,
        cost,
        method,
        updated_at
      FROM shipments
      WHERE user_id=$1
      ORDER BY id DESC
    `, [req.session.uid]);

    res.json({
      user: u,
      shipments: shipmentResult.rows
    });

  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: 'هەڵەیەک ڕوویدا'
    });
  }
});


app.get('/api/track/:tracking', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        tracking,
        status,
        weight,
        method,
        updated_at
      FROM shipments
      WHERE tracking=$1
    `, [req.params.tracking]);

    const s = result.rows[0];

    if (s) {
      return res.json(s);
    }

    res.status(404).json({
      error: 'بار نەدۆزرایەوە'
    });

  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: 'هەڵەیەک ڕوویدا'
    });
  }
});


app.get('/api/admin/users', auth, admin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id,
        name,
        phone,
        customer_code,
        role,
        created_at
      FROM users
      ORDER BY id DESC
    `);

    res.json(result.rows);

  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: 'هەڵەیەک ڕوویدا'
    });
  }
});


app.get('/api/admin/shipments', auth, admin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        s.id,
        s.user_id,
        s.tracking,
        s.status,
        s.weight,
        s.cost,
        s.method,
        s.updated_at,
        u.name,
        u.phone,
        u.customer_code
      FROM shipments s
      JOIN users u
        ON u.id=s.user_id
      ORDER BY s.id DESC
    `);

    res.json(result.rows);

  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: 'هەڵەیەک ڕوویدا'
    });
  }
});


app.post('/api/admin/shipments', auth, admin, async (req, res) => {
  try {
    let {
      user_id,
      tracking,
      status,
      weight,
      cost,
      method
    } = req.body;

    if (!user_id || !tracking || !status) {
      return res.status(400).json({
        error: 'زانیارییە سەرەکییەکان تەواو بکە'
      });
    }

    await db.query(`
      INSERT INTO shipments
      (user_id,tracking,status,weight,cost,method)
      VALUES($1,$2,$3,$4,$5,$6)
    `, [
      user_id,
      tracking.trim(),
      status,
      Number(weight) || 0,
      Number(cost) || 0,
      method || 'Air'
    ]);

    res.json({ ok: true });

  } catch (e) {
    console.error(e);

    res.status(400).json({
      error: 'نەتوانرا بار زیاد بکرێت'
    });
  }
});


app.put('/api/admin/shipments/:id', auth, admin, async (req, res) => {
  try {
    const oldResult = await db.query(
      'SELECT * FROM shipments WHERE id=$1',
      [req.params.id]
    );

    const old = oldResult.rows[0];

    if (!old) {
      return res.status(404).json({
        error: 'بار نەدۆزرایەوە'
      });
    }

    let {
      user_id,
      tracking,
      status,
      weight,
      cost,
      method
    } = req.body;

    await db.query(`
      UPDATE shipments SET
        user_id=$1,
        tracking=$2,
        status=$3,
        weight=$4,
        cost=$5,
        method=$6,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=$7
    `, [
      user_id || old.user_id,
      tracking || old.tracking,
      status || old.status,
      weight === undefined
        ? old.weight
        : Number(weight),
      cost === undefined
        ? old.cost
        : Number(cost),
      method || old.method,
      req.params.id
    ]);

    res.json({ ok: true });

  } catch (e) {
    console.error(e);

    res.status(400).json({
      error: 'نەتوانرا بار دەستکاری بکرێت'
    });
  }
});


app.delete('/api/admin/shipments/:id', auth, admin, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM shipments WHERE id=$1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'بار نەدۆزرایەوە'
      });
    }

    res.json({ ok: true });

  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: 'هەڵەیەک ڕوویدا'
    });
  }
});


app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(
        'AM Shipping Express running on port ' + PORT
      );
    });

  } catch (e) {
    console.error('Database startup error:', e);
    process.exit(1);
  }
}

start();
