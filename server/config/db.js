const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME || 'teambase',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

let connected = false;

async function connect() {
  if (!connected) {
    await client.connect();
    connected = true;
  }
}

async function disconnect() {
  if (connected) {
    await client.end();
    connected = false;
  }
}

async function query(text, params) {
  await connect();
  return client.query(text, params);
}

module.exports = {
  query,
  connect,
  disconnect,
};
