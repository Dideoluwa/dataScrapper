const { GoogleGenerativeAI } = require("@google/generative-ai");
const { CitySchema } = require("./schemas");

const CITY_SYSTEM_INSTRUCTION = `You are an expert cost-of-living analyst for "AfroRank," a platform helping African students find universities abroad. Your goal is to extract **accurate, verified, student-focused** city cost-of-living data for the specified city, using data that is up-to-date as of {{CURRENT_DATE}}.

---

### TARGET CITY:

{{CITY_NAME}}, {{STATE_NAME}}, {{COUNTRY_NAME}}

---

### CORE INSTRUCTIONS:

1. **ACCURACY IS PARAMOUNT.** Every monetary value MUST come from a verifiable, publicly available source. Do NOT guess, estimate, or make up numbers.

2. **STUDENT-FOCUSED.** All costs should reflect what a typical college/university student would spend, NOT a professional or family:
   - **Rent:** Shared housing (1 bedroom in a 2-3 bedroom apartment near a university campus), NOT a luxury studio or 1-bedroom solo apartment.
   - **Food:** A student grocery budget (cooking at home mostly, occasional dining out). Use USDA moderate food plan for a single person or similar.
   - **Transportation:** Student transit passes (discounted), NOT car ownership. If the city has a public transit system, use the monthly student pass price.
   - **Utilities:** Student's SHARE of utilities in a shared apartment (divide typical 2-bedroom apartment utility bill by 2).
   - **Internet:** A standard internet plan split between roommates.
   - **Miscellaneous:** Student-level entertainment, personal care, laundry, phone plan.

3. **SOURCE EVERY VALUE.** For every monetary field, you MUST provide the source URL in the sources array. Acceptable sources:

   | Data Point | Acceptable Sources |
   |---|---|
   | Rent | Zillow Rent Index (zillow.com), Apartments.com, Rent.com, university off-campus housing pages, HUD Fair Market Rents (huduser.gov) |
   | Food | USDA food cost reports (fns.usda.gov), Numbeo (numbeo.com), local grocery cost indexes |
   | Transportation | Local transit authority websites (e.g., mbta.com, mta.info, ttc.ca), Numbeo transport index |
   | Utilities | EIA (eia.gov), local utility company rate pages, Numbeo |
   | Internet | ISP pricing pages, BroadbandNow (broadbandnow.com), Numbeo |
   | Number of universities | NCES (nces.ed.gov), state education boards, Wikipedia city education sections |
   | Part-time job pay | BLS (bls.gov), state minimum wage data, Indeed, Glassdoor |
   | Student happiness | Niche.com city grades, BestPlaces (bestplaces.net), student review aggregates |

4. **RETURN NULL if you cannot find a verifiable source.** Do NOT make up data. If a field cannot be sourced, return null for nullable fields.

5. **CURRENCY:** Use the local currency for the country:
   - USA → USD
   - Canada → CAD
   - United Kingdom → GBP
   All monetary values should be in one consistent currency.

6. **CITY IMAGE:** Find a high-quality REAL PHOTOGRAPH of the cityscape showing many buildings (skylines, urban landscapes).
   - **PRIORITY:** Official city/tourism websites, travel sites
   - **FORBIDDEN:** Wikimedia Commons (upload.wikimedia.org), FineArtAmerica
   - Must be publicly accessible URL

8. **CITY RATING:** Rate the city 1-5 based on: livability, safety, cost of living, cultural opportunities, student-friendliness. Use Niche.com grades, BestPlaces scores, and livability indexes as reference. Provide ONLY the number.

9. **CLIMATE:** Classify as exactly one of: "warm", "moderate", "cold" based on geographic location.

10. **REGIONAL CONTEXT:** Identify the top 3 most expensive and top 3 most affordable cities for students in the exact same state/province (or country if it's a small country without states). Return JUST the city names as an array of strings.

11. **CONSISTENCY CHECK:** The average_monthly_cost_of_living MUST equal the sum of: average_rent + average_food_cost + transportation + utilities + internet_and_subscriptions + miscellaneous.

---

### CHAIN OF THOUGHT (Internal Processing):

**Step 1 - Rent Research:**
- Search for average rent in {{CITY_NAME}} near university areas
- Look for shared housing / 1-bedroom in shared apartment prices
- Divide by number of roommates if source gives full apartment price
- Record the source URL

**Step 2 - Food Cost Research:**
- Search USDA moderate food plan costs or Numbeo grocery prices
- Adjust for student budget (moderate plan, not liberal)
- Record the source URL

**Step 3 - Transportation Research:**
- Search for student monthly transit pass in {{CITY_NAME}}
- Check transit authority website for student discounts
- Record the source URL

**Step 4 - Utilities Research:**
- Search average utility costs for apartments in {{CITY_NAME}}
- Divide by 2 (for shared housing)
- Record the source URL

**Step 5 - Internet Research:**
- Search average internet plan costs in {{CITY_NAME}}
- Divide by number of roommates
- Record the source URL

**Step 6 - Miscellaneous:**
- Estimate student-level: entertainment, personal care, laundry, phone
- Use BLS Consumer Expenditure or Numbeo as reference
- Record the source URL

**Step 7 - Sum Verification:**
- Add all 6 components
- Set average_monthly_cost_of_living to this sum

**Step 8 - University Count:**
- Search NCES or education listings for universities in {{CITY_NAME}} metro area
- Count accredited institutions

**Step 9 - Student Experience:**
- Search for average part-time hourly pay (BLS, state minimum wage)
- Search for student satisfaction scores (Niche.com)

**Step 10 - City Image & Rating:**
- Find cityscape image from official tourism site
- Rate city 1-5 based on livability data

---

### REQUIRED OUTPUT STRUCTURE:

You must return a JSON object that matches this exact schema:

{{JSON_SCHEMA}}

---

### FINAL REMINDER:

- Output ONLY valid JSON.
- Every monetary value must be verifiable.
- All costs are MONTHLY and STUDENT-FOCUSED.
- average_monthly_cost_of_living MUST = sum of all 6 cost components.

---

BEGIN EXTRACTION NOW.`;


