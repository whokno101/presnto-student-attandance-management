const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { port, nodeEnv, clientUrl } = require('./config/env');
const apiRoutes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

app.use(
  cors({
    origin: [clientUrl, 'http://localhost:5173'],
    credentials: true,
  })
);
// 8 MB: a 5 MB excuse document base64-encodes to ~6.7 MB (PB-19); CSV imports
// are capped separately at 2 MB by the import service (PB-17).
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Unauthenticated liveness probe (not part of the /api surface).
app.get('/health', (req, res) => {
  res.json({ status: 'ok', env: nodeEnv, time: new Date().toISOString() });
});

// Every /api route except POST /api/auth/login is guarded inside its router.
app.use('/api', apiRoutes);

app.use(notFound);
app.use(errorHandler);

const start = async () => {
  try {
    await connectDB();
    app.listen(port, () => {
      console.log(`Server running in ${nodeEnv} mode on http://localhost:${port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

module.exports = { app, start };
