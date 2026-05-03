const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { name, email, password } = JSON.parse(event.body);
    if (!name || !email || !password) {
      return { statusCode: 400, body: JSON.stringify({ error: 'All fields required' }) };
    }

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('seller-autopilot');
    const users = db.collection('users');

    // Check existing
    const existing = await users.findOne({ email });
    if (existing) {
      await client.close();
      return { statusCode: 400, body: JSON.stringify({ error: 'Email already registered' }) };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = {
      name,
      email,
      password: hashedPassword,
      createdAt: new Date(),
      subscription: { status: 'trial', plan: 'starter', trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
      automations: {
        welcomeEmail: true,
        lowStockAlert: true,
        abandonedCart: true,
        reviewReply: true,
        weeklySalesReport: true,
        refundAutoReply: true,
        crmLog: true,
        outOfStockWaitlist: false,
        dailyRevenueSummary: true,
        negativeReviewAlert: true
      },
      stats: { emailsSent: 0, revenueRecovered: 0, reviewsHandled: 0 }
    };

    const result = await users.insertOne(user);
    await client.close();

    // Generate token
    const token = jwt.sign({ id: result.insertedId, email }, JWT_SECRET, { expiresIn: '30d' });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, token, user: { name, email } })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