class CityService {
  constructor(apiKey, imageSearchService = null) {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required");
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.imageSearchService = imageSearchService;
  }

  /**
   * Validate if a URL is a direct image URL
   */
  async validateImageUrl(url) {
    if (!url || typeof url !== 'string') return false;

    const lowerUrl = url.toLowerCase();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];
    const hasImageExtension = imageExtensions.some(ext => lowerUrl.includes(ext));

    if (hasImageExtension) {
      if (lowerUrl.endsWith('.svg')) return false;
      return true;
    }

    try {
      const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      const contentType = response.headers.get('content-type') || '';
      if (contentType.startsWith('image/')) return true;
      if (contentType.includes('text/html') || contentType.includes('application/')) {
        console.log(`   ⚠️  URL is a page, not an image: ${url}`);
        return false;
      }
    } catch (error) {
      console.log(`   ⚠️  Could not validate image URL (${error.message}): ${url}`);
      return false;
    }

    return false;
  }

  /**
   * Extract city data using Gemini AI with Google Search Grounding
   * @param {string} city - City name
   * @param {string} state - State/province (can be null)
   * @param {string} country - Country name
   * @returns {Promise<Object>} Validated city data
   */
  async extractCityData(city, state, country) {
    try {
      const jsonSchema = {
        type: "object",
        properties: {
          city: { type: "string", description: "City name" },
          state: { type: "string", nullable: true, description: "State or province" },
          country: { type: "string", description: "Country name" },

          city_image: {
            type: "string",
            description: "URL to a high-quality REAL cityscape photograph. FORBIDDEN: Wikimedia Commons, FineArtAmerica. REQUIRED.",
          },
          city_rating: {
            type: "string",
            description: "City rating 1-5, just the number. Based on livability, safety, cost, student-friendliness.",
          },
          climate: {
            type: "string",
            enum: ["warm", "moderate", "cold"],
            nullable: true,
            description: "Climate classification: warm, moderate, or cold.",
          },

          average_monthly_cost_of_living: {
            type: "integer",
            description: "Total monthly cost = sum of rent + food + transport + utilities + internet + miscellaneous.",
          },
          average_rent: {
            type: "integer",
            description: "Monthly rent for student shared housing (1 bed in shared apartment near campus).",
          },
          average_food_cost: {
            type: "integer",
            description: "Monthly food cost for a student (groceries + occasional dining).",
          },
          transportation: {
            type: "integer",
            description: "Monthly transportation cost (student transit pass).",
          },
          utilities: {
            type: "integer",
            description: "Monthly utilities (student share in shared apartment).",
          },
          internet_and_subscriptions: {
            type: "integer",
            description: "Monthly internet cost (split between roommates).",
          },
          miscellaneous: {
            type: "integer",
            description: "Monthly miscellaneous (entertainment, personal care, laundry, phone).",
          },
          currency: {
            type: "string",
            description: "Currency code: USD, CAD, or GBP.",
          },

          average_part_time_job_pay: {
            type: "number",
            nullable: true,
            description: "Average hourly pay for student part-time jobs in local currency.",
          },
          student_happiness_score: {
            type: "number",
            nullable: true,
            description: "Student happiness percentage 0-100.",
          },
          top_3_most_expensive_cities_in_region: {
            type: "array",
            items: { type: "string" },
            description: "Top 3 most expensive cities for students in the same state/region. Just city names.",
          },
          top_3_most_affordable_cities_in_region: {
            type: "array",
            items: { type: "string" },
            description: "Top 3 most affordable cities for students in the same state/region. Just city names.",
          },
          number_of_universities: {
            type: "integer",
            description: "Number of accredited universities in the city/metro area.",
          },

          sources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string", description: "Data field name" },
                source_name: { type: "string", description: "Source name" },
                source_url: { type: "string", description: "Publicly accessible URL" },
              },
              required: ["field", "source_name", "source_url"],
            },
            description: "Sources for every monetary field. REQUIRED.",
          },

          data_notes: {
            type: "string",
            description: "Chain of thought verification summary.",
          },
        },
        required: [
          "city", "country",
          "city_image", "city_rating",
          "average_monthly_cost_of_living",
          "average_rent", "average_food_cost", "transportation",
          "utilities", "internet_and_subscriptions", "miscellaneous",
          "currency", "number_of_universities",
          "sources", "data_notes",
        ],
      };

      // Get current date
      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      // Build prompt placeholders
      const stateDisplay = state || 'N/A';
      const systemInstruction = CITY_SYSTEM_INSTRUCTION
        .replace(/{{CITY_NAME}}/g, city)
        .replace(/{{STATE_NAME}}/g, stateDisplay)
        .replace(/{{COUNTRY_NAME}}/g, country)
        .replace(/{{CURRENT_DATE}}/g, currentDate)
        .replace("{{JSON_SCHEMA}}", JSON.stringify(jsonSchema, null, 2));

      // Initialize model with Google Search grounding
      const model = this.genAI.getGenerativeModel({
        model: "gemini-3-pro-preview",
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }],
        generationConfig: {
          responseSchema: jsonSchema,
          responseMimeType: "application/json",
        },
      });

      const prompt = `Extract comprehensive city cost-of-living data for ${city}, ${stateDisplay}, ${country}. Use Google Search to find the most recent and accurate student-focused data from verifiable public sources.`;

      console.log("\n=== CITY DATA EXTRACTION ===");
      console.log("City:", city);
      console.log("State:", stateDisplay);
      console.log("Country:", country);
      console.log("============================\n");

      const result = await model.generateContent(prompt);
      const response = result.response;

      // Log response details
      console.log("\n=== GEMINI RESPONSE ===");
      console.log("Response Text:", response.text());

      // Log grounding metadata
      if (result.response.candidates && result.response.candidates.length > 0) {
        const candidate = result.response.candidates[0];
        if (candidate.groundingMetadata && candidate.groundingMetadata.groundingChunks) {
          console.log("\n=== SEARCH RESULTS USED ===");
          candidate.groundingMetadata.groundingChunks.forEach((chunk, i) => {
            if (chunk.web) {
              console.log(`  ${i + 1}. ${chunk.web.title} — ${chunk.web.uri}`);
            }
          });
        }
      }

      // Log usage metadata
      if (result.response.usageMetadata) {
        console.log("\n=== USAGE METADATA ===");
        console.log(JSON.stringify(result.response.usageMetadata, null, 2));
      }

      // Parse JSON response
      let jsonText = response.text();
      if (jsonText.includes("```json")) {
        jsonText = jsonText.split("```json")[1].split("```")[0].trim();
      } else if (jsonText.includes("```")) {
        jsonText = jsonText.split("```")[1].split("```")[0].trim();
      }

      const parsedData = JSON.parse(jsonText);

      // Validate against Zod schema
      const validatedData = CitySchema.parse(parsedData);

      console.log("\n=== VALIDATED CITY DATA ===");
      console.log(JSON.stringify(validatedData, null, 2));
      console.log("===========================\n");

      // Post-process: verify sum consistency
      this._postProcess(validatedData);

      // Handle city image via Google CSE if available
      if (this.imageSearchService) {
        console.log('\n=== FETCHING CITY IMAGE VIA GOOGLE CSE ===');
        const cityImage = await this.imageSearchService.searchCityImage(city, country);
        if (cityImage) {
          validatedData.city_image = cityImage;
          console.log('✅ Using Google CSE city image');
          console.log(`   📍 City image URL: ${cityImage}`);
        } else {
          console.log('⚠️  Google CSE found no city image — keeping Gemini result');
        }
      } else {
        // Validate Gemini's URL
        if (validatedData.city_image) {
          const isValid = await this.validateImageUrl(validatedData.city_image);
          if (!isValid) {
            console.log('⚠️  Gemini city image URL is not a direct image — setting to empty string');
            validatedData.city_image = '';
          }
        }
      }

      return validatedData;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`City data extraction failed: ${error.message}`);
      }
      throw new Error("City data extraction failed: Unknown error");
    }
  }

  /**
   * Post-process: validate sum consistency and clamp values
   */
  _postProcess(data) {
    // Recalculate sum to ensure consistency
    const expectedSum =
      (data.average_rent || 0) +
      (data.average_food_cost || 0) +
      (data.transportation || 0) +
      (data.utilities || 0) +
      (data.internet_and_subscriptions || 0) +
      (data.miscellaneous || 0);

    if (data.average_monthly_cost_of_living !== expectedSum) {
      console.log(`⚠️  Sum mismatch: reported ${data.average_monthly_cost_of_living}, calculated ${expectedSum}. Correcting.`);
      data.average_monthly_cost_of_living = expectedSum;
    }

    // Clamp student_happiness_score to 0-100
    if (data.student_happiness_score != null) {
      data.student_happiness_score = Math.max(0, Math.min(100, data.student_happiness_score));
    }

    // Ensure city_rating is a valid number string 1-5
    if (data.city_rating) {
      const rating = parseInt(data.city_rating, 10);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        data.city_rating = "3"; // default to 3 if invalid
      } else {
        data.city_rating = String(rating);
      }
    }

    // Validate climate enum
    if (data.climate && !['warm', 'moderate', 'cold'].includes(data.climate)) {
      data.climate = null;
    }

    console.log("\n=== POST-PROCESSED CITY DATA ===");
    console.log("average_monthly_cost_of_living:", data.average_monthly_cost_of_living);
    console.log("  = rent:", data.average_rent);
    console.log("  + food:", data.average_food_cost);
    console.log("  + transport:", data.transportation);
    console.log("  + utilities:", data.utilities);
    console.log("  + internet:", data.internet_and_subscriptions);
    console.log("  + misc:", data.miscellaneous);
    console.log("city_rating:", data.city_rating);
    console.log("climate:", data.climate);
    console.log("part_time_pay:", data.average_part_time_job_pay);
    console.log("happiness_score:", data.student_happiness_score);

    console.log("universities:", data.number_of_universities);
    console.log("sources:", data.sources?.length || 0, "sources cited");
    console.log("=================================\n");
  }
}

module.exports = { CityService };
