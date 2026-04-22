const { GoogleGenerativeAI } = require("@google/generative-ai");
const { CitySchema } = require("./schemas");
const {
  GEMINI_GENERATE_TIMEOUT_MS,
  ExtractionTimeoutError,
  withTimeout,
  isRetryableExtractionError,
} = require("./extractionErrors");

const CITY_SYSTEM_INSTRUCTION = `You are an expert cost-of-living analyst for "AfroRank," a platform helping African students find universities abroad. Your goal is to extract **accurate, verified, student-realistic** city cost-of-living data for the specified city, using data that is up-to-date as of {{CURRENT_DATE}}.

⚠️ CRITICAL AUDIENCE NOTE: This data will be shown directly to students choosing where to study. Every single cost figure MUST reflect what a real, budget-conscious university student actually pays — NOT a working professional, NOT a family, NOT an average adult. If you return costs that are too high (i.e., based on general adult spending), the data will mislead students. Use only student-specific prices, student discounts, and student-appropriate living arrangements for every field.

---

### TARGET CITY:

{{CITY_NAME}}, {{STATE_NAME}}, {{COUNTRY_NAME}}

---

### CORE INSTRUCTIONS:

1. **ACCURACY IS PARAMOUNT.** Every monetary value MUST come from a verifiable, publicly available source. Do NOT guess, estimate, or make up numbers.

2. **ALL COSTS ARE STUDENT COSTS.** Every monetary figure must be what a real student would actually pay — not a professional or average adult. Apply the following student-specific rules to EVERY cost field:

   - **Rent:** Shared housing only — 1 bedroom in a shared 2–3 bedroom apartment near a university campus. NOT a solo studio, NOT a luxury apartment, NOT a 1BR alone. Search for "student housing near [city] university", "off-campus student rooms for rent", and check the university's off-campus housing board. Divide full apartment rent by number of roommates if needed.
     - Realistic student range: $400–$900/mo for most cities; up to $1,200 in expensive markets.

   - **Food:** A student grocery budget — primarily cooking at home with occasional cheap takeout. Use the USDA **Thrifty Food Plan** (the lowest-cost tier, not the moderate or liberal plan) for one adult. Students do NOT spend on restaurants regularly.
     - Realistic student range: $200–$320/mo. Do NOT use general adult food cost figures.

   - **Transportation:** Student transit pass ONLY — use the exact discounted monthly student pass price from the local transit authority. Do NOT use adult/standard passes. Do NOT include car ownership, taxis, or rideshare. Most transit authorities (MTA, TTC, MBTA, etc.) offer discounted student passes — find and use that specific price.
     - Realistic student range: $40–$100/mo using student discount.

   - **Utilities:** The student's share of utilities (electricity, water, heating) in a shared apartment — divide the typical 2BR apartment utility bill by 2 roommates. Do NOT use a full apartment's utility bill as a single student's cost.
     - Realistic student range: $40–$90/mo (student's share).

   - **Internet:** Cost of a standard broadband plan split between roommates. Divide the typical monthly plan price by 2 roommates.
     - Realistic student range: $20–$40/mo per student.

   - **Miscellaneous:** Student-level personal spending — laundry ($10–$20/mo), basic personal care ($15–$25/mo), phone plan ($15–$30/mo for a budget carrier like Mint/Visible/MVNO), and minimal entertainment ($20–$40/mo for streaming + occasional outing). No gym memberships, no restaurants, no shopping.
     - Realistic student range: $80–$150/mo. Do NOT use BLS Consumer Expenditure data for the general population — it will be too high.

3. **SOURCE EVERY VALUE.** For every monetary field, you MUST provide the source URL in the sources array. Acceptable sources:

   | Data Point | Acceptable Sources |
   |---|---|
   | Rent | Zillow Rent Index (zillow.com), Apartments.com, Rent.com, university off-campus housing boards, HUD Fair Market Rents (huduser.gov) |
   | Food | USDA Thrifty Food Plan (fns.usda.gov), Numbeo grocery index (numbeo.com) |
   | Transportation | Local transit authority websites (e.g., mbta.com, mta.info, ttc.ca) — find the student discount pass price specifically |
   | Utilities | EIA (eia.gov), local utility company rate pages, Numbeo utility index |
   | Internet | ISP pricing pages, BroadbandNow (broadbandnow.com), Numbeo internet index |
   | Number of universities | NCES (nces.ed.gov), state education boards, Wikipedia city education sections |
   | Part-time job pay | BLS (bls.gov), state minimum wage data, Indeed/Glassdoor student job listings |
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

7. **CITY RATING:** Rate the city 1-5 based on: livability, safety, cost of living for students, cultural opportunities, student-friendliness. Use Niche.com grades, BestPlaces scores, and livability indexes as reference. Provide ONLY the number.

8. **CLIMATE:** Classify as exactly one of: "warm", "moderate", "cold" based on geographic location.

9. **REGIONAL CONTEXT:** Identify the top 3 most expensive and top 3 most affordable cities for students in the exact same state/province (or country if it's a small country without states). Return JUST the city names as an array of strings.

10. **CONSISTENCY CHECK:** The average_monthly_cost_of_living MUST equal the sum of: average_rent + average_food_cost + transportation + utilities + internet_and_subscriptions + miscellaneous.

---

### CHAIN OF THOUGHT (Internal Processing):

**Step 1 - Rent Research (STUDENT SHARE):**
- Search for shared student housing near universities in {{CITY_NAME}}
- Target: "1 bedroom in a shared 2–3BR apartment near university" or "student room for rent {{CITY_NAME}}"
- If only full apartment price is found, divide by 2 roommates
- Record the source URL
- ⚠️ Reject any figure that looks like a solo apartment or market-rate adult rent

**Step 2 - Food Cost Research (THRIFTY STUDENT BUDGET):**
- Use USDA Thrifty Food Plan cost for a single adult in the current year
- Cross-reference with Numbeo grocery index for {{CITY_NAME}} if available
- Target: $200–$320/mo range for most US/CA/UK cities
- Record the source URL
- ⚠️ Do NOT use USDA Moderate or Liberal plan — use Thrifty only

**Step 3 - Transportation Research (STUDENT PASS PRICE):**
- Go to the local transit authority for {{CITY_NAME}}
- Find the monthly student pass or youth/student discount fare
- Use that specific discounted price, NOT the adult monthly pass
- Record the source URL with the exact student pass page

**Step 4 - Utilities Research (STUDENT SHARE):**
- Find average monthly utility bill for a 2BR apartment in {{CITY_NAME}} (EIA, Numbeo, or local utility)
- Divide by 2 to get the student's share in a shared apartment
- Record the source URL
- ⚠️ Do NOT return the full apartment utility cost

**Step 5 - Internet Research (PER-STUDENT SHARE):**
- Find the cheapest standard broadband plan (50–100 Mbps) available in {{CITY_NAME}}
- Divide by 2 roommates to get per-student share
- Record the source URL

**Step 6 - Miscellaneous (STUDENT-LEVEL SPENDING):**
- Phone: Budget MVNO plan (~$15–$30/mo, e.g., Mint Mobile, Visible)
- Laundry: ~$10–$20/mo (coin laundry)
- Personal care: ~$15–$25/mo (basic toiletries)
- Entertainment: ~$20–$40/mo (streaming + 1 outing)
- Sum these for the miscellaneous total
- Record sources if available (BLS, Numbeo personal care index)
- ⚠️ Do NOT include dining out, gym, shopping, or other non-student spending

**Step 7 - Sum Verification:**
- Add all 6 components
- Set average_monthly_cost_of_living to this exact sum

**Step 8 - University Count:**
- Search NCES or education listings for universities in {{CITY_NAME}} metro area
- Count accredited institutions

**Step 9 - Student Experience:**
- Search for average part-time hourly pay for students (BLS, state minimum wage)
- Search for student satisfaction scores (Niche.com city grades)

**Step 10 - City Image & Rating:**
- Find cityscape image from official tourism site
- Rate city 1-5 with student cost-of-living as a primary factor

---

### REQUIRED OUTPUT STRUCTURE:

You must return a JSON object that matches this exact schema:

{{JSON_SCHEMA}}

---

### FINAL REMINDER:

- Output ONLY valid JSON.
- Every monetary value must be verifiable and student-realistic.
- All costs are MONTHLY and based on what a real student actually pays.
- average_monthly_cost_of_living MUST = sum of all 6 cost components.
- If a cost seems too high for a student, re-examine your source — you may be using adult/professional pricing.

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
            description: "Total monthly student cost of living = sum of rent + food + transport + utilities + internet + miscellaneous. Must reflect a real student's budget, not a professional's.",
          },
          average_rent: {
            type: "integer",
            description: "Student's monthly rent share in shared housing — 1 bedroom in a 2–3BR apartment near campus, split with roommates. NOT a solo apartment. Realistic range: $400–$1,200 depending on city.",
          },
          average_food_cost: {
            type: "integer",
            description: "Monthly food cost for a budget-conscious student — primarily grocery cooking at home, using USDA Thrifty Food Plan as reference. NOT a general adult food budget. Realistic range: $200–$320.",
          },
          transportation: {
            type: "integer",
            description: "Monthly cost of student discounted transit pass from the local transit authority. NOT the adult/standard pass price. NOT car ownership. Realistic range: $40–$100.",
          },
          utilities: {
            type: "integer",
            description: "Student's share of monthly utilities (electricity, water, gas/heating) in a shared apartment — divide full apartment utility bill by number of roommates. Realistic range: $40–$90.",
          },
          internet_and_subscriptions: {
            type: "integer",
            description: "Student's share of monthly internet cost — standard broadband plan split with roommates. Realistic range: $20–$40 per student.",
          },
          miscellaneous: {
            type: "integer",
            description: "Monthly student miscellaneous: budget phone plan ($15–$30), laundry ($10–$20), personal care ($15–$25), minimal entertainment ($20–$40). No restaurants, gym, or shopping. Realistic range: $80–$150.",
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
        model: "gemini-3.1-pro-preview",
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

      const result = await withTimeout(
        model.generateContent(prompt),
        GEMINI_GENERATE_TIMEOUT_MS
      );
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
      if (error instanceof ExtractionTimeoutError) {
        throw error;
      }
      if (error instanceof Error) {
        const wrapped = new Error(`City data extraction failed: ${error.message}`);
        wrapped.name = "CityExtractionError";
        wrapped.cause = error;
        wrapped.retryable = isRetryableExtractionError(error);
        wrapped.code = "CITY_GEMINI_ERROR";
        throw wrapped;
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
