// scripts/test-webhook.js
// Run locally: node scripts/test-webhook.js
// Tests all three webhook topics against your local Vercel dev server

import crypto from "crypto";
import { readFileSync } from "fs";

const BASE_URL = process.env.TEST_URL || "http://localhost:3000";
const SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || "test-secret";

function sign(body) {
  return crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
}

async function sendWebhook(topic, payload) {
  const body = JSON.stringify(payload);
  const hmac = sign(body);

  const res = await fetch(`${BASE_URL}/api/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shopify-topic": topic,
      "x-shopify-hmac-sha256": hmac,
      "x-shopify-shop-domain": "test-store.myshopify.com",
    },
    body,
  });

  const json = await res.json();
  console.log(`\n[${topic}] Status: ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
}

// Test payloads
const abandonedCheckout = {
  email: "test@example.com",
  total_price: "89.99",
  abandoned_checkout_url: "https://test-store.myshopify.com/checkouts/abc123",
  line_items: [
    { title: "Wireless Earbuds", quantity: 1, price: "59.99" },
    { title: "Phone Case", quantity: 2, price: "14.99" },
  ],
};

const orderCreated = {
  email: "customer@example.com",
  first_name: "Sharif",
  order_number: 1042,
  total_price: "149.00",
  order_status_url: "https://test-store.myshopify.com/orders/abc/authenticate?key=xyz",
  line_items: [{ title: "Premium Watch", quantity: 1 }],
};

const inventoryUpdate = {
  inventory_item_id: 808950810,
  location_id: 655441491,
  available: 3, // Below default threshold of 5
};

(async () => {
  console.log("🧪 Testing Shopify Webhook Handler\n" + "=".repeat(40));
  await sendWebhook("checkouts/create", abandonedCheckout);
  await sendWebhook("orders/create", orderCreated);
  await sendWebhook("inventory_levels/update", inventoryUpdate);
  console.log("\n✅ All tests sent.");
})();
