// api/webhook.js — Shopify Webhook Handler (Vercel Serverless Function)
// Handles: checkouts/create, orders/create, inventory_levels/update

import crypto from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Resend } from "resend";
import { MongoClient } from "mongodb";

// ─── Clients ────────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

let cachedClient = null;

async function getMongoClient() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

async function getDb() {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB_NAME || "shopify_automation");
}

// ─── HMAC Verification ───────────────────────────────────────────────────────
function verifyShopifyHmac(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) throw new Error("SHOPIFY_WEBHOOK_SECRET is not set.");
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

// ─── Gemini AI Helper ────────────────────────────────────────────────────────
async function generateEmailContent(prompt) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ─── MongoDB Tracking Helpers ────────────────────────────────────────────────
async function trackEmailSent(type, revenue = 0) {
  const db = await getDb();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  await db.collection("email_stats").updateOne(
    { date: today, type },
    {
      $inc: { count: 1, revenue },
      $setOnInsert: { date: today, type, createdAt: new Date() },
    },
    { upsert: true }
  );
}

async function trackInventoryAlert(sku, variantId) {
  const db = await getDb();
  await db.collection("inventory_alerts").updateOne(
    { variantId: String(variantId) },
    {
      $set: { sku, lastAlertAt: new Date() },
      $inc: { alertCount: 1 },
    },
    { upsert: true }
  );
}

// ─── Topic Handlers ──────────────────────────────────────────────────────────

/**
 * checkouts/create — Abandoned Checkout Email
 */
async function handleAbandonedCheckout(payload) {
  const { email, line_items, total_price, abandoned_checkout_url } = payload;

  if (!email) return { skipped: true, reason: "No email on checkout" };

  const items = (line_items || [])
    .map((i) => `${i.title} x${i.quantity} — $${i.price}`)
    .join("\n");

  const prompt = `
You are a friendly Shopify store assistant. Write a short, warm abandoned cart recovery email.

Customer left these items:
${items}
Cart total: $${total_price}
Recovery link: ${abandoned_checkout_url}

Guidelines:
- Subject line (compelling, max 60 chars)
- 2–3 short paragraphs
- Include a clear CTA button text
- Friendly, not pushy
- Return as JSON: { subject, body, ctaText }
Only return valid JSON. No markdown.
`;

  const raw = await generateEmailContent(prompt);
  const { subject, body, ctaText } = JSON.parse(raw);

  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: email,
    subject,
    html: buildEmailHtml({ title: subject, body, ctaText, ctaUrl: abandoned_checkout_url }),
  });

  await trackEmailSent("abandoned_checkout", parseFloat(total_price) || 0);

  return { sent: true, type: "abandoned_checkout", to: email };
}

/**
 * orders/create — Welcome / Order Confirmation Email
 */
async function handleOrderCreated(payload) {
  const { email, first_name, order_number, line_items, total_price, order_status_url } = payload;
  const customer = payload.customer || {};
  const name = first_name || customer.first_name || "there";

  if (!email) return { skipped: true, reason: "No email on order" };

  const items = (line_items || [])
    .map((i) => `${i.title} x${i.quantity}`)
    .join(", ");

  const prompt = `
Write a warm, brand-friendly order confirmation email for an e-commerce store.

Customer: ${name}
Order #${order_number}
Items: ${items}
Total: $${total_price}
Order status URL: ${order_status_url}

Guidelines:
- Subject line (clear, include order number)
- Thank the customer genuinely
- Brief order summary mention
- CTA to track order
- Return as JSON: { subject, body, ctaText }
Only return valid JSON. No markdown.
`;

  const raw = await generateEmailContent(prompt);
  const { subject, body, ctaText } = JSON.parse(raw);

  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: email,
    subject,
    html: buildEmailHtml({ title: subject, body, ctaText, ctaUrl: order_status_url }),
  });

  await trackEmailSent("order_confirmation", parseFloat(total_price) || 0);

  return { sent: true, type: "order_confirmation", to: email, orderNumber: order_number };
}

/**
 * inventory_levels/update — Low Stock Alert to Store Owner
 */
async function handleInventoryUpdate(payload) {
  const { inventory_item_id, location_id, available } = payload;
  const threshold = parseInt(process.env.LOW_STOCK_THRESHOLD || "5", 10);

  if (available > threshold) {
    return { skipped: true, reason: `Stock (${available}) above threshold (${threshold})` };
  }

  const prompt = `
Write a concise internal low-stock alert email for a Shopify store owner.

Inventory Item ID: ${inventory_item_id}
Location ID: ${location_id}
Current stock: ${available} units
Threshold: ${threshold} units

Guidelines:
- Subject: urgent, mention item and stock level
- Body: 2–3 sentences with action recommendation
- Return as JSON: { subject, body }
Only return valid JSON. No markdown.
`;

  const raw = await generateEmailContent(prompt);
  const { subject, body } = JSON.parse(raw);

  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: process.env.STORE_OWNER_EMAIL,
    subject,
    html: buildEmailHtml({ title: subject, body, ctaText: "View Inventory", ctaUrl: `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/products` }),
  });

  await trackInventoryAlert(`item_${inventory_item_id}`, inventory_item_id);
  await trackEmailSent("low_stock_alert");

  return { sent: true, type: "low_stock_alert", itemId: inventory_item_id, available };
}

// ─── Email HTML Builder ──────────────────────────────────────────────────────
function buildEmailHtml({ title, body, ctaText, ctaUrl }) {
  const paragraphs = body
    .split("\n")
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6;color:#374151;">${p}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:#111827;padding:28px 40px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">${process.env.STORE_NAME || "Your Store"}</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 24px;font-size:22px;color:#111827;">${title}</h2>
          ${paragraphs}
          ${ctaText && ctaUrl ? `
          <div style="margin:32px 0 0;">
            <a href="${ctaUrl}" style="display:inline-block;background:#111827;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">${ctaText}</a>
          </div>` : ""}
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;font-size:13px;color:#9ca3af;">You received this email because you interacted with ${process.env.STORE_NAME || "our store"}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Main Handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Collect raw body for HMAC verification
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks);

  // Verify Shopify HMAC
  const hmacHeader = req.headers["x-shopify-hmac-sha256"];
  if (!hmacHeader) return res.status(401).json({ error: "Missing HMAC header" });

  try {
    if (!verifyShopifyHmac(rawBody, hmacHeader)) {
      return res.status(401).json({ error: "HMAC verification failed" });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const topic = req.headers["x-shopify-topic"];
  let payload;

  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  console.log(`[Webhook] Received topic: ${topic}`);

  try {
    let result;

    switch (topic) {
      case "checkouts/create":
        result = await handleAbandonedCheckout(payload);
        break;
      case "orders/create":
        result = await handleOrderCreated(payload);
        break;
      case "inventory_levels/update":
        result = await handleInventoryUpdate(payload);
        break;
      default:
        result = { skipped: true, reason: `Unhandled topic: ${topic}` };
    }

    console.log(`[Webhook] Result:`, result);
    return res.status(200).json({ ok: true, topic, ...result });
  } catch (err) {
    console.error(`[Webhook] Error handling ${topic}:`, err);
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
}

// Required for raw body access in Vercel
export const config = {
  api: {
    bodyParser: false,
  },
};
