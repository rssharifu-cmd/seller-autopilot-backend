const mongoose = require('mongoose');
const User = require('../../models/User');

async function connect() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await connect();
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields required' });
    }

    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: 'User already exists' });
    }

    await User.create({
      name,
      email: String(email).toLowerCase(),
      password
    });

    return res.status(201).json({ success: true, message: 'User created!' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
