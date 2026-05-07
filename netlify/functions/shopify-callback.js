const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const DASHBOARD_URL = 'https://seller-autopilot-app.netlify.app';

exports.handler = async (event) => {
    let client;
    try {
        const { shop, code, state } = event.queryStringParameters || {};

        if (!shop || !code || !state) {
            console.error('Missing params:', { shop, code, state });
            return redirect(`${DASHBOARD_URL}?shopify=error&reason=missing_params`);
        }

        // ১. State থেকে ইউজারের আইডি (userId) উদ্ধার করা
        let userIdFromState = null;
        try {
            const parts = state.split('.');
            const token = parts.slice(1).join('.');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userIdFromState = decoded.uid;
        } catch (e) {
            console.error('Invalid state:', e.message);
            return redirect(`${DASHBOARD_URL}?shopify=error&reason=invalid_state`);
        }

        const cleanShop = shop.trim().toLowerCase();

        // ২. শপিফাই থেকে এক্সেস টোকেন নেওয়া
        const tokenRes = await axios.post(
            `https://${cleanShop}/admin/oauth/access_token`,
            {
                client_id: process.env.SHOPIFY_API_KEY,
                client_secret: process.env.SHOPIFY_API_SECRET,
                code
            }
        );

        const accessToken = tokenRes.data.access_token;

        // ৩. শপ ইনফো আনা
        const shopRes = await axios.get(
            `https://${cleanShop}/admin/api/2024-01/shop.json`,
            { headers: { 'X-Shopify-Access-Token': accessToken } }
        );
        const shopInfo = shopRes.data.shop;

        // ৪. ডাটাবেজে আপনার নির্দিষ্ট আইডিতে (userId) ডাটা সেভ করা
        client = new MongoClient(process.env.MONGODB_URI);
        await client.connect();
        const users = client.db('seller-autopilot').collection('users');

        // এখানে আমরা ইউজারের _id দিয়ে আপডেট করছি, যার ফলে জিমেইল আলাদা হলেও সমস্যা নেই
        const result = await users.findOneAndUpdate(
            { _id: new ObjectId(userIdFromState) },
            {
                $set: {
                    'shopify.shop': cleanShop,
                    'shopify.accessToken': accessToken,
                    'shopify.shopName': shopInfo.name,
                    'shopify.connectedAt': new Date()
                }
            },
            { returnDocument: 'after' }
        );

        if (!result) {
            console.error('No user found for ID:', userIdFromState);
            return redirect(`${DASHBOARD_URL}?shopify=error&reason=user_not_found`);
        }

        console.log('Successfully linked Shopify to UserID:', userIdFromState);

        return redirect(`${DASHBOARD_URL}?shopify=connected&shop=${encodeURIComponent(shopInfo.name)}`);

    } catch (err) {
        console.error('Callback error:', err.message);
        return redirect(`${DASHBOARD_URL}?shopify=error&reason=server_error`);
    } finally {
        if (client) {
            try { await client.close(); } catch (_) {}
        }
    }
};

function redirect(url) {
    return { statusCode: 302, headers: { Location: url }, body: '' };
}
