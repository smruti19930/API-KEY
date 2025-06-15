// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const crypto = require("crypto");
const cors = require("cors");
const path = require("path");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");

const app = express();

// Raw body for Stripe webhook
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const email = session.customer_email;
      const apiKey = crypto.randomBytes(24).toString("hex");

      await ApiKey.create({
        userEmail: email,
        key: apiKey,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Your API Key",
        text: `Thanks for subscribing! Your API Key: ${apiKey}`,
      });
    }

    res.sendStatus(200);
  }
);

// Apply middleware AFTER webhook
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
});
app.use(limiter);

// MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const ApiKeySchema = new mongoose.Schema({
  userEmail: String,
  key: String,
  requests: { type: Number, default: 0 },
  maxRequests: { type: Number, default: 1000 },
  expiresAt: Date,
  revoked: { type: Boolean, default: false },
});
const ApiKey = mongoose.model("ApiKey", ApiKeySchema);

// Public routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/create-checkout-session", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      customer_email: email,
      success_url: `${process.env.FRONTEND_URL}/success.html`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel.html`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Protected API route
app.get("/protected", async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  const keyData = await ApiKey.findOne({ key: apiKey });

  if (!keyData || keyData.revoked) return res.status(403).json({ error: "Invalid or revoked API key" });
  if (keyData.expiresAt && Date.now() > keyData.expiresAt) return res.status(403).json({ error: "API key expired" });
  if (keyData.requests >= keyData.maxRequests) return res.status(429).json({ error: "Quota exceeded" });

  keyData.requests += 1;
  await keyData.save();
  console.log(`[${new Date().toISOString()}] API accessed with key ${apiKey}`);

  res.json({ message: "Access granted! ✅" });
});

// Admin routes
app.get("/admin/keys", async (req, res) => {
  if (req.headers["admin-token"] !== process.env.ADMIN_TOKEN) return res.status(401).send("Unauthorized");
  const keys = await ApiKey.find();
  res.json(keys);
});

app.post("/admin/revoke/:id", async (req, res) => {
  if (req.headers["admin-token"] !== process.env.ADMIN_TOKEN) return res.status(401).send("Unauthorized");
  await ApiKey.findByIdAndUpdate(req.params.id, { revoked: true });
  res.send("Key revoked");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
