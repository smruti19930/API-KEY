// ✅ Load environment variables
require("dotenv").config();

// ✅ Import required modules
const express = require("express");
const mongoose = require("mongoose");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const crypto = require("crypto");
const cors = require("cors");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();

// ✅ Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ✅ MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: "sample_mflix", // ✅ Ensures correct database
  })
  .then(() => {
    console.log("✅ MongoDB connected");
    console.log("🧠 Active Database:", mongoose.connection.name); // Shows actual DB name
  })
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ API Key schema
const ApiKeySchema = new mongoose.Schema({
  userEmail: String,
  key: String,
  requests: { type: Number, default: 0 },
  maxRequests: { type: Number, default: 1000 },
});
const ApiKey = mongoose.model("ApiKey", ApiKeySchema);

// ✅ Stripe Webhook handler
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_email;
    const apiKey = crypto.randomBytes(24).toString("hex");

    try {
      const saved = await ApiKey.create({ userEmail: email, key: apiKey });
      console.log(`✅ API Key saved to DB for ${email}: ${saved.key}`);
    } catch (err) {
      console.error("❌ Failed to save API key to DB:", err);
    }

    try {
      await transporter.sendMail({
        from: `API Service <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Your API Key",
        html: `<p>Thank you for subscribing!</p><p>Your API key is: <b>${apiKey}</b></p>`,
      });
      console.log(`📧 API Key emailed to ${email}`);
    } catch (emailErr) {
      console.error("❌ Failed to send email:", emailErr);
    }
  }

  res.sendStatus(200);
});

// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ✅ Homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Stripe Checkout Session Creator
app.post("/create-checkout-session", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

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
    console.error("❌ Checkout error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Protected Endpoint
app.get("/protected", async (req, res) => {
  const apiKey = req.headers["x-api-key"] || req.headers["x-rapidapi-key"];
  if (!apiKey) return res.status(401).json({ error: "API key required" });

  try {
    const keyData = await ApiKey.findOne({ key: apiKey });
    if (!keyData) return res.status(401).json({ error: "Invalid API key" });

    if (keyData.requests >= keyData.maxRequests) {
      return res.status(429).json({ error: "Quota exceeded" });
    }

    keyData.requests += 1;
    await keyData.save();

    res.json({ message: "✅ Access granted" });
  } catch (err) {
    console.error("❌ Error in protected route:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
