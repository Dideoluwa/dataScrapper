const { GoogleGenerativeAI } = require("@google/generative-ai");
const { zodToJsonSchema } = require("zod-to-json-schema");
const { UniversitySchema, ALLOWED_PROGRAMS } = require("./schemas");


const SYSTEM_INSTRUCTION = `You are an expert university data analyst for "AfroRank," a platform helping African students find universities abroad. Your primary goal is to extract a highly accurate, verified, and comprehensive JSON profile for the specified university, using data that is up-to-date as of {{CURRENT_DATE}}.

---

### TARGET UNIVERSITY:

{{UNIVERSITY_NAME_OR_URL}}

---

### CORE INSTRUCTIONS:

1. **Deep Verification:** Do not hallucinate data. If a specific field is not explicitly stated, output "Not reported" or null. Do not guess.

2. **Source Tracing:** For every major data section, you MUST identify the specific URL or section of the text where this information was found and include it in the 'source' field.

3. **Currency & Context:** Ensure all monetary values are clearly labeled with their currency (USD, CAD, GBP).

4. **Target Audience Focus:** Actively look for information relevant to African and international students.
   - **Scholarships:** You MUST verify if a scholarship page exists. If found, extract the specific URL for that scholarship's application or details page and put it in the 'link' field. Do not just use the general financial aid homepage.
   - Look for: "African Student Association", "International Entrance Awards", "Visa Requirements
5. **Date Accuracy:** Prioritize data for the most recent available academic year (2024-2025 or 2025-2026).

6. **Country-Specific Rankings (CRITICAL):**
   - **Overall National Rank (REQUIRED):** MUST include overall_national_rank in the format "#X in [Country]" (e.g., "#3 in Canada", "#1 in USA", "#5 in UK")
   - This should be the OVERALL national ranking, not a category-specific ranking (e.g., NOT "#2 Research College in Canada", just "#2 in Canada")
   - **US News Rank (REQUIRED FOR ALL):** MUST include us_news_rank from www.usnews.com for ALL universities (both US and international)
     - Search www.usnews.com for the university's ranking
     - Format: e.g., "#15 in National Universities" or "#3 in Global Universities" or "Not ranked" if not found
     - Include the source URL from www.usnews.com in the rankings source field
   - **Canadian universities:** MUST include ranking_canada (e.g., Maclean's ranking) AND overall_national_rank AND us_news_rank
   - **US universities:** MUST include ranking_us (e.g., US News ranking) AND overall_national_rank AND us_news_rank
   - **UK universities:** MUST include ranking_uk (e.g., Times/Sunday Times ranking) AND overall_national_rank AND us_news_rank
   - Only include the country-specific ranking field for the country where the university is located
   - **IMPORTANT:** Use the most current ranking data available as of {{CURRENT_DATE}}. Search for the latest 2024-2025 or 2025 rankings.

7. **Direct Metrics (CRITICAL):**
   - Field "diversity_direct" must be the percent of students of color only (single value with % sign, e.g., "42%")
   - Field "tuition_direct" must be a single currency amount only (e.g., "$24000" or "CAD 28,500")
   - No extra words, ranges, or explanations—just the figure

8. **University and City Ratings (REQUIRED):**
   - Field "university_rating" must be an overall rating of the university on a scale of 1-5
     - Consider: academic reputation, student satisfaction, facilities, research output, employment outcomes, international recognition
     - Provide ONLY the number (e.g., "4", "5", "3") - NOT "4/5" or "4 out of 5"
     - Use research from rankings, student reviews, and academic assessments
   - Field "city_rating" must be an overall rating of the city on a scale of 1-5
     - Consider: livability, safety, cost of living, cultural opportunities, student-friendly environment, quality of life
     - Provide ONLY the number (e.g., "4", "5", "3") - NOT "4/5" or "4 out of 5"
     - Use research from city rankings, livability indexes, and student testimonials

9. **University and City Images (CRITICAL - REQUIRED):**
   - **ABSOLUTE REQUIREMENT:** Images MUST be REAL, DIRECT PHOTOGRAPHS - NOT framed images, NOT printed on merchandise (shirts, mugs, posters), NOT rendered/artificial images, NOT illustrations
   - **FORBIDDEN SOURCES (DO NOT USE - These return errors):**
     - Wikimedia Commons (upload.wikimedia.org, wikimedia.org) - returns 404 errors
     - FineArtAmerica (images.fineartamerica.com) - returns Access Denied errors
     - Any site that requires authentication or returns access errors
   - **FORBIDDEN IMAGE TYPES:**
     - Images in picture frames
     - Images printed on shirts, mugs, posters, merchandise
     - Rendered/3D/computer-generated images
     - Illustrations, drawings, paintings, artwork
     - Mockups, templates, placeholders
   - **University Image:** MUST find a high-quality REAL PHOTO of a DISTINCTIVE, RECOGNIZABLE CAMPUS BUILDING specific to this university
     - **CRITICAL:** Image must show the actual distinctive building(s) of this specific university (e.g., grand stone buildings with ivy, red-brick towers, modern glass buildings, traditional architecture)
     - **Examples of good images:** University of Illinois (stone building with ivy), Howard University (red-brick tower), NYU (modern glass building), University of Toronto (curved roofline building)
     - **PRIORITY ORDER (ONLY USE THESE WORKING SOURCES):** 
       1. **Official university website (.edu domain) pages with images** - Examples: towson.edu/visit/, university.edu/campus/, university.edu/about/
          - Look for pages like: "visit", "campus", "about", "virtual tour", "campus life"
          - Return the PAGE URL (e.g., https://www.towson.edu/visit/ or https://www.accruent.com/resources/case-studies/towson)
          - These are the MOST RELIABLE sources
       2. **Official university system/partnership sites** - Examples: shadygrove.usmd.edu/universities/towson-university
       3. **Case studies, news articles, or official features** about the university with campus images
       4. **Reputable sources** - Official tourism sites, reputable education sites
     - The URL can be a **page URL** (like .edu/visit/) OR a direct image URL if from a credible source
     - The URL MUST be publicly accessible (no authentication, no Access Denied errors)
     - **FORBIDDEN:** upload.wikimedia.org, images.fineartamerica.com, any site returning 404/Access Denied
     - **REQUIRED:** Image must show distinctive campus building(s) specific to this university, not generic buildings
   - **City Image:** MUST find a high-quality REAL PHOTO cityscape image showing MANY BUILDINGS of the city where the university is located
     - **CRITICAL:** Image must be a REAL, DIRECT PHOTOGRAPH showing a city view with lots of buildings visible (cityscape/urban landscape/skyline), NOT a single building, NOT framed, NOT on merchandise
     - **Examples of good images:** Chicago (skyline with skyscrapers), Toronto (waterfront skyline), Washington D.C. (Capitol with city context), Manchester (urban street with buildings), London (Big Ben with city), Quebec (Château with city)
     - **Types of acceptable images:**
       - City skylines with many buildings
       - Waterfront cityscapes
       - Urban landscapes with multiple buildings
       - Landmarks with city context showing many buildings
     - **PRIORITY ORDER (ONLY USE THESE WORKING SOURCES):**
       1. **Official city/tourism websites** with cityscape images - city.gov, visitcity.com, tourism sites
       2. **Travel/tourism sites** - TripAdvisor, official tourism boards (cityscape views)
       3. **News articles or features** about the city with cityscape images
       4. **Reputable sources** - Official sites, credible tourism/travel sites
     - The URL can be a **page URL** with cityscape images OR a direct image URL if from a credible source
     - The URL MUST be publicly accessible
     - **FORBIDDEN:** upload.wikimedia.org, images.fineartamerica.com
     - **REQUIRED:** Image must show cityscape with many buildings (skyline/urban landscape), not single building
   - Both images are REQUIRED - Prioritize official .edu sites and credible page URLs over direct image links

10. **New Matching Algorithm Fields (CRITICAL):**
    - **tuition_numeric:** Extract the annual tuition as a plain integer in USD. No currency symbols, commas, or text. Parse from cost_of_attendance.tuition or tuition_direct. Example: 32000, 15500, 48000. If unavailable: null.
    - **total_cost_numeric:** Total annual cost of attendance (tuition + room + board + fees) as a plain integer in USD. Parse from cost_of_attendance.average_total, or sum up components if only individual values are available. Example: 52000, 28000. If unavailable: null.
    - **programs:** Academic programs this university offers. ONLY include values from this predefined list — do NOT invent values:
      Engineering & Technology: Mechanical, Civil, Electrical, Chemical, Aerospace, Biomedical Engineering
      Computer Science & IT: Software Engineering, Data Science, AI/ML, Cybersecurity, Information Systems
      Business & Management: Accounting, Finance, Marketing, Entrepreneurship, Supply Chain, MBA
      Health & Life Sciences: Medicine, Nursing, Pharmacy, Public Health, Dentistry, Physiotherapy
      Natural Sciences: Biology, Chemistry, Physics, Mathematics, Environmental Science
      Social Sciences: Psychology, Sociology, Political Science, Economics, Anthropology
      Arts & Humanities: History, Philosophy, Literature, Languages, Religious Studies, Music, Fine Art
      Law & Legal Studies: Law (LLB/JD), International Law, Criminal Justice, Human Rights
      Education: Teaching, Curriculum Design, Educational Psychology, Special Education
      Architecture & Design: Architecture, Urban Planning, Interior Design, Industrial Design
      Communications & Media: Journalism, Film, Public Relations, Advertising, Digital Media
      Agriculture & Environment: Agronomy, Food Science, Forestry, Sustainability, Marine Science
      If unavailable: empty array [].
    - **acceptance_rate_numeric:** Acceptance rate as a decimal between 0 and 1. Example: 0.67 (for 67%), 0.12 (for 12%). Parse from the same source used for admissions.acceptance_rate. If unavailable: null.
    - **min_gpa:** Minimum GPA required or recommended for admission, on a 4.0 scale. Look for "minimum GPA", "GPA requirement", etc. Example: 3.0, 2.5. If unavailable: null.
    - **campus_setting:** Normalized campus environment. Must be exactly one of: "urban", "suburban", or "rural". Derive from basic_info.campus_type and basic_info.setting: Urban/City/Metropolitan → "urban", Suburban/Town → "suburban", Rural/Small town → "rural". If ambiguous: null.
    - **international_students_pct:** International student percentage as a decimal between 0 and 1. Example: 0.28 (for 28%). Parse from basic_info.international_students. If unavailable: null.
    - **climate:** General climate classification. Must be exactly one of: "warm", "moderate", or "cold". Derive from the university's geographic location:
      Warm: Southern US (Florida, Texas, Arizona, California, Georgia, Louisiana, etc.), warm regions elsewhere
      Moderate: Mid-Atlantic, Pacific Northwest (Virginia, North Carolina, Oregon, Washington, etc.), Southern England
      Cold: Northern US (Michigan, Minnesota, New York, Illinois, etc.), most of Canada, Scotland/Northern England
      If unavailable: null.
    - **has_african_student_association:** Whether the university has an African Student Association (ASA), African Students' Union, or similar organization. Check student organizations/clubs for keywords like "African Student", "ASA", "African Union", "African Society". If unable to determine: null.

11. **Conciseness & Formatting (CRITICAL):**
   - **Be concise.** Remove fluff words like "approx.", "approximately", "total of", "estimated to be".
   - **Format:** Use symbols and direct numbers.
     - BAD: "There are over 3,000 international students from more than 120 countries which is about 13%."
     - GOOD: "~3,000 (13% from 120+ countries)"
     - BAD: "The tuition is estimated to be around $50,000 per year."
     - GOOD: "~$50,000/year"

---

### CHAIN OF THOUGHT (Internal Processing):

Before generating the final JSON, perform these verification checks:

**Step 1 - Tuition Verification:**
- *Check:* Did I find a specific number for international tuition?
- *Action:* Use international if available; label clearly if domestic only.

**Step 2 - Source Reliability:**
- *Check:* Is the acceptance rate from an official source?
- *Action:* Prioritize official .edu domains.

**Step 3 - Formatting Check:**
- *Check:* Are my descriptions wordy?
- *Action:* Trim "Over X students..." to "~X students".

**Step 4 - African Student Focus:**
- *Check:* Did I find at least one club related to African students?
- *Action:* Look closer at student life sections.

**Step 5 - Country-Specific Rankings:**
- *Check:* What country is the university in? What is the current overall national ranking? What is the US News ranking from www.usnews.com?
- *Action:* 
  - Find the OVERALL national ranking (not category-specific) and format as "#X in [Country]"
  - **REQUIRED:** Search www.usnews.com and include us_news_rank for ALL universities (format: "#X in [Category]" or "Not ranked")
  - If Canada: Include overall_national_rank (e.g., "#3 in Canada") AND ranking_canada AND us_news_rank
  - If United States: Include overall_national_rank (e.g., "#1 in USA") AND ranking_us AND us_news_rank
  - If United Kingdom: Include overall_national_rank (e.g., "#5 in UK") AND ranking_uk AND us_news_rank
  - Verify the ranking is current as of {{CURRENT_DATE}} - search for latest 2024-2025 or 2025 rankings
  - Do NOT use category-specific rankings like "#2 Research College" - use overall national rank only
  - Include www.usnews.com URL in the rankings source field

**Step 6 - Direct Metrics Validation:**
- *Check:* Do I have "diversity_direct" (students of color %) and "tuition_direct" as single standalone figures?
- *Action:* Ensure diversity is like "42%" and tuition like "$24000" (no extra words).

**Step 7 - Ratings Validation:**
- *Check:* Do I have "university_rating" and "city_rating" as single numbers (1-5)?
- *Action:* 
  - Research university quality: rankings, student satisfaction, facilities, outcomes → assign rating 1-5
  - Research city quality: livability, safety, cost, culture, student experience → assign rating 1-5
  - Ensure ratings are just numbers (e.g., "4") NOT "4/5" or "4 out of 5"

**Step 8 - Image Verification (CRITICAL):**
- *Check:* Did I find real, accessible URLs for both "university_image" and "city_image"? Are they REAL DIRECT PHOTOS?
- *Action:* 
  - **ABSOLUTE REQUIREMENT:** Images MUST be REAL, DIRECT PHOTOGRAPHS - NOT framed, NOT on merchandise, NOT rendered/artificial
  - **FORBIDDEN IMAGE TYPES:**
    - Images in picture frames
    - Images printed on shirts, mugs, posters, merchandise
    - Rendered/3D/computer-generated images
    - Illustrations, drawings, paintings, artwork
    - Mockups, templates, placeholders
  - **FORBIDDEN SOURCES (NEVER USE):**
    - upload.wikimedia.org, wikimedia.org, Wikimedia Commons - returns 404 errors
    - images.fineartamerica.com - returns Access Denied errors
    - Any URL that contains "/v1/AUTH_" or authentication tokens
    - Any site that requires login or returns access errors
  - **PRIORITY #1:** Official university websites (.edu) - these are MOST RELIABLE
    - Search: "[University Name].edu visit" or "[University Name].edu campus" or "[University Name].edu about"
    - Look for pages like: /visit/, /campus/, /about/, /virtual-tour/
    - Return the PAGE URL (e.g., https://www.towson.edu/visit/ or https://shadygrove.usmd.edu/universities/towson-university)
    - Example good URLs: towson.edu/visit/, university.edu/campus/, accruent.com/resources/case-studies/towson
  - For university image: Search "[University Name].edu visit" or "[University Name] official campus page"
  - For city image: Search "[City Name] cityscape" or "[City Name] city view many buildings" or "[City Name] official tourism cityscape"
  - **URL Validation:**
    - **Preferred:** Official .edu page URLs (like towson.edu/visit/) that display campus images
    - **Also acceptable:** Direct image URLs from credible sources (Unsplash, Pexels, news sites)
    - URL must NOT contain "wikimedia" or "fineartamerica" in domain
    - URL must NOT contain "/v1/AUTH_" or authentication paths
    - **ONLY use URLs from:** Official .edu domains (PRIORITY), case study sites, official tourism sites, credible news sites
    - **NEVER use:** Wikimedia Commons, FineArtAmerica, or any site that returns access errors
  - Both fields are REQUIRED - prioritize official .edu page URLs above all other sources

**Step 8 - Final Consistency Check:**
- *Check:* Do all monetary values use consistent currency? Are "university_image" and "city_image" present? Does city_image show a cityscape with many buildings?
- *Action:* Standardize before final output. Ensure both image URLs are included. Verify city image shows cityscape (many buildings), not single building.

---

### REQUIRED OUTPUT STRUCTURE:

You must return a JSON object that matches this exact schema:

{{JSON_SCHEMA}}

---

### FINAL REMINDER:

- Output ONLY valid JSON.
- Every data point must be verifiable.
- Keep text fields brief and data-dense.

---

BEGIN EXTRACTION NOW.`;

