import express from "express";
import fileUpload from "express-fileupload";
import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import { parse } from "csv-parse/sync";

const app = express();
app.use(fileUpload());

// Utility function to safely read existing JSON
function readJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data || "[]");
    }
    return [];
  } catch (err) {
    console.warn("⚠️ Could not read existing payload:", err.message);
    return [];
  }
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "beautymag-updater" });
});

app.post("/update-products", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
      return res.status(403).json({ error: "Forbidden: invalid API key" });
    }

    if (!req.files || !req.files.brief_file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const briefFile = req.files.brief_file;
    const ext = path.extname(briefFile.name).toLowerCase();

    if (ext !== ".docx" && ext !== ".csv") {
      return res.status(400).json({
        error: "Invalid file type. Only .docx or .csv files are allowed.",
      });
    }

    const uploadPath = path.join("/tmp", briefFile.name);
    await briefFile.mv(uploadPath);

    let newRecords = [];

    if (ext === ".csv") {
      const csvData = fs.readFileSync(uploadPath, "utf8");
      newRecords = parse(csvData, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } else {
      // DOCX handling stub
      const result = await mammoth.extractRawText({ path: uploadPath });
      newRecords = [
        {
          source_file: briefFile.name,
          extracted_text: result.value.trim().slice(0, 500),
          uploaded_at: new Date().toISOString(),
        },
      ];
    }

    const payloadPath = path.join(process.cwd(), "PRODUCTS_PAYLOAD.json");
    const existingPayload = readJSON(payloadPath);

    const mergedPayload = [...existingPayload, ...newRecords];

    fs.writeFileSync(payloadPath, JSON.stringify(mergedPayload, null, 2));

    // Clean up
    fs.unlinkSync(uploadPath);

    console.log(
      `📦 Uploaded file: ${briefFile.name} (${ext}) - ${newRecords.length} items processed`
    );
    console.log(`🧩 Total items in PRODUCTS_PAYLOAD.json: ${mergedPayload.length}`);

    res.json({
      message: "✅ PRODUCTS_PAYLOAD.json updated successfully.",
      added_count: newRecords.length,
      total_count: mergedPayload.length,
      updated_payload: mergedPayload.slice(-5), // show last few records
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
