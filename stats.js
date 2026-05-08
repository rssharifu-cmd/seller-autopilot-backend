// api/stats.js — Dashboard Stats Endpoint
// Returns email counts and revenue grouped by type and date

import { MongoClient } from "mongodb";

let cachedClient = null;

async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(process.env.MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db(process.env.MONGODB_DB_NAME || "shopify_automation");
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Simple API key guard for dashboard access
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== process.env.DASHBOARD_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const db = await getDb();

    // Last 30 days of email stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split("T")[0];

    const [emailStats, inventoryAlerts, totals] = await Promise.all([
      // Daily breakdown
      db
        .collection("email_stats")
        .find({ date: { $gte: dateStr } })
        .sort({ date: -1 })
        .toArray(),

      // Recent inventory alerts
      db
        .collection("inventory_alerts")
        .find({})
        .sort({ lastAlertAt: -1 })
        .limit(20)
        .toArray(),

      // Aggregate totals per type
      db
        .collection("email_stats")
        .aggregate([
          {
            $group: {
              _id: "$type",
              totalEmails: { $sum: "$count" },
              totalRevenue: { $sum: "$revenue" },
            },
          },
        ])
        .toArray(),
    ]);

    const summary = {
      totals: totals.reduce((acc, t) => {
        acc[t._id] = { emails: t.totalEmails, revenue: t.totalRevenue };
        return acc;
      }, {}),
      dailyStats: emailStats,
      inventoryAlerts,
      generatedAt: new Date().toISOString(),
    };

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(summary);
  } catch (err) {
    console.error("[Stats] Error:", err);
    return res.status(500).json({ error: "Failed to fetch stats", detail: err.message });
  }
}
