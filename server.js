require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const crypto = require("crypto");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");

const app = express();

// Webhook requires raw body
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
      console.error("❌ Webhook signature error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const email = session.customer_email;
      const apiKey = crypto.randomBytes(24).toString("hex");

      await ApiKey.create({ userEmail: email, key: apiKey });
      console.log(`✅ API Key generated for ${email}`);
    }

    res.sendStatus(200);
  }
);

// Middleware (after webhook)
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// API key schema
const ApiKeySchema = new mongoose.Schema({
  userEmail: String,
  key: String,
  requests: { type: Number, default: 0 },
  maxRequests: { type: Number, default: 1000 }
});
const ApiKey = mongoose.model("ApiKey", ApiKeySchema);

// Stripe checkout session
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
          quantity: 1
        }
      ],
      customer_email: email,
      success_url: `${process.env.FRONTEND_URL}/success.html`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel.html`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("❌ Checkout error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Rate limiting (optional)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many requests from this IP. Please try again later."
});
app.use(limiter);

// Static file serving
app.use(express.static(path.join(__dirname, "public")));

// Serve homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Protected API route
app.get("/protected", async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) return res.status(401).json({ error: "API key required" });

  const keyData = await ApiKey.findOne({ key: apiKey });
  if (!keyData) return res.status(401).json({ error: "Invalid API key" });

  if (keyData.requests >= keyData.maxRequests) {
    return res.status(429).json({ error: "Quota exceeded" });
  }

  keyData.requests += 1;
  await keyData.save();

  res.json({ message: "Access granted ✅", remaining: keyData.maxRequests - keyData.requests });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
