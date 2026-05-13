require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

const dbURI = process.env.MONGODB_URI
  ? process.env.MONGODB_URI.trim().replace(/^["'](.+)["']$/, '$1')
  : '';

const isVercel = Boolean(process.env.VERCEL);

if (dbURI) {
  mongoose
    .connect(dbURI)
    .then(() => {
      if (!isVercel) {
        console.log('[seller-autopilot] MongoDB connected');
      }
    })
    .catch((err) => {
      console.error('[seller-autopilot] MongoDB connection error:', err.message);
    });
} else {
  console.error('[seller-autopilot] MONGODB_URI is not set');
}

app.use('/api/auth', authRoutes);

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    configuration: dbURI ? 'mongodb_uri_present' : 'mongodb_uri_missing',
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = Number(process.env.PORT) || 3000;

module.exports = app;

// Vercel invokes serverless handlers per request; never call listen() there.
// Local development: run with `node server.cjs`.
if (!isVercel && require.main === module) {
  app.listen(PORT, () => {
    console.log(`[seller-autopilot] HTTP server listening on port ${PORT}`);
  });
}
