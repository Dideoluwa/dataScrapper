const { GoogleGenerativeAI } = require("@google/generative-ai");
const { zodToJsonSchema } = require("zod-to-json-schema");
const { UniversitySchema } = require("./schemas");


const SYSTEM_INSTRUCTION = `You are an expert university data analyst for "AfroRank," a platform helping African students find universities abroad. Your primary goal is to extract a highly accurate, verified, and comprehensive JSON profile for the specified university, using data that is up-to-date as of November 2025.

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

6. **Conciseness & Formatting (CRITICAL):**
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

**Step 5 - Final Consistency Check:**
- *Check:* Do all monetary values use consistent currency?
- *Action:* Standardize before final output.

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
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required");
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
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
          location: {
            type: "object",
            properties: {
              city: { type: "string" },
              state: { type: "string" },
              country: { type: "string" },
              source: { type: "string" },
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
              top_majors: { type: "array", items: { type: "string" } }, // ADDED
              professor_ratings: { type: "string", description: "e.g. 4.3/5" }, // ADDED
              global_ranking_qs: { type: "string" },
              us_news_ranking: { type: "string" },
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
          "data_verification_notes",
        ],
      };

      // Replace placeholders in system instruction
      const systemInstruction = SYSTEM_INSTRUCTION.replace(
        "{{UNIVERSITY_NAME_OR_URL}}",
        universityName
      ).replace("{{JSON_SCHEMA}}", JSON.stringify(jsonSchema, null, 2));

      // Initialize model with Google Search tool enabled and response schema
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

      return validatedData;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Gemini extraction failed: ${error.message}`);
      }
      throw new Error("Gemini extraction failed: Unknown error");
    }
  }
}

module.exports = { GeminiService };
