import express from "express";
import multer from "multer";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import dotenv from "dotenv";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from "path";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Fix CORS Issue
const allowedOrigins = ["https://sum-flax.vercel.app", "http://localhost:5173"];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));

app.use(express.json());

// ✅ Fix pdfjs-dist Worker Issue
GlobalWorkerOptions.workerSrc = null;

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 📌 Parse PDF and Extract Text
async function parsePDF(buffer) {
  try {
    const uint8Array = new Uint8Array(buffer);
    const pdf = await getDocument({ data: uint8Array }).promise;  // ✅ Fixed this

    let text = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(" ");
    }

    console.log("✅ Extracted text:", text.substring(0, 200)); // Debugging log
    return text;
  } catch (error) {
    console.error("❌ Error parsing PDF:", error);
    throw new Error("Failed to parse PDF");
  }
}

// 📌 Helper function for exponential backoff retries
async function retryWithBackoff(fn, retries = 3, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      console.error(`⚠️ Attempt ${i + 1} failed:`, error.message);
      if (i === retries - 1) throw new Error("Exceeded retry attempts");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs *= 2; // Exponential backoff
    }
  }
}

// ✨ Summarize Extracted Text
async function summarizeText(text) {
  return retryWithBackoff(async () => {
    console.log("🔹 Sending text to Gemini for summarization:", text.substring(0, 200));

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: `Summarize this:\n\n${text}` }] }]
    });

    console.log("🛠 Full API Response:", JSON.stringify(response, null, 2));

    const summary = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!summary) {
      throw new Error("Invalid response format: No summary found");
    }

    console.log("✅ Gemini Summary:", summary);
    return summary;
  });
}

// 📤 Upload Route (Handles PDF Processing)
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "Invalid file type. Only PDF files are allowed." });
    }

    const buffer = req.file.buffer;
    const text = await parsePDF(buffer);
    const summary = await summarizeText(text);

    res.json({ success: true, summary });
  } catch (error) {
    console.error("❌ Error processing file:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to process file" });
  }
});

// 🌍 Start the Server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
