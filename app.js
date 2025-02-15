import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import dotenv from "dotenv";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Fix CORS for Vercel
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

// ✅ Replace `pdfjs-dist` with `pdf-parse`
async function parsePDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    console.log("✅ Extracted text:", data.text.substring(0, 200)); // Debugging log
    return data.text;
  } catch (error) {
    console.error("❌ Error parsing PDF:", error);
    throw new Error("Failed to parse PDF");
  }
}

// 📌 Summarize Extracted Text
async function summarizeText(text) {
  try {
    console.log("🔹 Sending text to Gemini for summarization:", text.substring(0, 200));

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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
  } catch (error) {
    console.error("❌ Error in summarization:", error);
    throw new Error("Failed to summarize text");
  }
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
export default app;
