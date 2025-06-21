require("dotenv").config();
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const crypto = require("crypto");
const cors = require("cors");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ✅ Nodemailer (for Stripe email delivery)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ✅ Stripe Webhook for own site (optional)
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook Error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_email;
    const apiKey = crypto.randomBytes(24).toString("hex");

    try {
      await transporter.sendMail({
        from: `API Service <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Your API Key",
        html: `<p>Thanks for subscribing!</p><p>Your API key: <b>${apiKey}</b></p>`,
      });
      console.log(`📧 Email sent to ${email}`);
    } catch (err) {
      console.error("❌ Error sending email:", err);
    }
  }

  res.status(200).send("Webhook processed");
});

// ✅ Stripe checkout session (optional)
app.post("/create-checkout-session", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      customer_email: email,
      success_url: `${process.env.FRONTEND_URL}/success.html`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel.html`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("❌ Stripe session error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Landing page route (optional)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ FINAL RapidAPI-compatible /protected endpoint
app.get("/protected", (req, res) => {
  const apiKey = req.headers["x-rapidapi-key"];

  if (!apiKey) {
    return res.status(401).json({ error: "Missing X-RapidAPI-Key header" });
  }

  // ⚠️ DO NOT validate the key manually — RapidAPI does this
  res.status(200).json({
    message: "✅ Access granted via RapidAPI",
    yourKey: apiKey,
  });
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
