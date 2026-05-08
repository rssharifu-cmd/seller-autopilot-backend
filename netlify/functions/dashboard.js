const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Get token from header
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'No token provided' })
      };
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Session expired. Please login again.' })
      };
    }

    // Get user from MongoDB
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('seller-autopilot');
    const user = await db.collection('users').findOne({ email: decoded.email });
    await client.close();

    if (!user) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        name: user.name,
        email: user.email,
        shopDomain: user.shopDomain || null,
        automations: user.automations || {},
        stats: {
          emailsSent: user.stats?.emailsSent || 0,
          revenueRecovered: user.stats?.revenueRecovered || 0,
          reviewsHandled: user.stats?.reviewsHandled || 0,
          totalOrders: user.stats?.totalOrders || 0
        }
      })
    };

  } catch (error) {
    console.error('Dashboard error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
