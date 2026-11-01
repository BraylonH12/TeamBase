require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const usePostgres = Boolean(process.env.DATABASE_URL || process.env.DB_HOST);
let ready;

async function create() {
  if (usePostgres) {
    const { Pool, types } = require('pg');
    types.setTypeParser(20, Number);

    const pool = new Pool(process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL, max: 10 }
      : {
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT || 5432),
          database: process.env.DB_NAME || 'teambase',
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          max: 10,
        });

    return {
      query: (text, params) => pool.query(text, params),
      exec: (sql) => pool.query(sql),
      transaction: async (callback) => {
        const client = await pool.connect();

        try {
          await client.query('BEGIN');
          const result = await callback(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR
    || (process.env.NODE_ENV === 'test' ? undefined : path.join(ROOT, 'data/pgdata'));
  const pg = new PGlite(dir);
  await pg.waitReady;

  return {
    query: (text, params) => pg.query(text, params),
    exec: (sql) => pg.exec(sql),
    transaction: (callback) => pg.transaction(callback),
    close: () => pg.close(),
  };
}

async function migrate(database) {
  await database.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  const applied = new Set(
    (await database.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name),
  );
  const migrationsDir = path.join(ROOT, 'db/migrations');
  const migrations = fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const name of migrations) {
    if (applied.has(name)) continue;
    await database.exec(fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
    await database.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
  }
}

async function seed(database) {
  const seedDir = path.join(ROOT, 'db/seeds');
  if (!fs.existsSync(seedDir)) return;

  const seeds = fs.readdirSync(seedDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const name of seeds) {
    await database.exec(fs.readFileSync(path.join(seedDir, name), 'utf8'));
  }
}

async function init() {
  const database = await create();

  try {
    await migrate(database);
    const shouldSeed = process.env.SEED_DEMO
      ? process.env.SEED_DEMO === 'true'
      : !usePostgres && process.env.NODE_ENV !== 'production';
    if (shouldSeed) await seed(database);
    return database;
  } catch (error) {
    await database.close();
    throw error;
  }
}

function driver() {
  if (!ready) {
    ready = init().catch((error) => {
      ready = undefined;
      throw error;
    });
  }
  return ready;
}

module.exports = {
  query: async (text, params) => (await driver()).query(text, params),
  connect: async () => { await driver(); },
  disconnect: async () => {
    if (!ready) return;
    const current = ready;
    ready = undefined;
    const database = await current;
    await database.close();
  },
  transaction: async (callback) => (await driver()).transaction(callback),
};
