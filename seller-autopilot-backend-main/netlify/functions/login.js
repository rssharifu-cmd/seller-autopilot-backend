const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { email, password } = JSON.parse(event.body);

    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const users = client.db('seller-autopilot').collection('users');

    const user = await users.findOne({ email });
    if (!user) {
      await client.close();
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      await client.close();
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    await client.close();

    const token = jwt.sign({ id: user._id, email }, process.env.JWT_SECRET, { expiresIn: '30d' });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        token,
        user: { name: user.name, email: user.email, subscription: user.subscription }
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
