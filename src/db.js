// MongoDB connection shared by the API, the admin routes and the CLI scripts.
const { MongoClient } = require('mongodb');

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'lovewins';

// Reuse one connection per process. Vercel keeps the module warm between
// requests, so a cached client avoids reconnecting (and re-authenticating)
// on every invocation.
let cached = global.__lovewinsMongo;
if (!cached) cached = global.__lovewinsMongo = { client: null, db: null, connecting: null };

async function connect() {
  if (cached.db) return cached.db;
  if (!URI) throw new Error('MONGODB_URI is not set. Copy .env.example to .env and add your connection string.');
  if (!cached.connecting) {
    cached.client = new MongoClient(URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 10000 });
    cached.connecting = cached.client.connect()
      .then(async (client) => {
        const db = client.db(DB_NAME);
        await ensureIndexes(db);
        cached.db = db;
        return db;
      })
      .catch((err) => { cached.connecting = null; return Promise.reject(err); });
  }
  return cached.connecting;
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection('donations').createIndexes([{ key: { id: 1 }, unique: true }, { key: { tx_ref: 1 }, unique: true }, { key: { status: 1 } }]),
    db.collection('messages').createIndex({ id: 1 }, { unique: true }),
    db.collection('subscribers').createIndexes([{ key: { id: 1 }, unique: true }, { key: { email: 1 }, unique: true }]),
    db.collection('stories').createIndex({ id: 1 }, { unique: true }),
    db.collection('reports').createIndex({ id: 1 }, { unique: true }),
    db.collection('admins').createIndexes([{ key: { id: 1 }, unique: true }, { key: { username: 1 }, unique: true }]),
  ]);
}

// Documents keep a numeric "id" so the admin dashboard and CSV exports behave
// the same way they did with the old SQLite AUTOINCREMENT column.
async function nextId(name) {
  const db = await connect();
  const counter = await db.collection('counters').findOneAndUpdate(
    { _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return counter.seq;
}

// Matches SQLite's datetime('now') format: "YYYY-MM-DD HH:MM:SS" in UTC.
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

async function get(name) {
  return (await connect()).collection(name);
}

async function insert(name, doc) {
  const row = { created_at: now(), ...doc, id: await nextId(name) };
  await (await get(name)).insertOne(row);
  return row;
}

async function list(name, filter = {}, { limit = 0, sort = { id: -1 }, projection = {} } = {}) {
  let cursor = (await get(name))
    .find(filter, { projection: { _id: 0, ...projection } })
    .sort(sort);
  if (limit) cursor = cursor.limit(limit);
  return cursor.toArray();
}

async function close() {
  if (cached.client) await cached.client.close();
  cached.client = null; cached.db = null; cached.connecting = null;
}

module.exports = { connect, get, insert, list, nextId, now, close };
