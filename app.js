import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import Tesseract from 'tesseract.js';

// ✅ Fix the worker source issue
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.0.279/pdf.worker.min.js';

dotenv.config();

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024, // Limit to 4MB
  },
});

// ✅ Fix the CORS configuration
app.use(cors({
  origin: "https://sum-flax.vercel.app", // Allow only this origin
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));

app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function parsePDF(buffer) {
  try {
    console.log('📄 Parsing PDF...');

    // Convert Buffer to Uint8Array
    const uint8Array = new Uint8Array(buffer);

    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
      nativeImageDecoderSupport: 'none',
    });

    const pdf = await loadingTask.promise;
    console.log(`✅ PDF loaded. Number of pages: ${pdf.numPages}`);

    let text = '';
    const maxPages = Math.min(pdf.numPages, 50);

    for (let i = 1; i <= maxPages; i++) {
      console.log(`🔹 Processing page ${i}/${maxPages}`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + ' ';
      await page.cleanup();
    }

    if (!text.trim()) {
      console.log('⚠️ No text extracted from PDF. Trying OCR...');
      text = await extractTextWithOCR(buffer);
    }

    console.log('✅ PDF parsing completed successfully');
    return text.trim();
  } catch (error) {
    console.error('❌ PDF Parsing Error:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

async function extractTextWithOCR(buffer) {
  try {
    console.log('🖼️ Running OCR on PDF...');
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng');
    console.log('✅ OCR extraction successful');
    return text.trim();
  } catch (error) {
    console.error('❌ OCR Extraction Error:', error);
    throw new Error('Failed to extract text using OCR');
  }
}

async function summarizeText(text) {
  try {
    console.log('📝 Summarizing text...');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

    const maxChunkLength = 30000;
    const chunks = text.match(new RegExp(`.{1,${maxChunkLength}}`, 'g')) || [];

    let fullSummary = '';
    for (const chunk of chunks) {
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: `Summarize this text in a concise manner:\n\n${chunk}` }] }]
      });

      const chunkSummary = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (chunkSummary) {
        fullSummary += chunkSummary + '\n\n';
      }
    }

    return fullSummary.trim();
  } catch (error) {
    console.error('❌ Summarization Error:', error);
    throw new Error('Summarization failed');
  }
}

app.post('/upload', upload.single('file'), async (req, res) => {
  console.log('📥 Upload request received');

  try {
    if (!req.file) {
      console.log('❌ No file provided');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('📂 File received:', {
      size: req.file.size,
      mimetype: req.file.mimetype,
    });

    if (req.file.mimetype !== 'application/pdf') {
      console.log('❌ Invalid file type:', req.file.mimetype);
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    const text = await parsePDF(req.file.buffer);
    console.log('📄 Text extracted, length:', text.length);

    const summary = await summarizeText(text);
    console.log('✅ Summary generated, length:', summary.length);

    res.json({ success: true, summary });
  } catch (error) {
    console.error('❌ Error processing file:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process file',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

app.get("/", (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    version: '1.0.0',
  });
});

export default app;
