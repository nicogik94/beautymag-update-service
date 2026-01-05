// --- BeautyMag Unified Service v2.0.0 ---
// Handles product updates, article generation, and dataset inspection.

import express from "express";
import fileUpload from "express-fileupload";
import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import { parse } from "csv-parse/sync";
import OpenAI from "openai";

const app = express();
app.use(fileUpload());
app.use(express.json());

const PAYLOAD_PATH = path.join(process.cwd(), "PRODUCTS_PAYLOAD.json");

// --- Utility: safe read JSON ---
function readJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data || "[]");
    }
  } catch (err) {
    console.warn("⚠️ Could not read JSON:", err.message);
  }
  return [];
}

// --- /health ---
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "beautymag-updater" });
});

// --- /version ---
app.get("/version", (req, res) => {
  res.json({
    version: "2.0.0",
    commit: process.env.GIT_COMMIT || "local-dev",
    deployed_at: new Date().toISOString(),
  });
});

// --- /update-products ---
app.post("/update-products", async (req, res) => {
  try {
    const key = req.headers["x-api-key"];
    if (process.env.API_KEY && key !== process.env.API_KEY)
      return res.status(403).json({ error: "Forbidden: invalid API key" });

    if (!req.files || !req.files.brief_file)
      return res.status(400).json({ error: "No file uploaded" });

    const briefFile = req.files.brief_file;
    const ext = path.extname(briefFile.name).toLowerCase();

    if (ext !== ".docx" && ext !== ".csv")
      return res
        .status(400)
        .json({ error: "Invalid file type. Only .docx or .csv allowed." });

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
      const result = await mammoth.extractRawText({ path: uploadPath });
      newRecords = [
        {
          source_file: briefFile.name,
          extracted_text: result.value.trim().slice(0, 1000),
          uploaded_at: new Date().toISOString(),
        },
      ];
    }

    const existing = readJSON(PAYLOAD_PATH);
    const merged = [...existing, ...newRecords];
    fs.writeFileSync(PAYLOAD_PATH, JSON.stringify(merged, null, 2));
    fs.unlinkSync(uploadPath);

    console.log(
      `📦 Uploaded: ${briefFile.name} (${ext}) - ${newRecords.length} records`
    );

    res.json({
      message: "✅ PRODUCTS_PAYLOAD.json updated successfully.",
      added_count: newRecords.length,
      total_count: merged.length,
      updated_payload: merged.slice(-5),
    });
  } catch (err) {
    console.error("❌ Error updating products:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- /products ---
app.get("/products", (req, res) => {
  try {
    const data = readJSON(PAYLOAD_PATH);
    res.json(data);
  } catch {
    res.status(404).json({ error: "No payload found" });
  }
});

// --- /summary ---
app.get("/summary", (req, res) => {
  try {
    const data = readJSON(PAYLOAD_PATH);
    const byCategory = {};
    data.forEach((p) => {
      const cat =
        p.categorias_normalizadas ||
        p.categorias_originales ||
        p.category ||
        "unknown";
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });
    res.json({ total: data.length, by_category: byCategory });
  } catch (err) {
    res.status(500).json({ error: "Could not summarize dataset" });
  }
});

// --- /validate-products ---
app.get("/validate-products", (req, res) => {
  try {
    const data = readJSON(PAYLOAD_PATH);
    const emptyFields = data.filter(
      (p) => !p.nombre && !p.name && !p.descripcion_resumida
    );
    const duplicates = data.filter(
      (p, i, arr) => arr.findIndex((q) => q.id === p.id) !== i
    );
    res.json({
      total: data.length,
      empty_fields: emptyFields.length,
      duplicates: duplicates.length,
    });
  } catch {
    res.status(500).json({ error: "Validation failed" });
  }
});

// --- /generate-article ---
app.post("/generate-article", async (req, res) => {
  try {
    const key = req.headers["x-api-key"];
    if (process.env.API_KEY && key !== process.env.API_KEY)
      return res.status(403).json({ error: "Forbidden: invalid API key" });

    const { topic, outline, tone = "editorial" } = req.body;
    if (!topic || !outline || !Array.isArray(outline))
      return res.status(400).json({
        error: "Missing required fields: topic and outline (array).",
      });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    let productContext = "";
    try {
      const payload = readJSON(PAYLOAD_PATH);
      const topProducts = payload
        .slice(0, 5)
        .map((p) => p.nombre || p.name)
        .join(", ");
      productContext = `Recommended BeautyMag products: ${topProducts}`;
    } catch {
      productContext = "No product data available.";
    }

    const prompt = `
You are BeautyMag’s editorial AI.
Write an SEO-optimized beauty article following the outline below.

Topic: ${topic}
Tone: ${tone}
Outline:
${outline.map((s, i) => `${i + 1}. ${s}`).join("\n")}
${productContext}

Output JSON with:
{
  "title": "...",
  "meta_description": "...",
  "article": "..."
}
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const raw = completion.choices[0].message.content.trim();
    const articleJSON = JSON.parse(raw);

    const filePath = path.join(process.cwd(), `article_${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(articleJSON, null, 2));

    console.log(`📝 Article generated: ${articleJSON.title}`);

    res.json({
      message: "✅ Article generated successfully.",
      ...articleJSON,
    });
  } catch (err) {
    console.error("❌ Error generating article:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- /status ---
app.get("/status", (req, res) => {
  const uptime = process.uptime();
  let total = 0;
  let lastModified = null;
  try {
    if (fs.existsSync(PAYLOAD_PATH)) {
      const stats = fs.statSync(PAYLOAD_PATH);
      lastModified = stats.mtime.toISOString();
      const data = JSON.parse(fs.readFileSync(PAYLOAD_PATH, "utf8"));
      total = Array.isArray(data) ? data.length : 0;
    }
  } catch (err) {
    console.warn("⚠️ Status check error:", err.message);
  }
  res.json({
    status: "ok",
    service: "beautymag-update-service",
    products_count: total,
    last_update: lastModified || "never",
    uptime_seconds: Math.round(uptime),
    version: "2.0.0",
  });
});

// --- Run server ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 BeautyMag service running on port ${PORT}`);
});
// force redeploy domingo,  4 de enero de 2026, 19:16:38 CST
// force redeploy domingo,  4 de enero de 2026, 19:21:30 CST
