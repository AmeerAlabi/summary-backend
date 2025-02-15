import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import rateLimit from "express-rate-limit";
import { PdfReader } from "pdfreader";
import { createWorker } from "tesseract.js";

dotenv.config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB file size limit
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

// CORS configuration
app.use(cors({ origin: "https://sum-flax.vercel.app", methods: "GET,POST", allowedHeaders: "Content-Type" }));
app.use(express.json());

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Extracts text from an image using OCR (Tesseract.js).
 * @param {Buffer} buffer - The image buffer.
 * @returns {Promise<string>} - Extracted text.
 */
async function extractTextFromImage(buffer) {
  try {
    const worker = await createWorker();
    await worker.loadLanguage("eng");
    await worker.initialize("eng");
    const { data: { text } } = await worker.recognize(buffer);
    await worker.terminate();
    return text.trim();
  } catch (error) {
    console.error("❌ OCR Error:", error);
    throw new Error("Failed to extract text using OCR");
  }
}

/**
 * Parses a PDF buffer and extracts text using pdfreader.
 * Falls back to OCR if text extraction fails.
 * @param {Buffer} buffer - The PDF file buffer.
 * @returns {Promise<string>} - Extracted text from the PDF.
 */
async function parsePDF(buffer) {
  return new Promise((resolve, reject) => {
    const reader = new PdfReader();
    let text = "";

    reader.parseBuffer(buffer, (err, item) => {
      if (err) {
        console.error("❌ PDF Parsing Error:", err);
        reject(new Error("Failed to parse PDF"));
      } else if (!item) {
        // End of file
        if (!text || text.length < 10) {
          console.log("🔍 No text found with pdfreader, trying OCR...");
          extractTextFromImage(buffer)
            .then((ocrText) => {
              if (!ocrText || ocrText.length < 10) {
                reject(new Error("Extracted text is empty or too short"));
              } else {
                resolve(ocrText);
              }
            })
            .catch((ocrError) => {
              reject(ocrError);
            });
        } else {
          resolve(text);
        }
      } else if (item.text) {
        text += item.text + " ";
      }
    });
  });
}

/**
 * Summarizes text using Google's Gemini API.
 * @param {string} text - The text to summarize.
 * @returns {Promise<string>} - The summarized text.
 */
async function summarizeText(text) {
  try {
    console.log("🔹 Sending text to Gemini...");

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: `Summarize this text in 500 words:\n\n${text}` }] }],
    });

    const summary = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!summary) {
      throw new Error("Invalid Gemini response: No summary found");
    }

    console.log("✅ Gemini Summary (First 500 chars):", summary.substring(0, 500));
    return summary;
  } catch (error) {
    console.error("❌ Error in summarization:", error);
    throw new Error("Failed to summarize text");
  }
}

/**
 * POST endpoint to handle file uploads.
 */
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ success: false, error: "Only PDF files allowed" });
    }

    const buffer = req.file.buffer;
    const text = await parsePDF(buffer);

    console.log("📄 Final Extracted Text:", text.substring(0, 500));

    const summary = await summarizeText(text);
    res.json({ success: true, summary });
  } catch (error) {
    console.error("❌ Error processing file:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to process file" });
  }
});

// Start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));