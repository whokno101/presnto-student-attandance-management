const mongoose = require('mongoose');
const { mongoUri } = require('./env');

/**
 * Opens a single shared Mongoose connection and wires up lifecycle logging.
 * Cached so hot reloads (nodemon) never open duplicate pools.
 */
let cached = global.__mongooseConn || null;

const connectDB = async () => {
  if (cached && cached.readyState === 1) {
    return cached;
  }

  if (!mongoUri) {
    throw new Error('MONGO_URI is not defined — add it to your .env file');
  }

  mongoose.set('strictQuery', true);

  cached = await mongoose.connect(mongoUri, {
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

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

module.exports = connectDB;
