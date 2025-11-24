const { UniversitySchema } = require('./schemas');

/**
 * Controller for university data extraction endpoints
 */
class UniversityController {
  constructor(geminiService) {
    this.geminiService = geminiService;
  }

  /**
   * POST /extract
   * Extracts university data using Gemini AI
   */
  extract = async (req, res) => {
    try {
      // Validate request body
      const { university } = req.body;

      if (!university || typeof university !== 'string') {
        res.status(400).json({
          error: 'Invalid request body. Expected: { "university": "string" }',
        });
        return;
      }

      // Construct prompt
      // const prompt = `Analyze ${university} and return the JSON profile.`;

      // Call Gemini Service
      const universityData = await this.geminiService.extractUniversityData(
        university
      );

      // Validate response against schema (already validated in service, but double-check)
      const validatedData = UniversitySchema.parse(universityData);

      // Return typed JSON
      res.status(200).json(validatedData);
    } catch (error) {
      console.error('Extraction error:', error);

      if (error instanceof Error) {
        // Handle Zod validation errors
        if (error.name === 'ZodError') {
          res.status(500).json({
            error: 'Data validation failed',
            details: error.message,
          });
          return;
        }

        res.status(500).json({
          error: 'Extraction failed',
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        error: 'Extraction failed',
        message: 'Unknown error occurred',
      });
    }
  };
}

module.exports = { UniversityController };

