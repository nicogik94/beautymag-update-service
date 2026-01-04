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
    const ext = path.extname(briefFile.name).toLowerCase();

    if (ext !== ".docx" && ext !== ".csv") {
      return res.status(400).json({ error: "Invalid file type. Only .docx or .csv are allowed." });
    }

    const uploadPath = path.join("/tmp", briefFile.name);
    await briefFile.mv(uploadPath);

    let newPayload = [];

    if (ext === ".csv") {
      // parse CSV
      const csvData = fs.readFileSync(uploadPath, "utf8");
      const rows = csvData.split("\n").filter(Boolean);
      const headers = rows.shift().split(",");
      newPayload = rows.map((row) => {
        const values = row.split(",");
        const entry = {};
        headers.forEach((h, i) => (entry[h.trim()] = values[i]?.trim() || ""));
        return entry;
      });
    } else {
      // DOCX handling stub
      newPayload = [
        {
          name: briefFile.name,
          uploaded_at: new Date().toISOString(),
        },
      ];
    }

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
