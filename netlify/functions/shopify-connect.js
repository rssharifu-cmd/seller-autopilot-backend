const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// আপনার নতুন নেটলিফাই ইউআরএলটি এখানে আপডেট করবেন
const REDIRECT_URI = 'https://seller-autopilot-app.netlify.app/.netlify/functions/shopify-callback';
const SCOPES = 'read_orders,write_orders,read_inventory,read_products,read_customers';

function getBearerToken(event) {
    const raw = event.headers?.authorization || event.headers?.Authorization;
    if (!raw) return null;
    return raw.replace(/^Bearer\s+/i, '').trim();
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            body: ''
        };
    }

    try {
        const { shop } = event.queryStringParameters || {};
        if (!shop) return { statusCode: 400, body: 'Missing shop parameter' };

        // ১. চেক করা হচ্ছে ইউজার লগ-ইন করা কি না
        const bearer = getBearerToken(event);
        if (!bearer || !process.env.JWT_SECRET) {
            return { 
                statusCode: 401, 
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Please login first' }) 
            };
        }

        // ২. ইউজারের আইডি বের করা হচ্ছে (Identity linking)
        const decoded = jwt.verify(bearer, process.env.JWT_SECRET);
        const nonce = crypto.randomBytes(10).toString('hex');
        const stateJwt = jwt.sign({ uid: decoded.id, nonce }, process.env.JWT_SECRET, { expiresIn: '10m' });
        const state = `${nonce}.${stateJwt}`;

        const cleanShop = shop.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

        // ৩. নতুন Auth URL তৈরি
        const authUrl = `https://${cleanShop}/admin/oauth/authorize` +
            `?client_id=${process.env.SHOPIFY_API_KEY}` +
            `&scope=${encodeURIComponent(SCOPES)}` +
            `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
            `&state=${state}`;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ url: authUrl })
        };

    } catch (err) {
        return { 
            statusCode: 500, 
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: err.message }) 
        };
    }
};
