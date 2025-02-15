import express from 'express';
import multer from 'multer';
import { getDocument } from 'pdfjs-dist';
import dotenv from 'dotenv';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();

// Configure multer with file size limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024 // 4MB limit
  }
});

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || "*", // Ideally set specific origin
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
  credentials: true
}));

app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Optimized PDF parsing function
async function parsePDF(buffer) {
  try {
    console.log('Starting PDF parsing...');
    const uint8Array = new Uint8Array(buffer);
    const pdf = await getDocument({ data: uint8Array }).promise;
    
    let text = '';
    const maxPages = Math.min(pdf.numPages, 50); // Limit number of pages
    
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ');
      
      // Free up memory
      page.cleanup();
    }
    
    console.log(`Successfully parsed ${maxPages} pages`);
    return text;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error(`PDF parsing failed: ${error.message}`);
  }
}

// Modified upload route with better error handling
app.post('/upload', upload.single('file'), async (req, res) => {
  console.log('Received upload request');
  
  try {
    // File validation
    if (!req.file) {
      console.log('No file provided');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      console.log('Invalid file type:', req.file.mimetype);
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    // Check file size
    if (req.file.size > 4 * 1024 * 1024) {
      console.log('File too large:', req.file.size);
      return res.status(400).json({ error: 'File size exceeds 4MB limit' });
    }

    console.log('Processing PDF file...');
    const text = await parsePDF(req.file.buffer);

    // Split text into chunks if too long
    const maxChunkLength = 30000; // Adjust based on Gemini's limits
    const textChunks = text.match(new RegExp(`.{1,${maxChunkLength}}`, 'g')) || [];
    
    let summary = '';
    for (const chunk of textChunks) {
      const chunkSummary = await summarizeText(chunk);
      summary += chunkSummary + '\n\n';
    }

    console.log('Successfully processed file');
    res.json({ success: true, summary });
    
  } catch (error) {
    console.error('Error in upload route:', error);
    res.status(500).json({
      success: false,
      error: 'File processing failed',
      details: error.message
    });
  }
});

// Health check endpoint
app.get("/", (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

export default app;