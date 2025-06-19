// ✅ Load environment variables
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const crypto = require("crypto");
const cors = require("cors");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();

// ✅ Diagnostics
console.log("Connecting to MongoDB with URI:", process.env.MONGO_URI);

// ✅ MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  const dbName = mongoose.connection.db.databaseName;
  console.log(`✅ MongoDB connected to database: ${dbName}`);
})
.catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ Define API Key schema
const ApiKeySchema = new mongoose.Schema({
  userEmail: String,
  key: String,
  requests: { type: Number, default: 0 },
  maxRequests: { type: Number, default: 1000 },
});
const ApiKey = mongoose.model("ApiKey", ApiKeySchema);

// ✅ Nodemailer setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ✅ Webhook route
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  console.log("✅ Webhook endpoint hit!");

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

    if (!email) {
      console.error("❌ No email found in session");
      return res.sendStatus(400);
    }

    const apiKey = crypto.randomBytes(24).toString("hex");

    try {
      const result = await ApiKey.create({ userEmail: email, key: apiKey });
      console.log(`✅ API Key saved to DB for ${email}: ${apiKey}`);
    } catch (err) {
      console.error("❌ DB insertion error:", err);
      return res.sendStatus(500);
    }

    try {
      await transporter.sendMail({
        from: `API Service <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Your API Key",
        html: `<p>Thank you for subscribing!</p><p>Your API key is: <b>${apiKey}</b></p>`,
      });
      console.log(`📧 API Key emailed to ${email}`);
    } catch (err) {
      console.error("❌ Email sending failed:", err.message);
    }
  }

  res.sendStatus(200);
});

// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ✅ Health check route
app.get("/", (req, res) => {
  res.send("✅ Server is up and running.");
});

// ✅ Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
