const mongoose = require('mongoose');
const { mongoUri } = require('./env');

/**
 * Opens a single shared Mongoose connection and wires up lifecycle logging.
 * Cached so hot reloads (nodemon) never open duplicate pools.
 */
let cached = global.__mongooseConn || null;

/**
 * MONGO_URI=memory starts a local mongod from mongodb-memory-server (a dev
 * dependency) for machines without MongoDB installed. Data is kept in
 * server/.data/memory-db, so it survives restarts and `npm run seed`.
 */
const resolveUri = async () => {
  if (mongoUri !== 'memory') return mongoUri;

  const fs = require('fs');
  const path = require('path');
  const { MongoMemoryServer } = require('mongodb-memory-server');

  const dbPath = path.resolve(__dirname, '../.data/memory-db');
  fs.mkdirSync(dbPath, { recursive: true });

  const server = await MongoMemoryServer.create({
    instance: { dbPath, storageEngine: 'wiredTiger', port: 27018 },
  });
  global.__memoryMongo = server;
  return server.getUri('university-attendance');
};

const connectDB = async () => {
  if (cached && cached.readyState === 1) {
    return cached;
  }

  if (!mongoUri) {
    throw new Error('MONGO_URI is not defined — add it to your .env file');
  }

  mongoose.set('strictQuery', true);

  cached = await mongoose.connect(await resolveUri(), {
    serverSelectionTimeoutMS: 10000,
  });

  global.__mongooseConn = cached;

  console.log(`MongoDB connected: ${cached.connection.host}`);
  return cached;
};

mongoose.connection.on('disconnected', () => {
  // Expected during an intentional shutdown (seed script, SIGINT handler).
  if (mongoose.connection.readyState === 0) return;
  console.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  if (mongoose.connection.readyState === 0) return;
  console.error(`MongoDB connection error: ${err.message}`);
});

/** Closes the connection and, in MONGO_URI=memory mode, the local mongod. */
const disconnectDB = async () => {
  await mongoose.connection.close();
  if (global.__memoryMongo) {
    await global.__memoryMongo.stop();
    global.__memoryMongo = null;
  }
};

// SIGTERM is what nodemon sends on restart; the local mongod (memory mode) must
// release its port before the next process starts.
['SIGINT', 'SIGTERM'].forEach((signal) =>
  process.on(signal, async () => {
    await disconnectDB().catch(() => {});
    process.exit(0);
  })
);

module.exports = connectDB;
module.exports.disconnectDB = disconnectDB;
