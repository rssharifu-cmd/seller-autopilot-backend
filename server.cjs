require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

// ডাটাবেজ কানেকশন স্ট্রিং ক্লিন করা
const dbURI = process.env.MONGODB_URI ? process.env.MONGODB_URI.trim().replace(/^["'](.+)["']$/, '$1') : "";

if (dbURI) {
  mongoose.connect(dbURI)
    .then(() => console.log('MongoDB connected ✅'))
    .catch(err => console.error('DB Connection Error ❌:', err.message));
} else {
  console.error('CRITICAL: MONGODB_URI is missing or empty!');
}

// Routes
app.use('/api/auth', authRoutes);

app.get('/api/status', (req, res) => {
  res.json({ 
    status: "API running", 
    db: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    env_check: dbURI ? "URI Found" : "URI Missing"
  });
});

// Serve static index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
