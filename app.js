import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";
import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();
const app = express();

// Set up the PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB limit
});

// ✅ Fix CORS: Allow only the frontend domain
app.use(
  cors({
    origin: "https://sum-flax.vercel.app",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * 📄 Function to Extract Text from PDF
 */
async function parsePDF(buffer) {
  try {
    console.log("📄 Parsing PDF...");
    console.log(`Buffer length: ${buffer.length} bytes`);
    
    if (!buffer || buffer.length === 0) {
      throw new Error("Empty buffer received");
    }

    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }

    console.log(`✅ PDF Extracted Text Length: ${text.length}`);
    return text.trim();
  } catch (error) {
    console.error("❌ PDF Parsing Error:", error);
    throw new Error("Failed to extract text from PDF");
  }
}

/**
 * ✍️ Function to Summarize Extracted Text using Gemini AI
 */
async function summarizeText(text) {
  try {
    console.log("✨ Summarizing text...");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    // ✅ Split text into chunks (Max: 30,000 chars per API request)
    const maxChunkLength = 30000;
    const chunks = text.match(new RegExp(`.{1,${maxChunkLength}}`, "g")) || [];

    let fullSummary = "";
    for (const chunk of chunks) {
      const response = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: `Summarize this text concisely:\n\n${chunk}` }] }],
      });

      const chunkSummary = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (chunkSummary) {
        fullSummary += chunkSummary + "\n\n";
      }
    }

    return fullSummary.trim();
  } catch (error) {
    console.error("❌ Summarization Error:", error);
    throw new Error("Summarization failed");
  }
}

/**
 * 🚀 Upload & Process PDF Route
 */
app.post("/upload", upload.single("file"), async (req, res) => {
  console.log("📥 Upload request received");

  try {
    if (!req.file) {
      console.log("❌ No file provided");
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log("📂 File received:", {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      encoding: req.file.encoding,
      mimetype: req.file.mimetype,
      size: req.file.size,
      buffer: req.file.buffer ? `${req.file.buffer.length} bytes` : 'No buffer'
    });

    if (req.file.mimetype !== "application/pdf") {
      console.log("❌ Invalid file type:", req.file.mimetype);
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    // ✅ Extract text from PDF
    const text = await parsePDF(req.file.buffer);
    console.log("📄 Text extracted, length:", text.length);

    // ✅ Summarize the text
    const summary = await summarizeText(text);
    console.log("✅ Summary generated, length:", summary.length);

    res.json({ success: true, summary });
  } catch (error) {
    console.error("❌ Error processing file:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to process file",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

/**
 * 🔄 Health Check Route
 */
app.get("/", (req, res) => {
  res.status(200).json({
    status: "healthy",
    version: "1.0.0",
  });
});

// ✅ Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// ✅ Export Express App for Deployment
export default app;