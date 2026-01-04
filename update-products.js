// update-products.js
import express from "express";
import fileUpload from "express-fileupload";
import fs from "fs";
import path from "path";

const app = express();
app.use(fileUpload());

// simple root for quick checks
app.get("/", (req, res) => {
  res.send("✨ BeautyMag Updater service is running.");
});

// health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "beautymag-updater" });
});

// main endpoint
app.post("/update-products", async (req, res) => {
  try {
    const key = req.headers["x-api-key"];
    if (process.env.API_KEY && key !== process.env.API_KEY) {
      return res.status(403).json({ error: "Forbidden: invalid API key" });
    }

    if (!req.files || !req.files.brief_file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const briefFile = req.files.brief_file;
    const uploadPath = path.join("/tmp", briefFile.name);
    await briefFile.mv(uploadPath);

    // --- Replace this block with real parsing logic if desired ---
    const newPayload = [
      {
        name: briefFile.name,
        uploaded_at: new Date().toISOString(),
      },
    ];
    // --------------------------------------------------------------

    const payloadPath = path.join(process.cwd(), "PRODUCTS_PAYLOAD.json");
    fs.writeFileSync(payloadPath, JSON.stringify(newPayload, null, 2));

    res.json({
      message: "✅ PRODUCTS_PAYLOAD.json updated successfully.",
      added_count: newPayload.length,
      updated_payload: newPayload,
    });
  } catch (err) {
    console.error("❌ Error updating products:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 BeautyMag update-products service running on port ${PORT}`);
});
