const { CitySchema } = require('./schemas');

/**
 * Controller for city data extraction endpoints
 */
class CityController {
  constructor(cityService) {
    this.cityService = cityService;
  }

  /**
   * POST /extract-city
   * Extracts city cost-of-living and student experience data using Gemini AI
   */
  extract = async (req, res) => {
    try {
      const { city, state, country } = req.body;

      if (!city || typeof city !== 'string') {
        res.status(400).json({
          error: 'Invalid request body. Expected: { "city": "string", "state": "string" (optional), "country": "string" }',
        });
        return;
      }

      if (!country || typeof country !== 'string') {
        res.status(400).json({
          error: 'Country is required. Expected: { "city": "string", "state": "string" (optional), "country": "string" }',
        });
        return;
      }

      // Call City Service
      const cityData = await this.cityService.extractCityData(
        city,
        state || null,
        country
      );

      // Validate response against schema
      const validatedData = CitySchema.parse(cityData);

      res.status(200).json(validatedData);
    } catch (error) {
      console.error('City extraction error:', error);

      if (error instanceof Error) {
        if (error.name === 'ZodError') {
          res.status(500).json({
            error: 'Data validation failed',
            details: error.message,
          });
          return;
        }

        res.status(500).json({
          error: 'City extraction failed',
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        error: 'City extraction failed',
        message: 'Unknown error occurred',
      });
    }
  };
}

module.exports = { CityController };
