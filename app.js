import express from 'express';
import multer from 'multer';
import { getDocument } from 'pdfjs-dist';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure this is set in .env
});

// Middleware
app.use(express.json());

// 📝 Parse PDF and extract text using pdfjs-dist
async function parsePDF(buffer) {
  try {
    const uint8Array = new Uint8Array(buffer);
    const pdf = await getDocument(uint8Array).promise;
    let text = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(' ');
    }

    console.log('Extracted text:', text.substring(0, 200)); // Log first 200 chars for debugging
    return text;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to parse PDF');
  }
}

// ✨ Summarize extracted text using OpenAI
async function summarizeText(text) {
  try {
    console.log('Sending text to OpenAI for summarization:', text.substring(0, 200)); // Debugging log
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // Use 'gpt-4' if you have access
      messages: [
        { role: 'system', content: 'You are a helpful assistant that summarizes text and provides key insights.' },
        { role: 'user', content: `Summarize the following text and provide 3 key insights:\n\n${text}` },
      ],
      max_tokens: 500, // Adjust based on your needs
    });

    console.log('OpenAI Response:', response);
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error summarizing text:', error);
    throw new Error('Failed to summarize text');
  }
}

// 🔑 Extract key points using OpenAI
async function extractKeyPoints(text) {
  try {
    console.log('Sending text to OpenAI for key points:', text.substring(0, 200));
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // Use 'gpt-4' if you have access
      messages: [
        { role: 'system', content: 'You are a helpful assistant that extracts key points from text.' },
        { role: 'user', content: `Extract key points from the following text:\n\n${text}` },
      ],
      max_tokens: 500, 
    });

    console.log('OpenAI Response:', response);
    return response.choices[0].message.content.trim().split('\n');
  } catch (error) {
    console.error('Error extracting key points:', error);
    throw new Error('Failed to extract key points');
  }
}

// 📤 Upload route (handles PDF processing)
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
    const keyPoints = await extractKeyPoints(text);

    res.json({ summary, keyPoints });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: error.message || 'Failed to process file' });
  }
});

// 🌍 Start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));