const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  try {
    // Verify token
    const token = event.headers.authorization?.replace('Bearer ', '');
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authenticated' }) };

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const users = client.db('seller-autopilot').collection('users');

    const user = await users.findOne({ _id: new ObjectId(decoded.id) });
    await client.close();

    if (!user) return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: user.name,
        email: user.email,
        subscription: user.subscription,
        automations: user.automations,
        stats: user.stats,
        shopify: user.shopify || null
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