class GeminiService {
  constructor(apiKey, imageSearchService = null) {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required");
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.imageSearchService = imageSearchService;
  }

  /**
   * Validate if a URL is a direct image URL (not a page URL)
   * Returns true if it's a direct image, false otherwise
   */
  async validateImageUrl(url) {
    if (!url || typeof url !== 'string') return false;

    const lowerUrl = url.toLowerCase();
    
    // Check for image file extensions
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.tif'];
    const hasImageExtension = imageExtensions.some(ext => lowerUrl.includes(ext));
    
    // Check for common image URL patterns (e.g., /image/, /img/, /photo/, /picture/)
    const imagePathPatterns = ['/image/', '/img/', '/photo/', '/picture/', '/images/', '/photos/', '/pictures/'];
    const hasImagePath = imagePathPatterns.some(pattern => lowerUrl.includes(pattern));
    
    // Check for common image CDN patterns
    const imageCdnPatterns = ['i.imgur.com', 'cdn.', 'static.', 'assets.', 'media.', 'uploads/'];
    const hasImageCdn = imageCdnPatterns.some(pattern => lowerUrl.includes(pattern));
    
    // If it has an image extension, it's likely a direct image
    if (hasImageExtension) {
      // But exclude .svg if it's in the forbidden list (we already filter those)
      if (lowerUrl.endsWith('.svg')) return false;
      return true;
    }
    
    // If it has image path patterns or CDN patterns, check the content-type
    if (hasImagePath || hasImageCdn) {
      try {
        // Make a HEAD request to check content-type
        const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
        const contentType = response.headers.get('content-type') || '';
        
        // Check if content-type indicates an image
        if (contentType.startsWith('image/')) {
          return true;
        }
        
        // If content-type is HTML, it's a page URL, not an image
        if (contentType.includes('text/html') || contentType.includes('application/')) {
          console.log(`   ⚠️  URL is a page, not an image (content-type: ${contentType}): ${url}`);
          return false;
        }
      } catch (error) {
        // If we can't check, be conservative and reject it
        console.log(`   ⚠️  Could not validate image URL (${error.message}): ${url}`);
        return false;
      }
    }
    
    // If it doesn't match any pattern, check content-type as last resort
    try {
      const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.startsWith('image/')) {
        return true;
      }
      
      // If it's HTML or application, it's definitely not a direct image
      if (contentType.includes('text/html') || contentType.includes('application/')) {
        console.log(`   ⚠️  URL is a page, not an image (content-type: ${contentType}): ${url}`);
        return false;
      }
    } catch (error) {
      // If we can't verify, reject it to be safe
      console.log(`   ⚠️  Could not validate image URL (${error.message}): ${url}`);
      return false;
    }
    
