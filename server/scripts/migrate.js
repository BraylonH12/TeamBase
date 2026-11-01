require('dotenv').config();
const db = require('../config/db');

if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
  console.error('Set DATABASE_URL (or DB_HOST) to use db:migrate with PostgreSQL.');
  process.exitCode = 1;
} else {
  db.connect()
    .then(() => db.disconnect())
    .catch(async (error) => {
      console.error('Database migration failed:', error.message);
      try {
        await db.disconnect();
      } catch (closeError) {
        console.error('Failed to close the database connection:', closeError.message);
      }
      process.exitCode = 1;
    });
}
