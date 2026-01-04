import express from "express";
import fileUpload from "express-fileupload";
import fs from "fs";
import mammoth from "mammoth";

const app = express();
app.use(fileUpload());

const PAYLOAD_PATH = "./PRODUCTS_PAYLOAD.json";
const BRAND_TOKENS = [
  "L’Oréal", "L'Oreal", "Elvive", "True Match", "Age Perfect", "Revitalift"
];

const loadPayload = () => {
  try { return JSON.parse(fs.readFileSync(PAYLOAD_PATH, "utf-8")); }
  catch { console.warn("⚠️ No existing payload found, creating a new one."); return []; }
};

const savePayload = (data) => {
  fs.writeFileSync(PAYLOAD_PATH, JSON.stringify(data, null, 2), "utf-8");
};

const slugify = (text) => text
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

app.post("/update-products", async (req, res) => {
  try {
    if (!req.files || !req.files.brief_file)
      return res.status(400).json({ error: "No .docx file provided." });

    const buffer = req.files.brief_file.data;
    const { value: text } = await mammoth.extractRawText({ buffer });

    const existingPayload = loadPayload();
    const regex = new RegExp(`(${BRAND_TOKENS.join("|")})[^.,\\n]+`, "gi");
    const matches = text.match(regex) || [];

    const newProducts = matches.map((name) => {
      const cleanName = name.trim();
      return {
        name: cleanName,
        url: `https://www.lorealparisusa.com/${slugify(cleanName)}`,
        sku: `AUTO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
      };
    });

    const merged = [
      ...existingPayload.filter(p =>
        !newProducts.find(n => n.name.toLowerCase() === p.name.toLowerCase())),
      ...newProducts
    ];

    savePayload(merged);
    console.log(`✅ Updated payload with ${newProducts.length} new products.`);
    res.json({
      message: "✅ PRODUCTS_PAYLOAD.json updated successfully.",
      added_count: newProducts.length,
      updated_payload: merged
    });
  } catch (err) {
    console.error("❌ Update failed:", err);
    res.status(500).json({ error: "Failed to process or update payload." });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`🚀 BeautyMag update-products service running on port ${PORT}`)
);

