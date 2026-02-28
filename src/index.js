const express = require('express');
const dotenv = require('dotenv');
const { GeminiService } = require('./geminiService');
const { CityService } = require('./cityService');
const { ImageSearchService } = require('./imageSearchService');
const { UniversityController } = require('./universityController');
const { CityController } = require('./cityController');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3500;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'AfroRank Data Extractor' });
});

// Validate environment variables
const geminiApiKey = process.env.GEMINI_API_KEY;
const googleCseApiKey = process.env.GOOGLE_CSE_API_KEY;
const googleCseId = process.env.GOOGLE_CSE_ID;

if (!geminiApiKey) {
  console.error('ERROR: GEMINI_API_KEY is not set in environment variables');
  process.exit(1);
}

// Initialize services
const imageSearchService = (googleCseApiKey && googleCseId)
  ? new ImageSearchService(googleCseApiKey, googleCseId)
  : null;

if (!imageSearchService) {
  console.warn('⚠️  WARNING: Google Custom Search API not configured. Images will come from Gemini only.');
  console.warn('   Set GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID in .env to enable image search.');
}

const geminiService = new GeminiService(geminiApiKey, imageSearchService);
const cityService = new CityService(geminiApiKey, imageSearchService);
const universityController = new UniversityController(geminiService);
const cityController = new CityController(cityService);

// University extraction endpoint
app.post('/extract', universityController.extract);

// City data extraction endpoint
app.post('/extract-city', cityController.extract);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(` AfroRank Data Extractor API running on port ${PORT}`);
  console.log(` Health check: http://localhost:${PORT}/health`);
  console.log(` Extract university: POST http://localhost:${PORT}/extract`);
  console.log(` Extract city: POST http://localhost:${PORT}/extract-city`);
  if (imageSearchService) {
    console.log(' ✅ Google Custom Search API: ENABLED');
  }
});

