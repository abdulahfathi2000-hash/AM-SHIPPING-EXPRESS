const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const db = new Database('amshipping.db');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  customer_code TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'customer',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shipments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tracking TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL,
  weight REAL DEFAULT 0,
  cost REAL DEFAULT 0,
  method TEXT DEFAULT 'Air',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

function seed() {
  let a = db.prepare('SELECT id FROM users WHERE phone=?').get('07507028898');

  if (!a) {
    let h = bcrypt.hashSync('123456', 10);

    let r = db.prepare(`
      INSERT INTO users(name,phone,password,customer_code,role)
      VALUES(?,?,?,?,?)
    `).run(
      'Admin',
      '07507028898',
      h,
      'AM-0001',
      'admin'
    );

    db.prepare(`
      INSERT INTO shipments
      (user_id,tracking,status,weight,cost,method)
      VALUES(?,?,?,?,?,?)
    `).run(
      r.lastInsertRowid,
      'AM-98124',
      'لە ڕێگادا',
      4.8,
      52,
      'Air'
    );
  }
}

seed();

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

const auth = (req,res,next) =>
  req.session.uid
    ? next()
    : res.status(401).json({error:'پێویستە بچیتە ژوورەوە'});

const admin = (req,res,next) =>
  req.session.role === 'admin'
    ? next()
    : res.status(403).json({error:'ڕێگەپێدان نییە'});


app.post('/api/register',(req,res)=>{
  try {
    let {name,phone,password} = req.body;

    if(!name || !phone || !password || password.length < 6)
      return res.status(400).json({
        error:'زانیارییەکان تەواو بکە'
      });

    let code;

    do {
      code = 'AM-' + String(
        Math.floor(100000 + Math.random()*900000)
      );
    } while(
      db.prepare(
        'SELECT id FROM users WHERE customer_code=?'
      ).get(code)
    );

    let h = bcrypt.hashSync(password,10);

    let r = db.prepare(`
      INSERT INTO users(name,phone,password,customer_code)
      VALUES(?,?,?,?)
    `).run(name,phone,h,code);

    req.session.uid = r.lastInsertRowid;
    req.session.role = 'customer';

    res.json({
      ok:true,
      customer_code:code
    });

  } catch(e) {
    res.status(400).json({
      error:'ئەم ژمارەیە پێشتر تۆمارکراوە'
    });
  }
});


app.post('/api/login',(req,res)=>{

  let u = db.prepare(
    'SELECT * FROM users WHERE phone=?'
  ).get(req.body.phone);

  if(
    !u ||
    !bcrypt.compareSync(
      req.body.password || '',
      u.password
    )
  )
    return res.status(401).json({
      error:'ژمارە یان وشەی نهێنی هەڵەیە'
    });

  req.session.uid = u.id;
  req.session.role = u.role;

  res.json({
    ok:true,
    role:u.role
  });
});


app.post('/api/logout',(req,res)=>
  req.session.destroy(()=>
    res.json({ok:true})
  )
);


app.get('/api/me',auth,(req,res)=>{

  let u = db.prepare(`
    SELECT id,name,phone,customer_code,role
    FROM users
    WHERE id=?
  `).get(req.session.uid);

  let shipments = db.prepare(`
    SELECT
      id,
      tracking,
      status,
      weight,
      cost,
      method,
      updated_at
    FROM shipments
    WHERE user_id=?
    ORDER BY id DESC
  `).all(req.session.uid);

  res.json({
    user:u,
    shipments
  });
});


app.get('/api/track/:tracking',(req,res)=>{

  let s = db.prepare(`
    SELECT
      tracking,
      status,
      weight,
      method,
      updated_at
    FROM shipments
    WHERE tracking=?
  `).get(req.params.tracking);

  s
    ? res.json(s)
    : res.status(404).json({
        error:'بار نەدۆزرایەوە'
      });
});


app.get('/api/admin/users',auth,admin,(req,res)=>{

  res.json(
    db.prepare(`
      SELECT
        id,
        name,
        phone,
        customer_code,
        role,
        created_at
      FROM users
      ORDER BY id DESC
    `).all()
  );

});


app.get('/api/admin/shipments',auth,admin,(req,res)=>{

  res.json(
    db.prepare(`
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
    `).all()
  );

});


app.post('/api/admin/shipments',auth,admin,(req,res)=>{

  try {

    let {
      user_id,
      tracking,
      status,
      weight,
      cost,
      method
    } = req.body;

    if(!user_id || !tracking || !status)
      return res.status(400).json({
        error:'زانیارییە سەرەکییەکان تەواو بکە'
      });

    db.prepare(`
      INSERT INTO shipments
      (user_id,tracking,status,weight,cost,method)
      VALUES(?,?,?,?,?,?)
    `).run(
      user_id,
      tracking.trim(),
      status,
      Number(weight)||0,
      Number(cost)||0,
      method||'Air'
    );

    res.json({ok:true});

  } catch(e) {

    res.status(400).json({
      error:'نەتوانرا بار زیاد بکرێت'
    });

  }

});


app.put('/api/admin/shipments/:id',auth,admin,(req,res)=>{

  try {

    let old = db.prepare(
      'SELECT * FROM shipments WHERE id=?'
    ).get(req.params.id);

    if(!old)
      return res.status(404).json({
        error:'بار نەدۆزرایەوە'
      });

    let {
      user_id,
      tracking,
      status,
      weight,
      cost,
      method
    } = req.body;

    db.prepare(`
      UPDATE shipments SET
        user_id=?,
        tracking=?,
        status=?,
        weight=?,
        cost=?,
        method=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      user_id || old.user_id,
      tracking || old.tracking,
      status || old.status,
      weight === undefined ? old.weight : Number(weight),
      cost === undefined ? old.cost : Number(cost),
      method || old.method,
      req.params.id
    );

    res.json({ok:true});

  } catch(e) {

    res.status(400).json({
      error:'نەتوانرا بار دەستکاری بکرێت'
    });

  }

});


app.delete('/api/admin/shipments/:id',auth,admin,(req,res)=>{

  let r = db.prepare(
    'DELETE FROM shipments WHERE id=?'
  ).run(req.params.id);

  if(!r.changes)
    return res.status(404).json({
      error:'بار نەدۆزرایەوە'
    });

  res.json({ok:true});

});


app.use(express.static(path.join(__dirname)));

app.listen(
  process.env.PORT || 3000,
  () => console.log(
    'AM Shipping Express running on port ' +
    (process.env.PORT || 3000)
  )
);
