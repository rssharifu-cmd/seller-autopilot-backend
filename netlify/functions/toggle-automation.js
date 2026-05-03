const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const token = event.headers.authorization?.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { key, value } = JSON.parse(event.body);

    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const users = client.db('seller-autopilot').collection('users');

    await users.updateOne(
      { _id: new ObjectId(decoded.id) },
      { $set: { [`automations.${key}`]: value } }
    );

    await client.close();

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