    // Default: reject if we can't confirm it's an image
    console.log(`   ⚠️  URL does not appear to be a direct image URL: ${url}`);
    return false;
  }

  /**
   * Extract university data using Gemini AI with Google Search Grounding
   * @param {string} universityName - Name or URL of the university
   * @returns {Promise<Object>} Parsed and validated university data
   */
  /**
   * Flatten JSON schema by resolving $ref references
   */
  flattenSchema(schema) {
    if (!schema || typeof schema !== "object") {
      return schema;
    }

    // If schema has definitions, we need to inline them
    if (schema.definitions) {
      const definitions = schema.definitions;
      const flattened = { ...schema };
      delete flattened.definitions;

      // Recursively replace $ref with actual definitions
      const replaceRefs = (obj) => {
        if (Array.isArray(obj)) {
          return obj.map(replaceRefs);
        }
        if (obj && typeof obj === "object") {
          if (obj.$ref) {
            const refPath = obj.$ref.replace("#/definitions/", "");
            if (definitions[refPath]) {
              return replaceRefs(definitions[refPath]);
            }
          }
          const result = {};
          for (const [key, value] of Object.entries(obj)) {
            result[key] = replaceRefs(value);
          }
          return result;
        }
        return obj;
      };

      return replaceRefs(flattened);
    }

    // Recursively process the schema
    const process = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(process);
      }
      if (obj && typeof obj === "object") {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          if (key === "$ref") {
            // Skip $ref, should have been handled by definitions
            continue;
          }
          result[key] = process(value);
        }
        return result;
      }
      return obj;
    };

    return process(schema);
  }

  async extractUniversityData(universityName) {
    try {
      // Use the provided JSON schema directly (matches user's specification)
      const jsonSchema = {
        type: "object",
        properties: {
          university: {
            type: "string",
            description: "Full name of the university",
          },
          // --- NEW matching algorithm fields (top-level) ---
          tuition_numeric: {
            type: "number",
            nullable: true,
            description: "Annual tuition as a plain integer in USD. No currency symbols, commas, or text. Example: 32000, 15500. If unavailable: null.",
          },
          total_cost_numeric: {
            type: "number",
            nullable: true,
            description: "Total annual cost of attendance (tuition + room + board + fees) as a plain integer in USD. Example: 52000. If unavailable: null.",
          },
          programs: {
            type: "array",
            items: { type: "string" },
            description: "Academic programs this university offers. You MUST select ALL applicable programs from this list — do NOT invent values, but DO include every program the university offers from: Mechanical, Civil, Electrical, Chemical, Aerospace, Biomedical Engineering, Software Engineering, Data Science, AI/ML, Cybersecurity, Information Systems, Accounting, Finance, Marketing, Entrepreneurship, Supply Chain, MBA, Medicine, Nursing, Pharmacy, Public Health, Dentistry, Physiotherapy, Biology, Chemistry, Physics, Mathematics, Environmental Science, Psychology, Sociology, Political Science, Economics, Anthropology, History, Philosophy, Literature, Languages, Religious Studies, Music, Fine Art, Law (LLB/JD), International Law, Criminal Justice, Human Rights, Teaching, Curriculum Design, Educational Psychology, Special Education, Architecture, Urban Planning, Interior Design, Industrial Design, Journalism, Film, Public Relations, Advertising, Digital Media, Agronomy, Food Science, Forestry, Sustainability, Marine Science. A major research university will typically match 20-40+ of these. If truly unavailable: empty array [].",
          },
          location: {
            type: "object",
            properties: {
              city: { type: "string" },
              state: { type: "string" },
              country: { type: "string" },
              source: { type: "string" },
              // --- NEW ---
              climate: {
                type: "string",
                enum: ["warm", "moderate", "cold"],
                nullable: true,
                description: "General climate classification. Must be exactly 'warm', 'moderate', or 'cold'. If unavailable: null.",
              },
            },
            required: ["city", "country", "source"],
          },
          basic_info: {
            type: "object",
            properties: {
              founded: { type: "string", description: "e.g. Est. 1867" }, // CHANGED from integer to string to match your format
              type: { type: "string" },
              setting: { type: "string" },
              campus_type: {
                type: "string",
                description: "e.g. Urban-suburban mix",
              },
              website: { type: "string" },
              total_enrollment: { type: "string" },
              international_students: {
                type: "string",
                description: "e.g. ~11,000 (from 120+ countries)",
              },
              notable_alumni: {
                type: "array",
                items: { type: "string" },
                description:
                  "List of alumni including African innovators if found",
              },
              source: { type: "string" },
              // --- NEW ---
              campus_setting: {
                type: "string",
                enum: ["urban", "suburban", "rural"],
                nullable: true,
                description: "Normalized campus environment. Must be exactly 'urban', 'suburban', or 'rural'. Derive from campus_type/setting. If ambiguous: null.",
              },
              international_students_pct: {
                type: "number",
                nullable: true,
                description: "International student percentage as a decimal between 0 and 1. Example: 0.28 for 28%. If unavailable: null.",
              },
            },
            required: ["founded", "website", "source"],
          },
          cost_of_attendance: {
            type: "object",
            properties: {
              academic_year: { type: "string" },
              tuition: {
                type: "string",
                description: "International tuition e.g. $34,500 / year",
              },
              books_supplies: { type: "string" },
              transportation_misc: { type: "string" },
              average_total: { type: "string" },
              average_net_price: { type: "string", description: "After aid" },
              source: { type: "string" },
            },
            required: ["tuition", "source"],
          },
        diversity_direct: {
          type: "string",
          description: "Percent of students of color only (e.g., '42%') — no words, just the value.",
        },
        tuition_direct: {
          type: "string",
          description: "Single tuition figure only, e.g. '$24000' (no words, just the value).",
        },
        university_image: {
          type: "string",
          description: "URL to a high-quality REAL DIRECT PHOTOGRAPH of a distinctive, recognizable campus building specific to this university. Must be a real photo, NOT framed, NOT on merchandise (shirts/mugs/posters), NOT rendered/artificial. Must show the actual distinctive building(s) of this specific university (e.g., grand stone buildings with ivy, red-brick towers, modern glass buildings, traditional architecture). Examples: University of Illinois (stone building with ivy), Howard University (red-brick tower), NYU (modern glass building). PRIORITY: Official .edu page URLs with images (e.g., towson.edu/visit/, university.edu/campus/), case study pages, or partnership sites. Also acceptable: Direct image URLs from credible sources. FORBIDDEN: Wikimedia Commons (upload.wikimedia.org), FineArtAmerica (images.fineartamerica.com), framed images, merchandise, rendered images. REQUIRED.",
        },
        city_image: {
          type: "string",
          description: "URL to a high-quality REAL DIRECT PHOTOGRAPH cityscape image showing many buildings of the city where the university is located. Must be a real photo, NOT framed, NOT on merchandise (shirts/mugs/posters), NOT rendered/artificial. Must show a city view with lots of buildings visible (cityscape/urban landscape/skyline), not a single building. Examples: Chicago (skyline with skyscrapers), Toronto (waterfront skyline), Washington D.C. (Capitol with city context), London (Big Ben with city). Types: city skylines, waterfront cityscapes, urban landscapes with multiple buildings, landmarks with city context. PRIORITY: Official city/tourism page URLs with images. Also acceptable: Direct image URLs from credible sources. FORBIDDEN: Wikimedia Commons (upload.wikimedia.org), FineArtAmerica (images.fineartamerica.com), framed images, merchandise, rendered images. REQUIRED.",
        },
        university_rating: {
          type: "string",
          description: "Overall rating of the university on a scale of 1-5. Provide only the number (e.g., '4', '5', '3'). Based on academic reputation, student satisfaction, facilities, and overall quality. REQUIRED.",
        },
        city_rating: {
          type: "string",
          description: "Overall rating of the city on a scale of 1-5. Provide only the number (e.g., '4', '5', '3'). Based on livability, safety, cost of living, cultural opportunities, and overall quality of life for students. REQUIRED.",
        },
          scholarships: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                amount: { type: "string" },
                eligibility: { type: "string" },
                link: {
                  type: "string",
                  description: "Direct URL to scholarship page",
                }, // ADDED
                source: { type: "string" },
              },
            },
          },
          admissions: {
            type: "object",
            properties: {
              acceptance_rate: { type: "string" },
              gpa_thresholds: {
                type: "object",
                properties: {
                  engineering: {
                    type: "string",
                    description: "e.g. Highly competitive (3.7+)",
                  }, // CHANGED
                  arts_sciences: {
                    type: "string",
                    description: "e.g. Moderate (3.4+)",
                  }, // CHANGED
                },
              },
              english_proficiency: {
                type: "string",
                description: "Summary e.g. TOEFL (100) / IELTS (7.0)", // Simplified to match your string output example
              },
              enrollment_requirements: {
                type: "array",
                items: { type: "string" },
              },
              deadlines: {
                type: "object",
                properties: {
                  early_action: { type: "string" },
                  regular_decision: { type: "string" },
                },
              },
              visa_info: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  documents: { type: "array", items: { type: "string" } },
                },
              },
              source: { type: "string" },
              // --- NEW ---
              acceptance_rate_numeric: {
                type: "number",
                nullable: true,
                description: "Acceptance rate as a decimal between 0 and 1. Example: 0.67 for 67%. If unavailable: null.",
              },
              min_gpa: {
                type: "number",
                nullable: true,
                description: "Minimum GPA required or recommended for admission, on a 4.0 scale. Example: 3.0, 2.5. If unavailable: null.",
              },
            },
          },
          campus_life: {
            // RENAMED from student_life to match your structure better
            type: "object",
            properties: {
              food: { type: "string", description: "Dining options" }, // ADDED
              nightlife: { type: "string" }, // ADDED
              athletics: { type: "string" }, // ADDED
              diversity: { type: "string" },
              student_clubs: {
                type: "array",
                items: { type: "string" },
                description: "Focus on African/Black student associations",
              },
              source: { type: "string" },
              // --- NEW ---
              has_african_student_association: {
                type: "boolean",
                nullable: true,
                description: "Whether the university has an African Student Association (ASA), African Students' Union, or similar organization. If unable to determine: null.",
              },
            },
          },
          roi_outcomes: {
            type: "object",
            properties: {
              graduation_rate: { type: "string" },
              employment_rate: { type: "string" },
              average_starting_salary: { type: "string" }, // ADDED
              top_employers: {
                type: "array",
                items: { type: "string" },
              },
              alumni_perks: { type: "string" }, // ADDED
              source: { type: "string" },
            },
          },
          rankings: {
            type: "object",
            properties: {
              top_majors: { type: "array", items: { type: "string" } },
              professor_ratings: { type: "string", description: "e.g. 4.3/5" },
              global_ranking_qs: { type: "string" },
              overall_national_rank: {
                type: "string",
                description: "Overall national ranking in format '#X in [Country]' (e.g., '#3 in Canada', '#1 in USA', '#5 in UK'). This is the OVERALL ranking, not category-specific. REQUIRED for all universities."
              },
              us_news_rank: {
                type: "string",
                description: "US News ranking from www.usnews.com. REQUIRED for ALL universities (both US and international). Format: e.g., '#15 in National Universities' or '#3 in Global Universities' or 'Not ranked' if not found on US News."
              },
              ranking_canada: { 
                type: "string", 
                description: "National ranking in Canada (e.g., Maclean's ranking). Include ONLY if university is in Canada." 
              },
              ranking_us: { 
                type: "string", 
                description: "National ranking in US (e.g., US News ranking). Include ONLY if university is in United States." 
              },
              ranking_uk: { 
                type: "string", 
                description: "National ranking in UK (e.g., Times/Sunday Times ranking). Include ONLY if university is in United Kingdom." 
              },
              source: { type: "string" },
            },
          },
          data_verification_notes: {
            type: "string",
            description: "Chain of thought summary.",
          },
        },
        required: [
          "university",
          "basic_info",
          "cost_of_attendance",
          "diversity_direct",
          "tuition_direct",
          "university_image",
          "city_image",
          "university_rating",
          "city_rating",
          "tuition_numeric",
          "total_cost_numeric",
          "programs",
          "data_verification_notes",
        ],
      };

      // Get current date for up-to-date rankings
      const currentDate = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      // Replace placeholders in system instruction
      const systemInstruction = SYSTEM_INSTRUCTION
        .replace("{{UNIVERSITY_NAME_OR_URL}}", universityName)
        .replace(/{{CURRENT_DATE}}/g, currentDate)
        .replace("{{JSON_SCHEMA}}", JSON.stringify(jsonSchema, null, 2));

      // Initialize model with Google Search tool enabled and response schema
      // models/gemini-3-pro-preview
      // Note: The tool name may vary based on SDK version - try both googleSearch and google_search
      const model = this.genAI.getGenerativeModel({
        model: "gemini-3-pro-preview",
        systemInstruction: systemInstruction,
        tools: [
          {
            googleSearch: {},
          },
        ],
        generationConfig: {
          responseSchema: jsonSchema,
          responseMimeType: "application/json",
        },
      });

      // Generate content with the model
      // The prompt should trigger the model to use Google Search
      const prompt = `Analyze ${universityName} and return the JSON profile. Use Google Search to find the most recent and accurate data.`;

      console.log("\n=== GEMINI REQUEST ===");
      console.log("University:", universityName);
      console.log("========================\n");

      const result = await model.generateContent(prompt);
      const response = result.response;

      // Log full response details
      console.log("\n=== GEMINI RESPONSE DETAILS ===");
      console.log("Response Text:", response.text());
      console.log("\n=== CANDIDATES ===");
      if (result.response.candidates && result.response.candidates.length > 0) {
        result.response.candidates.forEach((candidate, index) => {
          console.log(`\nCandidate ${index + 1}:`);
          console.log("Finish Reason:", candidate.finishReason);
          console.log("Index:", candidate.index);

          // Log thinking/reasoning if available
          if (candidate.content && candidate.content.parts) {
            candidate.content.parts.forEach((part, partIndex) => {
              console.log(`\nPart ${partIndex + 1}:`);
              if (part.text) {
                console.log("Text:", part.text.substring(0, 500) + "...");
              }
              if (part.functionCall) {
                console.log(
                  "Function Call:",
                  JSON.stringify(part.functionCall, null, 2)
                );
              }
              if (part.functionResponse) {
                console.log(
                  "Function Response:",
                  JSON.stringify(part.functionResponse, null, 2)
                );
              }
            });
          }

          // Log grounding metadata (Google Search results)
          if (candidate.groundingMetadata) {
            console.log("\n=== GROUNDING METADATA (Google Search) ===");
            console.log(JSON.stringify(candidate.groundingMetadata, null, 2));

            if (candidate.groundingMetadata.groundingChunks) {
              console.log("\n=== SEARCH RESULTS ===");
              candidate.groundingMetadata.groundingChunks.forEach(
                (chunk, chunkIndex) => {
                  console.log(`\nSearch Result ${chunkIndex + 1}:`);
                  if (chunk.web) {
                    console.log("URL:", chunk.web.uri);
                    console.log("Title:", chunk.web.title);
                  }
                  if (chunk.retrievedContext) {
                    console.log(
                      "Context:",
                      chunk.retrievedContext.substring(0, 200) + "..."
                    );
                  }
                }
              );
            }
          }

          // Log safety ratings
          if (candidate.safetyRatings) {
            console.log("\n=== SAFETY RATINGS ===");
            candidate.safetyRatings.forEach((rating) => {
              console.log(`${rating.category}: ${rating.probability}`);
            });
          }
        });
      }

      // Log usage metadata
      if (result.response.usageMetadata) {
        console.log("\n=== USAGE METADATA ===");
        console.log(JSON.stringify(result.response.usageMetadata, null, 2));
      }

      // Extract JSON from response
      let jsonText = response.text();

      // Clean up the response if it contains markdown code blocks
      if (jsonText.includes("```json")) {
        jsonText = jsonText.split("```json")[1].split("```")[0].trim();
      } else if (jsonText.includes("```")) {
        jsonText = jsonText.split("```")[1].split("```")[0].trim();
      }

      console.log("\n=== PARSED JSON ===");
      console.log(jsonText);
      console.log("===================\n");

      // Parse JSON
      const parsedData = JSON.parse(jsonText);

      // Validate against Zod schema
      const validatedData = UniversitySchema.parse(parsedData);

      console.log("\n=== VALIDATED DATA ===");
      console.log(JSON.stringify(validatedData, null, 2));
      console.log("=====================\n");

      // ========== POST-PROCESSING: Derive new fields from existing data ==========
      this._postProcessNewFields(validatedData);
      console.log("\n=== POST-PROCESSED DATA (new fields) ===");
      console.log("tuition_numeric:", validatedData.tuition_numeric);
      console.log("total_cost_numeric:", validatedData.total_cost_numeric);
      console.log("programs:", validatedData.programs);
      console.log("acceptance_rate_numeric:", validatedData.admissions?.acceptance_rate_numeric);
      console.log("min_gpa:", validatedData.admissions?.min_gpa);
      console.log("campus_setting:", validatedData.basic_info?.campus_setting);
      console.log("international_students_pct:", validatedData.basic_info?.international_students_pct);
      console.log("climate:", validatedData.location?.climate);
      console.log("has_african_student_association:", validatedData.campus_life?.has_african_student_association);
      console.log("=============================================\n");

      // Add image search if available
      if (this.imageSearchService) {
        console.log('\n=== FETCHING IMAGES VIA GOOGLE CUSTOM SEARCH ===');
        
        // Search for university image
        const universityImage = await this.imageSearchService.searchUniversityImage(
          validatedData.university
        );
        
        // Search for city image
        const cityImage = await this.imageSearchService.searchCityImage(
          validatedData.location.city,
          validatedData.location.country
        );

        // Override Gemini's images with Google CSE results
        if (universityImage) {
          validatedData.university_image = universityImage;
          console.log('✅ Using Google CSE university image');
          console.log(`   📍 University image URL: ${universityImage}`);
        } else {
          console.log('⚠️  Google CSE found no university image - setting to empty string');
          validatedData.university_image = '';
        }

        if (cityImage) {
          validatedData.city_image = cityImage;
          console.log('✅ Using Google CSE city image');
          console.log(`   📍 City image URL: ${cityImage}`);
        } else {
          console.log('⚠️  Google CSE found no city image - setting to empty string');
          validatedData.city_image = '';
        }

        console.log('=============================================\n');
      } else {
        // If no image search service, validate Gemini's URLs and set to empty if invalid
        if (validatedData.university_image) {
          console.log('\n=== VALIDATING GEMINI UNIVERSITY IMAGE ===');
          const isValid = await this.validateImageUrl(validatedData.university_image);
          if (!isValid) {
            console.log('⚠️  Gemini university image URL is not a direct image - setting to empty string');
            validatedData.university_image = '';
          } else {
            console.log('✅ Gemini university image URL is valid');
          }
        } else {
          validatedData.university_image = '';
        }

        if (validatedData.city_image) {
          console.log('\n=== VALIDATING GEMINI CITY IMAGE ===');
          const isValid = await this.validateImageUrl(validatedData.city_image);
          if (!isValid) {
            console.log('⚠️  Gemini city image URL is not a direct image - setting to empty string');
            validatedData.city_image = '';
          } else {
            console.log('✅ Gemini city image URL is valid');
          }
        } else {
          validatedData.city_image = '';
        }
      }

      return validatedData;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Gemini extraction failed: ${error.message}`);
      }
      throw new Error("Gemini extraction failed: Unknown error");
    }
  }

  /**
   * Helper: Parse a numeric value from a currency/percentage string.
   * Strips $, CAD, GBP, £, €, commas, and text. Returns number or null.
   */
  _parseNumericFromString(str) {
    if (str == null || typeof str !== 'string') return null;
    // Remove currency symbols and labels
    let cleaned = str.replace(/[$£€]/g, '').replace(/\b(CAD|GBP|USD|EUR)\b/gi, '').trim();
    // Remove commas
    cleaned = cleaned.replace(/,/g, '');
    // Extract first number (integer or decimal)
    const match = cleaned.match(/[\d]+\.?[\d]*/);
    if (!match) return null;
    const num = parseFloat(match[0]);
    return isNaN(num) ? null : num;
  }

  /**
   * Helper: Parse a percentage string like "67%", "28%" into a decimal 0-1.
   */
  _parsePercentToDecimal(str) {
    if (str == null || typeof str !== 'string') return null;
    const match = str.match(/([\d]+\.?[\d]*)%/);
    if (!match) return null;
    const pct = parseFloat(match[1]);
    if (isNaN(pct)) return null;
    return Math.round((pct / 100) * 100) / 100; // 2 decimal places
  }

  /**
   * Post-process validated data to derive/validate new matching algorithm fields.
   * Mutates the data object in place.
   */
  _postProcessNewFields(data) {
    // --- tuition_numeric ---
    if (data.tuition_numeric == null) {
      // Try tuition_direct first, then cost_of_attendance.tuition
      const tuitionStr = data.tuition_direct || data.cost_of_attendance?.tuition;
      const parsed = this._parseNumericFromString(tuitionStr);
      data.tuition_numeric = parsed != null ? Math.round(parsed) : null;
    } else {
      data.tuition_numeric = Math.round(data.tuition_numeric);
    }

    // --- total_cost_numeric ---
    if (data.total_cost_numeric == null) {
      const totalStr = data.cost_of_attendance?.average_total;
      const parsed = this._parseNumericFromString(totalStr);
      data.total_cost_numeric = parsed != null ? Math.round(parsed) : null;
    } else {
      data.total_cost_numeric = Math.round(data.total_cost_numeric);
    }

    // --- programs: filter to allowed list only ---
    if (Array.isArray(data.programs)) {
      data.programs = data.programs.filter(p => ALLOWED_PROGRAMS.includes(p));
    } else {
      data.programs = [];
    }

    // --- acceptance_rate_numeric ---
    if (data.admissions) {
      if (data.admissions.acceptance_rate_numeric == null) {
        const arStr = data.admissions.acceptance_rate;
        const parsed = this._parsePercentToDecimal(arStr);
        data.admissions.acceptance_rate_numeric = parsed;
      }
      // Ensure it's a valid decimal 0-1
      if (data.admissions.acceptance_rate_numeric != null) {
        if (data.admissions.acceptance_rate_numeric > 1) {
          data.admissions.acceptance_rate_numeric = Math.round((data.admissions.acceptance_rate_numeric / 100) * 100) / 100;
        }
      }
    }

    // --- min_gpa: no fallback parsing, trust Gemini or null ---
    // (already handled by schema)

    // --- campus_setting ---
    if (data.basic_info) {
      if (data.basic_info.campus_setting == null) {
        const setting = (data.basic_info.setting || '').toLowerCase();
        const campusType = (data.basic_info.campus_type || '').toLowerCase();
        const combined = `${setting} ${campusType}`;
        if (/\b(urban|city|metropolitan)\b/.test(combined)) {
          data.basic_info.campus_setting = 'urban';
        } else if (/\b(suburban|town)\b/.test(combined)) {
          data.basic_info.campus_setting = 'suburban';
        } else if (/\b(rural|small\s*town)\b/.test(combined)) {
          data.basic_info.campus_setting = 'rural';
        }
        // else stays null
      }
      // Validate enum
      if (data.basic_info.campus_setting && !['urban', 'suburban', 'rural'].includes(data.basic_info.campus_setting)) {
        data.basic_info.campus_setting = null;
      }
    }

    // --- international_students_pct ---
    if (data.basic_info) {
      if (data.basic_info.international_students_pct == null) {
        const intlStr = data.basic_info.international_students;
        const parsed = this._parsePercentToDecimal(intlStr);
        data.basic_info.international_students_pct = parsed;
      }
      // Ensure it's a valid decimal 0-1
      if (data.basic_info.international_students_pct != null && data.basic_info.international_students_pct > 1) {
        data.basic_info.international_students_pct = Math.round((data.basic_info.international_students_pct / 100) * 100) / 100;
      }
    }

    // --- climate: no fallback (needs geographic knowledge), trust Gemini ---
    if (data.location) {
      if (data.location.climate && !['warm', 'moderate', 'cold'].includes(data.location.climate)) {
        data.location.climate = null;
      }
    }

    // --- has_african_student_association ---
    if (data.campus_life) {
      if (data.campus_life.has_african_student_association == null) {
        // Try to derive from student_clubs array
        const clubs = data.campus_life.student_clubs;
        if (Array.isArray(clubs) && clubs.length > 0) {
          const keywords = ['african student', 'asa', 'african union', 'african society', 'african association'];
          const found = clubs.some(club => {
            const lower = (club || '').toLowerCase();
            return keywords.some(kw => lower.includes(kw));
          });
          data.campus_life.has_african_student_association = found;
        }
        // if clubs is empty or missing, leave as null
      }
    }
  }
}

module.exports = { GeminiService };
