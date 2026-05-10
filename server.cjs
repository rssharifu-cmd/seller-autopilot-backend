require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');

// routes
const authRoutes = require('./routes/auth');
const shopifyRoutes = require('./routes/shopify');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

// ডাটাবেজ কানেকশন
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('DB Connection Error:', err));

// এপিআই রাউটস
app.use('/api/auth', authRoutes);
app.use('/api/shopify', shopifyRoutes);

// Google Login Mock API (Firebase/Google SDK-র জন্য)
app.post('/api/auth/google', async (req, res) => {
  try {
    const { email, name, googleId } = req.body;
    // এখানে ইউজার ডাটাবেজে চেক/সেভ করার লজিক থাকবে
    res.json({ success: true, message: "Google login successful", user: { email, name } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Google login failed" });
  }
});

// হেলথ চেক
app.get('/api/status', (req, res) => {
  res.json({ status: "Seller Autopilot API running ✅", version: "1.1.0" });
});

// ফ্রন্টএন্ড পরিবেশন
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
