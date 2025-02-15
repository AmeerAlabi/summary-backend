import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"; // Correct Import
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();
const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ✅ Fix: Set workerSrc to an empty string
pdfjs.GlobalWorkerOptions.workerSrc = "";

// Multer setup
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB limit
});

// CORS setup
app.use(
  cors({
    origin: "https://sum-flax.vercel.app",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

async function parsePDF(buffer) {
  try {
    console.log("📄 Parsing PDF...");
    const uint8Array = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({ data: uint8Array });

    const pdf = await loadingTask.promise;
    console.log(`✅ PDF Loaded: ${pdf.numPages} pages`);

    let text = "";
    const maxPages = Math.min(pdf.numPages, 50);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(" ") + " ";
      await page.cleanup();
    }

    console.log(`📜 Extracted Text Length: ${text.length}`);
    return text.trim();
  } catch (error) {
    console.error("❌ PDF Parsing Error:", error);
    throw new Error("Failed to extract text from PDF");
  }
}

async function summarizeText(text) {
  try {
    console.log("📝 Summarizing text...");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const maxChunkLength = 30000;
    const chunks = text.match(new RegExp(`.{1,${maxChunkLength}}`, "g")) || [];

    let fullSummary = "";
    for (const chunk of chunks) {
      console.log(`✂️ Processing chunk (${chunk.length} chars)...`);
      const response = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: `Summarize:\n\n${chunk}` }] }],
      });

      const chunkSummary =
        response?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        "";
      fullSummary += chunkSummary + "\n\n";
    }

    console.log(`📌 Summary Length: ${fullSummary.length}`);
    return fullSummary.trim();
  } catch (error) {
    console.error("❌ Summarization Error:", error);
    throw new Error("AI summarization failed");
  }
}

app.post("/upload", upload.single("file"), async (req, res) => {
  console.log("📥 Upload request received");

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    console.log(`📂 File received: ${req.file.size} bytes`);
    const text = await parsePDF(req.file.buffer);
    const summary = await summarizeText(text);

    return res.json({ success: true, summary });
  } catch (error) {
    console.error("❌ Error processing file:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
});

app.get("/", (req, res) => {
  res.status(200).json({ status: "healthy", version: "1.0.0" });
});

export default app;
