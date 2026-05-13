const axios = require('axios');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

async function generateText(prompt) {
  const res = await axios.post(
    `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
    { contents: [{ parts: [{ text: prompt }] }] }
  );
  return res.data.candidates[0].content.parts[0].text;
}

// Welcome email for new order
async function generateWelcomeEmail(order) {
  const prompt = `Write a warm, professional order confirmation email in English.
Customer name: ${order.customer?.first_name || 'Customer'} ${order.customer?.last_name || ''}
Order number: #${order.order_number}
Total: ${order.total_price} ${order.currency}
Items: ${order.line_items?.map(i => i.name).join(', ')}
Estimated delivery: 5-7 business days.
Keep it friendly, under 120 words. Start with "Hi [name]," end with "Thank you". Return only the email body.`;

  return await generateText(prompt);
}

// Abandoned cart recovery email
async function generateAbandonedCartEmail(checkout) {
  const prompt = `Write a friendly abandoned cart recovery email in English.
Customer name: ${checkout.customer?.first_name || 'there'}
Items left in cart: ${checkout.line_items?.map(i => i.title).join(', ')}
Cart total: ${checkout.total_price} ${checkout.currency}
Create urgency gently, offer help, under 100 words. Return only email body.`;

  return await generateText(prompt);
}

// Review reply draft
async function generateReviewReply(review) {
  const prompt = `Write a professional reply to this customer review.
Rating: ${review.rating}/5 stars
Review: "${review.body}"
If positive: thank them warmly. If negative: apologize, offer to help, stay calm.
Under 80 words. Return only the reply text.`;

  return await generateText(prompt);
}

// Refund acknowledgment
async function generateRefundReply(order) {
  const prompt = `Write a professional refund acknowledgment email in English.
Customer name: ${order.customer?.first_name || 'Customer'}
Order: #${order.order_number}
Acknowledge the request, say it will be processed in 3-5 business days, thank them for their patience.
Under 80 words. Return only email body.`;

  return await generateText(prompt);
}

// Daily revenue summary for Telegram
async function generateDailySummary(stats) {
  const prompt = `Write a brief daily sales summary message for a Shopify store owner.
Date: ${new Date().toDateString()}
Orders today: ${stats.orders}
Revenue today: $${stats.revenue}
Top product: ${stats.topProduct || 'N/A'}
Keep it short, friendly, use emojis. Under 60 words.`;

  return await generateText(prompt);
}

module.exports = {
  generateWelcomeEmail,
  generateAbandonedCartEmail,
  generateReviewReply,
  generateRefundReply,
  generateDailySummary
};
