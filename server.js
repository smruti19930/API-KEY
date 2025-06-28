const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ✅ Protected endpoint for RapidAPI users
app.get("/protected", (req, res) => {
  const apiKey = req.headers["x-rapidapi-key"];
  if (!apiKey) {
    return res.status(401).json({ error: "Missing X-RapidAPI-Key header" });
  }

  // No manual validation – RapidAPI does it
  res.json({
    message: "✅ Success! You accessed the protected endpoint via RapidAPI.",
    yourKey: apiKey
  });
});

// ✅ Optional: Home route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
