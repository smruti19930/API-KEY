require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err));

// Mongoose schema
const UserSchema = new mongoose.Schema({
  email: String,
  apiKey: String,
  usageCount: { type: Number, default: 0 },
  quota: { type: Number, default: 1000 },
});
const User = mongoose.model('User', UserSchema);

// Rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// Generate API key
function generateApiKey() {
  return 'sk-' + Math.random().toString(36).substring(2, 18);
}

// Send email with API key
async function sendApiKeyByEmail(email, apiKey) {
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"API Key Service" <${process.env.MAIL_USER}>`,
    to: email,
    subject: "Your API Key",
    text: `Thank you for subscribing. Here is your API key: ${apiKey}`,
  });
}

// Stripe webhook for successful payments
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_email;
    const apiKey = generateApiKey();

    const user = new User({ email, apiKey });
    await user.save();

    await sendApiKeyByEmail(email, apiKey);
    console.log(`✅ API key sent to ${email}`);
  }

  res.status(200).json({ received: true });
});

// Example endpoint (protected)
app.post('/use-api', async (req, res) => {
  const { apiKey } = req.body;

  const user = await User.findOne({ apiKey });
  if (!user) return res.status(403).json({ error: 'Invalid API key' });

  if (user.usageCount >= user.quota) {
    return res.status(429).json({ error: 'API quota exceeded' });
  }

  user.usageCount++;
  await user.save();

  // Replace this with your real API logic
  res.json({ success: true, data: "Your result goes here" });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
