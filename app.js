import express from "express";
import multer from "multer";
import PDFParser from "pdf2json";
import dotenv from "dotenv";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({ origin: "https://sum-flax.vercel.app", methods: "GET,POST", allowedHeaders: "Content-Type" }));
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function parsePDF(buffer) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataError", (err) => {
      console.error("❌ PDF Parsing Error:", err);
      reject(new Error("Failed to parse PDF"));
    });

    pdfParser.on("pdfParser_dataReady", () => {
      let extractedText = pdfParser.getRawTextContent().trim();
      
      console.log("✅ Extracted Text (First 500 chars):", extractedText.substring(0, 500));

      if (!extractedText || extractedText.length < 10) {
        reject(new Error("Extracted text is empty or too short"));
      } else {
        resolve(extractedText);
      }
    });

    pdfParser.parseBuffer(buffer);
  });
}

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

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (req.file.mimetype !== "application/pdf") return res.status(400).json({ error: "Only PDF files allowed" });

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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
