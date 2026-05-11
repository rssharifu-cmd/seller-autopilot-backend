import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  email: { type: String, required: true },
  password: { type: String, required: true }
}));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI);
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && await bcrypt.compare(password, user.password)) {
      res.status(200).json({ success: true, message: "Login successful!" });
    } else {
      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
