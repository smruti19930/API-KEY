const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// API Key Schema
const apiKeySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const ApiKey = mongoose.model("ApiKey", apiKeySchema);

// Root route
app.get("/", (req, res) => {
  res.send("✅ API is running...");
});

// Generate API Key route
app.post("/generate-key", async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  const apiKey = crypto.randomBytes(32).toString("hex");

  try {
    const newKey = new ApiKey({ key: apiKey, userId });
    await newKey.save();
    res.json({ apiKey });
  } catch (err) {
    console.error("❌ Error generating key:", err);
    res.status(500).json({ error: "Failed to generate API key" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
