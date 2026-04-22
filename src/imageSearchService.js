const { GoogleGenerativeAI } = require("@google/generative-ai");

class ImageSearchService {
  constructor(apiKey, searchEngineId, geminiApiKey = null) {
    this.apiKey = apiKey;
    this.searchEngineId = searchEngineId;
    this.baseUrl = "https://www.googleapis.com/customsearch/v1";

    // Gemini client for landmark/viewpoint resolution (no tools, model knowledge only)
    this.genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TIER 1: Wikipedia REST API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetch the Wikipedia infobox hero image for a university or city.
   * Returns a direct image URL (upload.wikimedia.org) or null.
   * Free, no API key, near-100% coverage for any notable institution/city.
   */
  async getWikipediaHeroImage(name) {
    console.log(`   📖 Wikipedia lookup: "${name}"`);
    const slug = encodeURIComponent(name.replace(/ /g, "_"));

    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`
      );

      if (!res.ok) {
        console.log(`   ⚠️  Wikipedia: HTTP ${res.status} for "${name}"`);
        return null;
      }

      const data = await res.json();

      // Prefer full-resolution original; fall back to thumbnail
      const img = data.originalimage || data.thumbnail;
      if (!img?.source) {
        console.log(`   ⚠️  Wikipedia: no image in summary for "${name}"`);
        return null;
      }

      const url = img.source;
      const width = img.width || 0;
      const height = img.height || 0;

      // Reject portrait / extreme panorama aspect ratios
      if (width && height) {
        const aspect = width / height;
        if (aspect < 1.2 || aspect > 3.0) {
          console.log(
            `   ⚠️  Wikipedia: bad aspect ratio ${aspect.toFixed(2)} for "${name}" — skipping`
          );
          return null;
        }
      }

      // Reject SVGs and GIFs
      const lower = url.toLowerCase();
      if (lower.endsWith(".svg") || lower.endsWith(".gif")) {
        console.log(`   ⚠️  Wikipedia: SVG/GIF image — skipping`);
        return null;
      }

      console.log(`   ✅ Wikipedia image found: ${url}`);
      return url;
    } catch (e) {
      console.warn(`   ⚠️  Wikipedia lookup failed: ${e.message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TIER 2A: Gemini landmark/viewpoint resolution
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Ask Gemini (model knowledge only, no search tools) for the single most
   * photographed EXTERIOR building name at a given university.
   * Returns e.g. "Widener Library" or "Memorial Hall", or null on failure.
   */
  async resolveIconicLandmark(universityName) {
    if (!this.genAI) {
      console.log(`   ⚠️  Gemini not available — skipping landmark resolution`);
      return null;
    }

    console.log(`   🏛️  Resolving iconic landmark for: "${universityName}"`);

    try {
      const model = this.genAI.getGenerativeModel({
        model: "gemini-3.1-pro-preview",
        systemInstruction:
          "You are a building name lookup tool. You output ONLY a building name — nothing else. " +
          "No sentences, no explanations, no punctuation other than what is part of the name itself. " +
          "If asked about a university, always reply with just the name of the most iconic EXTERIOR building (not interior spaces), e.g.: Widener Library. Ignore interiors such as auditoriums, theaters, lobbies, atriums, or halls—always prioritize exterior buildings.",
        generationConfig: {
          responseMimeType: "text/plain",
        },
      });
 

      const prompt = `Name the single most iconic, most photographed EXTERIOR building on the campus of "${universityName}". Reply with the building name only.`;

      const result = await model.generateContent(prompt);
      const rawText = result.response.text();
      console.log(`   🏛️  Gemini raw response: "${rawText}"`);
      console.log(`   🏛️  Finish reason: ${result.response.candidates?.[0]?.finishReason}`);

      // Take only the first line — guards against multi-line responses
      const firstLine = rawText.split('\n')[0].trim().replace(/^["'*\-\s]+|["'*\-\s]+$/g, "");

      // Reject if it looks like a sentence fragment (contains verb phrases) or is empty/too long
      const looksLikeSentence = /\b(is|was|are|were|has|have|had|the oldest|built in|located|known as|one of)\b/i.test(firstLine);
      const looksLikeFragment = /^[^a-zA-Z]/.test(firstLine); // starts with non-letter
      if (!firstLine || firstLine.length > 80 || looksLikeSentence || looksLikeFragment) {
        console.log(`   ⚠️  Landmark resolution returned unusable value: "${firstLine}"`);
        return null;
      }

      // Reject generic, non-unique building names that won't produce good search results
      const genericLandmarkNames = /^(university library|main building|administration building|admin building|library|main hall|student center|student centre|academic building|campus center|campus centre|lecture theatre|lecture theater|arts building|science building|engineering building)$/i.test(firstLine);
      if (genericLandmarkNames) {
        console.log(`   ⚠️  Landmark resolution returned generic name — skipping: "${firstLine}"`);
        return null;
      }

      console.log(`   🏛️  Resolved landmark: "${firstLine}"`);
      return firstLine;
    } catch (e) {
      console.warn(`   ⚠️  Landmark resolution failed: ${e.message}`);
      return null;
    }
  }

  /**
   * Ask Gemini for the single most photographed cityscape viewpoint/skyline
   * phrase for a given city.
   * Returns e.g. "Toronto waterfront skyline CN Tower" or "Manhattan skyline from Brooklyn Bridge".
   */
  async resolveIconicCityViewpoint(cityName, country = "") {
    if (!this.genAI) {
      console.log(`   ⚠️  Gemini not available — skipping viewpoint resolution`);
      return null;
    }

    const location = country ? `${cityName}, ${country}` : cityName;
    console.log(`   🌆  Resolving iconic cityscape viewpoint for: "${location}"`);

    try {
      const model = this.genAI.getGenerativeModel({
        model: "gemini-3.1-pro-preview",
        systemInstruction:
          "You are a cityscape search phrase tool. You output ONLY a short search phrase — nothing else. " +
          "No sentences, no explanations, no punctuation other than what is part of the phrase. " +
          "Reply with 3-6 words that describe the most iconic skyline or cityscape view of the city. " +
          "Example output: Toronto waterfront skyline CN Tower",
        generationConfig: {
          responseMimeType: "text/plain",
        },
      });

      const prompt = `Give the most iconic cityscape or skyline search phrase for ${location}.`;

      const result = await model.generateContent(prompt);
      const rawText = result.response.text();
      console.log(`   🌆  Gemini raw response: "${rawText}"`);
      console.log(`   🌆  Finish reason: ${result.response.candidates?.[0]?.finishReason}`);
      const viewpoint = rawText.split('\n')[0].trim().replace(/^["'*\-\s]+|["'*\-\s]+$/g, "");

      if (!viewpoint || viewpoint.length > 100) {
        console.log(`   ⚠️  Viewpoint resolution returned unexpected value: "${viewpoint}"`);
        return null;
      }

      console.log(`   🌆  Resolved viewpoint: "${viewpoint}"`);
      return viewpoint;
    } catch (e) {
      console.warn(`   ⚠️  Viewpoint resolution failed: ${e.message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TIER 2B: Targeted Google CSE search using resolved name
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Search Google CSE for an exterior photo of a specific named landmark
   * at a specific university. Short, clean query — no 40-term negatives.
   */
  async searchSpecificLandmark(landmark, universityName) {
    console.log(`   🔍 Targeted landmark search: "${landmark}" at "${universityName}"`);

    const query = `"${landmark}" "${universityName}" exterior photo`;

    try {
      const url = new URL(this.baseUrl);
      url.searchParams.append("key", this.apiKey);
      url.searchParams.append("cx", this.searchEngineId);
      url.searchParams.append("q", query);
      url.searchParams.append("searchType", "image");
      url.searchParams.append("num", "5");
      url.searchParams.append("imgSize", "large");
      url.searchParams.append("imgType", "photo");
      url.searchParams.append("fileType", "jpg");
      url.searchParams.append("safe", "active");

      const response = await this.cseFetchWithRetry(url);
      if (!response.ok) {
        let errDetail = '';
        try {
          const errBody = await response.json();
          errDetail = errBody?.error?.message || JSON.stringify(errBody);
        } catch (_) {}
        console.warn(`   ⚠️ Landmark CSE Error ${response.status}: ${response.statusText}${errDetail ? ' — ' + errDetail : ''}`);
        return null;
      }

      const data = await response.json();
      if (!data.items?.length) return null;

      for (const item of data.items) {
        const imageUrl = item.link;
        const contextLink = item.image?.contextLink || "";
        const title = item.title || "";
        const allText = `${imageUrl} ${contextLink} ${title}`.toLowerCase();

        if (this.isForbidden(imageUrl)) continue;
        if (this.hasBadKeywords(imageUrl, "university")) continue;

        // Require that the result mentions the university or landmark name
        const uniWords = universityName.split(" ").filter(w => w.length > 3);
        const landmarkWords = landmark.split(" ").filter(w => w.length > 3);
        const mentionsUni = uniWords.some(w => allText.includes(w.toLowerCase()));
        const mentionsLandmark = landmarkWords.some(w => allText.includes(w.toLowerCase()));
        if (!mentionsUni && !mentionsLandmark) {
          console.log(`   ⚠️  Skipping: result doesn't mention university or landmark (${imageUrl})`);
          continue;
        }

        const width = parseInt(item.image?.width);
        const height = parseInt(item.image?.height);
        if (width && height) {
          const aspect = width / height;
          if (aspect < 1.2 || aspect > 2.5) continue;
        }

        console.log(`   ✅ Landmark image found: ${imageUrl}`);
        return imageUrl;
      }
    } catch (e) {
      console.warn(`   ⚠️  Targeted landmark search failed: ${e.message}`);
    }

    return null;
  }

  /**
   * Search Google CSE for a cityscape photo matching a specific viewpoint phrase.
   */
  async searchSpecificCityViewpoint(viewpoint, cityName, country = "") {
    console.log(`   🔍 Targeted viewpoint search: "${viewpoint}" for "${cityName}"`);

    const countryClause = country ? ` "${country}"` : "";
    const query = `"${viewpoint}"${countryClause} cityscape photo`;

    try {
      const url = new URL(this.baseUrl);
      url.searchParams.append("key", this.apiKey);
      url.searchParams.append("cx", this.searchEngineId);
      url.searchParams.append("q", query);
      url.searchParams.append("searchType", "image");
      url.searchParams.append("num", "5");
      url.searchParams.append("imgSize", "large");
      url.searchParams.append("imgType", "photo");
      url.searchParams.append("fileType", "jpg");
      url.searchParams.append("safe", "active");

      const response = await this.cseFetchWithRetry(url);
      if (!response.ok) return null;

      const data = await response.json();
      if (!data.items?.length) return null;

      for (const item of data.items) {
        const imageUrl = item.link;
        if (this.isForbidden(imageUrl)) continue;

        const width = parseInt(item.image?.width);
        const height = parseInt(item.image?.height);
        if (width && height) {
          const aspect = width / height;
          if (aspect < 1.2 || aspect > 2.5) continue;
        }

        console.log(`   ✅ Viewpoint image found: ${imageUrl}`);
        return imageUrl;
      }
    } catch (e) {
      console.warn(`   ⚠️  Targeted viewpoint search failed: ${e.message}`);
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC: searchUniversityImage — 3-tier waterfall
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Find the best EXTERIOR hero image for a university.
   * Tier 1: Wikipedia REST API (curated, free, direct URL)
   * Tier 2: Gemini resolves landmark name → targeted Google CSE search
   * Tier 3: Existing broad Google CSE strategies (fallback)
   */
  async searchUniversityImage(universityName) {
    console.log(`\n🔍 Searching for HERO image: ${universityName}`);
    console.log(`   🎯 Looking for EXTERIOR photo of iconic campus building`);

    // ── Tier 1: Wikipedia ──
    const wikiImage = await this.getWikipediaHeroImage(universityName);
    if (wikiImage) {
      console.log(`✅ Using Wikipedia image for university: ${wikiImage}`);
      return wikiImage;
    }

    // ── Tier 2: Gemini landmark → targeted CSE ──
    console.log(`   🤖 Gemini available for landmark resolution: ${!!this.genAI}`);
    if (this.genAI) {
      const landmark = await this.resolveIconicLandmark(universityName);
      if (landmark) {
        const landmarkImage = await this.searchSpecificLandmark(landmark, universityName);
        if (landmarkImage) {
          console.log(`✅ Using landmark image for university: ${landmarkImage}`);
          return landmarkImage;
        }
      }
    }

    // ── Tier 3: Existing broad CSE strategies ──
    console.log(`   ⬇️  Falling back to broad CSE strategies...`);
    const strategies = [
      {
        name: "Iconic Building Exterior (Best)",
        query: `"${universityName}" iconic building exterior architecture outside photo -interior -inside -indoor -lobby -atrium -hallway -classroom -cafeteria -logo -crest -map -black -white -vintage -drawing -plan -diagram -person -people -crowd -pedestrian -tourist -student -generic -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
      },
      {
        name: "Campus Landmark Exterior",
        query: `"${universityName}" campus landmark exterior building outside architecture photo -interior -inside -indoor -lobby -hallway -atrium -sports -football -stadium -crowd -logo -person -people -pedestrian -tourist -student -group -generic -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
      },
      {
        name: "Famous Campus Building Outside",
        query: `"${universityName}" famous campus building outside exterior daylight photo -interior -inside -indoor -lobby -books -logo -person -people -crowd -pedestrian -generic -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
      },
      {
        name: "University Building Facade",
        query: `"${universityName}" university building facade exterior front architecture photo -interior -inside -indoor -lobby -atrium -logo -crest -person -people -portrait -crowd -pedestrian -tourist -student -group -generic -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
      },
      {
        name: "Campus Exterior View",
        query: `"${universityName}" campus exterior view building architecture outside photo -interior -inside -indoor -map -layout -plan -diagram -person -people -crowd -generic -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
      },
    ];

    return await this.executeStrategies(strategies, "university", universityName);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC: searchCityImage — 3-tier waterfall
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Find the best cityscape image for a city.
   * Tier 1: Wikipedia REST API
   * Tier 2: Gemini resolves best viewpoint phrase → targeted Google CSE search
   * Tier 3: Existing broad Google CSE strategies (fallback)
   */
  async searchCityImage(cityName, country = "") {
    console.log(`\n🔍 Searching for cityscape image: ${cityName}, ${country}`);
    console.log(`   🎯 Looking for city views with many buildings visible`);

    if (!country) {
      console.warn(`   ⚠️  No country provided for ${cityName}, search may be less accurate`);
    }

    // ── Tier 1: Wikipedia ──
    const locationQuery = country ? `${cityName}, ${country}` : cityName;
    const wikiImage = await this.getWikipediaHeroImage(locationQuery);
    if (wikiImage) {
      console.log(`✅ Using Wikipedia image for city: ${wikiImage}`);
      return wikiImage;
    }

    // Try city name alone if combined search failed
    if (country) {
      const wikiImageFallback = await this.getWikipediaHeroImage(cityName);
      if (wikiImageFallback) {
        console.log(`✅ Using Wikipedia image for city (name only): ${wikiImageFallback}`);
        return wikiImageFallback;
      }
    }

    // ── Tier 2: Gemini viewpoint → targeted CSE ──
    console.log(`   🤖 Gemini available for viewpoint resolution: ${!!this.genAI}`);
    if (this.genAI) {
      const viewpoint = await this.resolveIconicCityViewpoint(cityName, country);
      if (viewpoint) {
        const viewpointImage = await this.searchSpecificCityViewpoint(viewpoint, cityName, country);
        if (viewpointImage) {
          console.log(`✅ Using viewpoint image for city: ${viewpointImage}`);
          return viewpointImage;
        }
      }
    }

    // ── Tier 3: Existing broad CSE strategies ──
    console.log(`   ⬇️  Falling back to broad CSE strategies...`);
    const strategies = [
      {
        name: "Cityscape Skyline (Best)",
        query: country
          ? `"${cityName}" "${country}" city skyline many buildings cityscape photo -map -weather -radar -person -people -crowd -pedestrian -tourist -visitor -walking -standing -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`
          : `"${cityName}" city skyline many buildings cityscape photo -map -weather -radar -person -people -crowd -pedestrian -tourist -visitor -walking -standing -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
      },
      {
        name: "Waterfront Cityscape",
        query: country
          ? `"${cityName}" "${country}" waterfront cityscape buildings skyline photo -map -aerial -person -people -crowd -pedestrian -tourist -visitor -walking -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`
          : `"${cityName}" waterfront cityscape buildings skyline photo -map -aerial -person -people -crowd -pedestrian -tourist -visitor -walking -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
      },
      {
        name: "Urban Cityscape",
        query: country
          ? `"${cityName}" "${country}" urban cityscape many buildings city view daylight photo -traffic -map -person -people -crowd -pedestrian -tourist -visitor -walking -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`
          : `"${cityName}" urban cityscape many buildings city view daylight photo -traffic -map -person -people -crowd -pedestrian -tourist -visitor -walking -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
      },
      {
        name: "Landmark with City Buildings",
        query: country
          ? `"${cityName}" "${country}" landmark cityscape buildings urban view photo -map -plan -person -people -crowd -pedestrian -visitor -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`
          : `"${cityName}" landmark cityscape buildings urban view photo -map -plan -person -people -crowd -pedestrian -visitor -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
      },
      {
        name: "Downtown Cityscape",
        query: country
          ? `"${cityName}" "${country}" downtown cityscape buildings architecture photo -map -person -people -crowd -pedestrian -visitor -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`
          : `"${cityName}" downtown cityscape buildings architecture photo -map -person -people -crowd -pedestrian -visitor -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
      },
    ];

    return await this.executeStrategies(strategies, "city", cityName, country);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Core Google CSE execution (Tier 3 fallback)
  // ─────────────────────────────────────────────────────────────────────────────

  async executeStrategies(strategies, type, name = "", country = "") {
    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];

      // Small delay between strategies to avoid burst CSE quota drain
      if (i > 0) await new Promise(r => setTimeout(r, 600));

      console.log(`   Trying strategy: ${strategy.name}...`);

      try {
        const url = new URL(this.baseUrl);
        url.searchParams.append("key", this.apiKey);
        url.searchParams.append("cx", this.searchEngineId);
        url.searchParams.append("q", strategy.query);
        url.searchParams.append("searchType", "image");
        url.searchParams.append("num", "5");
        url.searchParams.append("imgSize", "large");
        url.searchParams.append("imgType", "photo");
        url.searchParams.append("fileType", "jpg"); // direct .jpg files only — no HEAD check needed
        url.searchParams.append("safe", "active");

        const response = await this.cseFetchWithRetry(url);

        if (!response.ok) {
          let errDetail = '';
          try {
            const errBody = await response.json();
            errDetail = errBody?.error?.message || JSON.stringify(errBody);
          } catch (_) {}
          console.warn(`   ⚠️ API Error ${response.status}: ${response.statusText}${errDetail ? ' — ' + errDetail : ''}`);
          continue;
        }

        const data = await response.json();

        if (!data.items || data.items.length === 0) {
          continue;
        }

        for (const item of data.items) {
          const imageUrl = item.link;
          const contextLink = item.image?.contextLink || "";
          const title = item.title || "";

          const allText = `${imageUrl} ${contextLink} ${title}`.toLowerCase();

          // 1. Hard Filter: Forbidden domains/extensions
          if (this.isForbidden(imageUrl)) continue;

          // 2. Hard Filter: Forbidden keywords
          if (this.hasBadKeywords(imageUrl, type)) continue;

          // 3. Real Photo Validation
          const notRealPhotoKeywords = [
            "picture-frame", "picture frame", "framed-", "-framed", "frame-", "-frame",
            "shirt", "t-shirt", "tshirt", "merchandise", "merch", "print-on",
            "print-on-shirt", "on-shirt", "on-tshirt", "apparel", "clothing",
            "mug", "poster-print", "poster print", "canvas-print", "canvas print",
            "art-print", "art print", "rendered", "3d-render", "3d render",
            "cg-render", "cg render", "computer-generated", "artificial",
            "mockup", "mock-up", "template", "placeholder", "illustration",
          ];
          if (notRealPhotoKeywords.some(k => allText.includes(k))) {
            console.log(`   ⚠️  Skipping: Not a real direct photo: ${imageUrl}`);
            continue;
          }

          // 4. Location Validation
          if (name) {
            const nameWords = name.split(" ").filter(w => w.length > 3);

            if (type === "university") {
              const hasUniversityName = nameWords.some(w => allText.includes(w.toLowerCase()));
              if (!hasUniversityName) {
                console.log(`   ⚠️  Skipping: doesn't match university name (${imageUrl})`);
                continue;
              }
            }

            if (type === "city") {
              if (!allText.includes(name.toLowerCase())) {
                console.log(`   ⚠️  Skipping: doesn't match city name "${name}" (${imageUrl})`);
                continue;
              }
              if (country) {
                const wrongCountries = ["japan", "tokyo", "china", "beijing", "shanghai", "korea", "seoul"];
                const hasWrong = wrongCountries.some(wc => allText.includes(wc));
                if (hasWrong && !allText.includes(country.toLowerCase())) {
                  console.log(`   ⚠️  Skipping: wrong country detected (${imageUrl})`);
                  continue;
                }
              }
            }
          }

          // 5. University: reject interior shots
          if (type === "university") {
            const interiorKeywords = [
              "interior", "indoor", "inside", "lobby", "atrium", "hallway", "corridor",
              "classroom", "lecture-hall", "cafeteria", "dining-hall", "laboratory",
              "auditorium-interior", "gym-interior",
            ];
            if (interiorKeywords.some(k => allText.includes(k))) {
              console.log(`   ⚠️  Skipping: interior shot detected (${imageUrl})`);
              continue;
            }
            const genericKeywords = ["generic", "stock-photo", "placeholder", "template"];
            if (genericKeywords.some(k => allText.includes(k))) {
              console.log(`   ⚠️  Skipping: generic/stock image (${imageUrl})`);
              continue;
            }
          }

          // 6. City: prefer cityscape indicators
          if (type === "city") {
            const singleBuildingKeywords = ["single-building", "one-building", "individual-building"];
            const cityscapeKeywords = ["cityscape", "skyline", "urban-landscape", "buildings", "downtown", "waterfront"];
            if (
              singleBuildingKeywords.some(k => allText.includes(k)) &&
              !cityscapeKeywords.some(k => allText.includes(k))
            ) {
              console.log(`   ⚠️  Skipping: single building, need cityscape (${imageUrl})`);
              continue;
            }
          }

          // 7. Aspect Ratio
          const width = parseInt(item.image?.width);
          const height = parseInt(item.image?.height);
          if (width && height) {
            const aspect = width / height;
            if (aspect < 1.2 || aspect > 2.5) {
              console.log(`   Skipping: bad aspect ratio ${aspect.toFixed(2)} (${imageUrl})`);
              continue;
            }
          }

          // 8. URL is a direct .jpg (guaranteed by fileType=jpg param — skip slow HEAD check)
          const lowerUrl = imageUrl.toLowerCase();
          if (!lowerUrl.endsWith(".jpg") && !lowerUrl.endsWith(".jpeg") && !lowerUrl.endsWith(".png") && !lowerUrl.endsWith(".webp")) {
            // Unexpected extension — run quick HEAD check as safety net
            const isValid = await this.isValidImageUrl(imageUrl);
            if (!isValid) {
              console.log(`   ⚠️  Skipping: not a direct image URL: ${imageUrl}`);
              continue;
            }
          }

          console.log(`✅ Found acceptable ${type} image: ${imageUrl}`);
          if (contextLink) console.log(`   📍 Image source: ${contextLink}`);
          return imageUrl;
        }
      } catch (error) {
        console.error(`   ⚠️ Strategy failed: ${error.message}`);
      }
    }

    console.log(`❌ No suitable ${type} image found after all strategies.`);
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Validate a URL is a direct image (used only when fileType=jpg doesn't guarantee extension).
   */
  async isValidImageUrl(url) {
    if (!url || typeof url !== "string") return false;
    const lower = url.toLowerCase();

    const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"];
    if (imageExtensions.some(ext => lower.includes(ext))) {
      return !lower.endsWith(".svg");
    }

    try {
      const response = await fetch(url, { method: "HEAD", redirect: "follow" });
      const contentType = response.headers.get("content-type") || "";
      if (contentType.startsWith("image/")) return true;
      if (contentType.includes("text/html") || contentType.includes("application/")) {
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
   * Wrapper around fetch for Google CSE requests.
   * Automatically retries on 429 Too Many Requests with exponential backoff.
   * Delays: 2s → 4s → 8s → 16s → 32s (up to maxRetries attempts).
   */
  async cseFetchWithRetry(url, maxRetries = 5, baseDelayMs = 2000) {
    let attempt = 0;
    while (true) {
      const response = await fetch(url.toString());
      if (response.status !== 429) return response;

      attempt++;
      if (attempt > maxRetries) {
        console.warn(`   ⚠️  CSE 429 Too Many Requests — max retries (${maxRetries}) exceeded, giving up.`);
        return response;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`   ⏳ CSE 429 Too Many Requests — waiting ${delay / 1000}s before retry ${attempt}/${maxRetries}...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  isForbidden(url) {
    const lower = url.toLowerCase();
    // wikipedia.org (HTML pages) stays blocked; upload.wikimedia.org (direct images) is now allowed
    const badDomains = ["wikipedia.org", "facebook.com", "lookaside.fbsbx.com"];
    const badExts = [".svg", ".gif", ".ico"];

    return (
      badDomains.some(d => lower.includes(d)) ||
      badExts.some(e => lower.endsWith(e))
    );
  }

  hasBadKeywords(url, type) {
    const lower = url.toLowerCase();

    const universalBad = ["logo", "crest", "seal", "map", "diagram", "clipart", "vector", "black-white", "vintage"];

    const peopleBad = [
      "person", "people", "crowd", "crowds", "pedestrian", "pedestrians",
      "tourist", "tourists", "visitor", "visitors", "student", "students",
      "group", "groups", "audience", "fans", "spectator", "spectators",
      "walking", "standing", "sitting", "gathering", "event", "festival",
      "portrait", "portraits", "face", "faces", "human", "humans",
      "child", "children", "kid", "kids", "baby", "babies",
      "running", "playing", "fun", "barefoot", "laughing", "smiling",
    ];

    const notRealPhoto = [
      "picture-frame", "picture frame", "framed", "frame-", "-frame",
      "shirt", "t-shirt", "tshirt", "merchandise", "merch", "print-on",
      "print-on-shirt", "on-shirt", "on-tshirt", "apparel", "clothing",
      "mug", "poster-print", "poster print", "canvas-print", "canvas print",
      "art-print", "art print", "rendered", "3d-render", "3d render",
      "cg-render", "cg render", "computer-generated", "artificial",
      "mockup", "mock-up", "template", "placeholder", "illustration",
      "drawing", "sketch", "painting", "artwork",
    ];

    // University: reject sports, interior/indoor shots
    const uniBad = [
      "stadium", "football", "basketball", "sport", "team", "roster", "coach", "mascot",
      "indoor", "interior", "inside", "lobby", "atrium", "hallway", "corridor",
      "classroom", "lecture", "library-interior", "cafeteria", "dining-hall",
      "lab", "laboratory", "office", "auditorium-interior", "gym-interior",
    ];

    if (universalBad.some(k => lower.includes(k))) return true;
    if (peopleBad.some(k => lower.includes(k))) return true;
    if (notRealPhoto.some(k => lower.includes(k))) return true;

    if (type === "university") {
      return uniBad.some(k => lower.includes(k));
    }

    return false;
  }
}

module.exports = { ImageSearchService };
