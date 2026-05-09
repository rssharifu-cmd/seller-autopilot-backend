const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Resend } = require("resend");

// এপিআই কী গুলো এনভায়রনমেন্ট ভেরিয়েবল থেকে আসছে
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendAiPersonalizedEmail(customerName, productName, quantity) {
  try {
    // ১. জেমিনি মডেল সেটআপ
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // ২. এআই এর জন্য প্রম্পট (ইমেইলটা কেমন হবে তার ইনস্ট্রাকশন)
    const prompt = `
      Write a warm, professional, and friendly email to a Shopify store owner named ${customerName}. 
      The product "${productName}" is running low in stock (only ${quantity} left). 
      Make the email helpful and encouraging, suggesting they restock soon to keep their customers happy. 
      Keep it concise and conversational. Do not use placeholders, write the final email body.
    `;

    // ৩. জেমিনি থেকে কন্টেন্ট জেনারেট করা
    const result = await model.generateContent(prompt);
    const aiEmailBody = result.response.text();

    // ৪. রিসেন্ড (Resend) দিয়ে ইমেইল পাঠানো
    await resend.emails.send({
      from: "Seller Autopilot <contact@sharflow.com>", // তোর ভেরিফাইড ডোমেইন ইমেইল
      to: "rssharifu@gmail.com", // তোর পার্সোনাল ইমেইল (টেস্ট করার জন্য)
      subject: `Action Required: ${productName} is low on stock!`,
      html: `<div>${aiEmailBody.replace(/\n/g, '<br>')}</div>`, 
    });

    console.log("AI Email sent successfully!");
  } catch (error) {
    console.error("Error in AI Automation:", error);
    
    // যদি এআই ফেল করে, তবেই শুধু এই ব্যাকআপ মেসেজটা যাবে
    console.log("Sending fallback static email...");
    // তোর পুরনো ওই কঙ্কাল কোডটা এখানে থাকবে...
  }
}

module.exports = { sendAiPersonalizedEmail };
