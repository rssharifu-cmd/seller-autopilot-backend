const { MongoClient } = require('mongodb');

// Environment Variables
const MONGODB_URI = process.env.MONGODB_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// 1. Gemini AI দিয়ে ইমেইল কন্টেন্ট জেনারেট করা
async function generateEmail(prompt) {
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            }
        );
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (error) {
        console.error('Gemini Error:', error);
        return '';
    }
}

// 2. Resend দিয়ে ইমেইল পাঠানো
async function sendEmail({ to, subject, html }) {
    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`
            },
            body: JSON.stringify({
                from: 'Seller Autopilot <onboarding@resend.dev>',
                to,
                subject,
                html
            })
        });
        return response.json();
    } catch (error) {
        console.error('Resend Error:', error);
    }
}

exports.handler = async (event) => {
    // শুধুমাত্র POST রিকোয়েস্ট গ্রহণ করবে
    if (event.httpMethod !== 'POST') {
        return { statusCode: 200, body: 'OK' };
    }

    const client = new MongoClient(MONGODB_URI);

    try {
        const topic = event.headers['x-shopify-topic'] || '';
        const shopDomain = (event.headers['x-shopify-shop-domain'] || '').toLowerCase();
        const body = JSON.parse(event.body || '{}');

        await client.connect();
        const db = client.db('seller-autopilot');

        // --- আপনার নতুন শক্তিশালী কুয়েরি ---
        const seller = await db.collection('users').findOne({ 
            $or: [
                { shopDomain: shopDomain },
                { 'shopify.shop': shopDomain }
            ]
        });

        if (!seller) {
            console.log(`Seller not found for: ${shopDomain}`);
            await client.close();
            return { statusCode: 200, body: 'Seller not found' };
        }

        // --- ১. অর্ডার কনফার্মেশন (Welcome Email) ---
        if (topic === 'orders/create' && seller.automations?.welcomeEmail) {
            const customerEmail = body.email;
            const customerName = body.billing_address?.first_name || 'Valued Customer';
            const storeName = body.shop_name || seller.shopDomain;
            const orderNumber = body.order_number || body.name;
            const total = body.total_price;

            if (customerEmail) {
                const prompt = `Write a warm, professional order confirmation email for:
                - Customer: ${customerName}, Store: ${storeName}, Order: #${orderNumber}, Total: $${total}.
                Keep it under 150 words. Use HTML for a clean look.`;

                const emailContent = await generateEmail(prompt);
                await sendEmail({
                    to: customerEmail,
                    subject: `Thank you for your order, ${customerName}! 🎉`,
                    html: emailContent || `<h2>Order Confirmation</h2><p>Your order #${orderNumber} is confirmed!</p>`
                });

                await db.collection('users').updateOne(
                    { _id: seller._id },
                    { $inc: { 'stats.emailsSent': 1, 'stats.totalOrders': 1 } }
                );
            }
        }

        // --- ২. পরিত্যক্ত কার্ট (Abandoned Cart) ---
        if (topic === 'checkouts/create' && seller.automations?.abandonedCart) {
            const customerEmail = body.email;
            const customerName = body.billing_address?.first_name || 'there';
            const cartUrl = body.abandoned_checkout_url;

            if (customerEmail && cartUrl) {
                const prompt = `Write a friendly abandoned cart recovery email for:
                - Customer: ${customerName}, Store: ${seller.shopDomain}, Link: ${cartUrl}.
                Include a clear CTA button. Keep it under 100 words. HTML format.`;

                const emailContent = await generateEmail(prompt);
                await sendEmail({
                    to: customerEmail,
                    subject: `You left something behind, ${customerName}! 🛒`,
                    html: emailContent
                });

                await db.collection('users').updateOne(
                    { _id: seller._id },
                    { $inc: { 'stats.emailsSent': 1 } }
                );
            }
        }

        // --- ৩. লো-স্টক অ্যালার্ট (Low Stock) ---
        if (topic === 'inventory_levels/update' && seller.automations?.lowStockAlert) {
            const available = body.available;
            if (available !== null && available <= 5) {
                await sendEmail({
                    to: seller.email,
                    subject: `⚠️ Low Stock Alert — Only ${available} left!`,
                    html: `<h3>Low Stock Warning</h3><p>Your product (ID: ${body.inventory_item_id}) has only <b>${available}</b> units left.</p>`
                });
            }
        }

        await client.close();
        return { statusCode: 200, body: JSON.stringify({ success: true }) };

    } catch (error) {
        console.error('Automation error:', error);
        if (client) await client.close();
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
