import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDocument } from 'pdfjs-dist';

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({ 
  origin: process.env.ALLOWED_ORIGIN || "*",
  methods: "GET,POST",
  allowedHeaders: "Content-Type",
}));

app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function parsePDF(buffer) {
  try {
    const uint8Array = new Uint8Array(buffer);
    const pdf = await getDocument({ 
      data: uint8Array, 
      useSystemFonts: true,
      disableFontFace: true,
      useWorkerFetch: false 
    }).promise;
    
    let text = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(' ') + '\n\n';
    }

    text = text.replace(/\s+/g, ' ').trim();
    
    console.log('✅ Extracted text:', text.substring(0, 200));
    return text;
  } catch (error) {
    console.error('❌ Error parsing PDF:', error);
    throw new Error('Failed to parse PDF');
  }
}

// Improved exponential backoff for handling Too Many Requests (429)
async function retryWithBackoff(fn, retries = 5, delayMs = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      console.error(`⚠️ Attempt ${i + 1} failed:`, error.message);
      
      if (error.message.includes("429 Too Many Requests")) {
        const waitTime = delayMs * (i + 1);
        console.warn(`⏳ Rate limited. Retrying in ${waitTime / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        throw error; // Stop retrying for non-429 errors
      }
    }
  }
}

async function summarizeText(text) {
  return retryWithBackoff(async () => {
    console.log('🔹 Sending text to Gemini for summarization:', text.substring(0, 200));

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Summarize this text in 2000 words:\n\n${text}` }] }]
    });

    console.log('🛠 Full API Response:', JSON.stringify(response, null, 2));

    const summary = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!summary) {
      throw new Error('Invalid response format: No summary found');
    }

    console.log('✅ Gemini Summary:', summary);
    return summary;
  });
}

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Invalid file type. Only PDF files are allowed.' });
    }

    const buffer = req.file.buffer;
    const text = await parsePDF(buffer);
    const summary = await summarizeText(text);

    res.json({ success: true, summary });
  } catch (error) {
    console.error('❌ Error processing file:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to process file' });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Internal Server Error');
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
