import express from 'express';
import multer from 'multer';
import * as pdfjsLib from 'pdfjs-dist';
import dotenv from 'dotenv';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

// Configure PDF.js for serverless environment
const pdfjsDistPath = 'pdfjs-dist/build/pdf.worker.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsDistPath;

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024
  }
});

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));

app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Modified PDF parsing function for serverless environment
async function parsePDF(buffer) {
  try {
    console.log('Starting PDF parsing...');
    
    // Configure PDF.js to use built-in worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = false;
    
    const loadingTask = pdfjsLib.getDocument({
      data: buffer,
      verbosity: 0,
      useSystemFonts: true,
      disableFontFace: true,
      useWorkerFetch: false
    });
    
    const pdf = await loadingTask.promise;
    let text = '';
    
    // Limit number of pages to process
    const maxPages = Math.min(pdf.numPages, 50);
    
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ');
      await page.cleanup();
    }
    
    console.log('PDF parsing successful');
    return text;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error(`PDF parsing failed: ${error.message}`);
  }
}

async function summarizeText(text) {
  try {
    console.log('Starting text summarization...');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Summarize this text in 2000 words:\n\n${text}` }] }]
    });
    
    const summary = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!summary) {
      throw new Error('No summary generated');
    }
    
    return summary;
  } catch (error) {
    console.error('Summarization error:', error);
    throw new Error(`Summarization failed: ${error.message}`);
  }
}

app.post('/upload', upload.single('file'), async (req, res) => {
  console.log('Upload request received');
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    const text = await parsePDF(req.file.buffer);
    const summary = await summarizeText(text);
    
    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process file'
    });
  }
});

app.get("/", (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

export default app;