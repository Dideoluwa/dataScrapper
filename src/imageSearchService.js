class ImageSearchService {
    constructor(apiKey, searchEngineId) {
      this.apiKey = apiKey;
      this.searchEngineId = searchEngineId;
      this.baseUrl = "https://www.googleapis.com/customsearch/v1";
    }

    /**
     * Validate if a URL is a direct image URL (not a page URL)
     * Returns true if it's a direct image, false otherwise
     */
    async isValidImageUrl(url) {
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
     * Search for the "Hero Shot" of a university campus.
     * Target: Distinctive, recognizable campus buildings specific to this university (like the examples shown).
     * Examples: Grand stone buildings with ivy, red-brick towers, modern glass buildings, traditional architecture.
     * Avoid: Logos, sports crowds, black & white, vintage, indoor classrooms, people, crowds, generic buildings.
     */
    async searchUniversityImage(universityName) {
      console.log(`\n🔍 Searching for HERO image: ${universityName}`);
      console.log(`   🎯 Looking for distinctive campus building specific to this university`);
  
      // Strategy: Focus on finding the actual distinctive buildings of this specific university
      // Use quotes to ensure exact university name match
      const strategies = [
        {
          name: "Distinctive Campus Building (Best)",
          // Find the actual recognizable building of this university - REAL PHOTO only
          query: `"${universityName}" campus building distinctive architecture exterior photo -logo -crest -map -black -white -vintage -drawing -plan -diagram -person -people -crowd -pedestrian -tourist -student -generic -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
        },
        {
          name: "Iconic Main Building",
          // The main/iconic building that represents this university - REAL PHOTO only
          query: `"${universityName}" main building iconic architecture campus exterior photo -sports -football -stadium -crowd -logo -person -people -pedestrian -tourist -student -group -generic -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
        },
        {
          name: "Campus Architecture Building",
          // Specific architectural style of this university - REAL PHOTO only
          query: `"${universityName}" campus architecture building exterior daylight photo -interior -books -logo -person -people -crowd -pedestrian -generic -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
        },
        {
          name: "University Building Exterior",
          // General but still specific to this university - REAL PHOTO only
          query: `"${universityName}" university building exterior architecture photo -logo -crest -person -people -portrait -indoor -crowd -pedestrian -tourist -student -group -generic -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
        },
        {
          name: "Campus View with Building",
          // Campus view showing the building - REAL PHOTO only
          query: `"${universityName}" campus view building architecture photo -map -layout -plan -diagram -person -people -crowd -generic -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
        },
      ];
  
      return await this.executeStrategies(strategies, "university", universityName);
    }
  
    /**
     * Search for cityscape images showing many buildings.
     * Target: City views with lots of buildings visible (cityscape/urban landscape), no people.
     * Avoid: Maps, single buildings, traffic, people, crowds, pedestrians.
     */
    async searchCityImage(cityName, country = "") {
      console.log(`\n🔍 Searching for cityscape image: ${cityName}, ${country}`);
      console.log(`   🎯 Looking for city views with many buildings visible - urban landscape/cityscape`);
      
      // CRITICAL: Always include country to avoid confusion (e.g., "Montreal Canada" not just "Montreal")
      // This prevents getting images from wrong cities with same name
      if (!country) {
        console.warn(`   ⚠️  No country provided for ${cityName}, search may be less accurate`);
      }
      const location = country ? `${cityName} ${country}` : cityName;
      
      // Get city name in lowercase for validation
      const cityNameLower = cityName.toLowerCase();
      const countryLower = country ? country.toLowerCase() : '';
  
      const strategies = [
        {
          name: "Cityscape Skyline (Best)",
          // City skyline showing many buildings - like Chicago, Toronto examples - REAL PHOTO only
          query: country 
            ? `"${cityName}" "${country}" city skyline many buildings cityscape photo -map -weather -radar -person -people -crowd -pedestrian -tourist -visitor -walking -standing -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`
            : `"${cityName}" city skyline many buildings cityscape photo -map -weather -radar -person -people -crowd -pedestrian -tourist -visitor -walking -standing -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
        },
        {
          name: "Waterfront Cityscape",
          // Waterfront view with city buildings - like Toronto example - REAL PHOTO only
          query: country
            ? `"${cityName}" "${country}" waterfront cityscape buildings skyline photo -map -aerial -person -people -crowd -pedestrian -tourist -visitor -walking -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`
            : `"${cityName}" waterfront cityscape buildings skyline photo -map -aerial -person -people -crowd -pedestrian -tourist -visitor -walking -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
        },
        {
          name: "Urban Cityscape",
          // Urban landscape with many buildings - like Manchester example - REAL PHOTO only
          query: country
            ? `"${cityName}" "${country}" urban cityscape many buildings city view daylight photo -traffic -map -person -people -crowd -pedestrian -tourist -visitor -walking -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`
            : `"${cityName}" urban cityscape many buildings city view daylight photo -traffic -map -person -people -crowd -pedestrian -tourist -visitor -walking -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
        },
        {
          name: "Landmark with City Buildings",
          // Landmark with city context showing buildings - like Washington D.C., London, Quebec examples - REAL PHOTO only
          query: country
            ? `"${cityName}" "${country}" landmark cityscape buildings urban view photo -map -plan -person -people -crowd -pedestrian -visitor -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`
            : `"${cityName}" landmark cityscape buildings urban view photo -map -plan -person -people -crowd -pedestrian -visitor -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
        },
        {
          name: "Downtown Cityscape",
          // Downtown area showing many buildings - REAL PHOTO only
          query: country
            ? `"${cityName}" "${country}" downtown cityscape buildings architecture photo -map -person -people -crowd -pedestrian -visitor -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`
            : `"${cityName}" downtown cityscape buildings architecture photo -map -person -people -crowd -pedestrian -visitor -single -one -frame -framed -shirt -merchandise -print -rendered -mockup -template`,
        },
      ];
  
      return await this.executeStrategies(strategies, "city", cityName, country);
    }
  
    /**
     * Core execution logic to try strategies in order.
     * @param {string} name - University name or city name for validation
     * @param {string} country - Country name for city validation (optional)
     */
    async executeStrategies(strategies, type, name = "", country = "") {
      for (const strategy of strategies) {
        console.log(`   Trying strategy: ${strategy.name}...`);
  
        try {
          const url = new URL(this.baseUrl);
          url.searchParams.append("key", this.apiKey);
          url.searchParams.append("cx", this.searchEngineId);
          url.searchParams.append("q", strategy.query);
          url.searchParams.append("searchType", "image");
          url.searchParams.append("num", "5"); // Get more results for better validation
          url.searchParams.append("imgSize", "large"); // CRITICAL: Only large images
          url.searchParams.append("imgType", "photo"); // CRITICAL: No clipart/lineart
          url.searchParams.append("safe", "active");
  
          const response = await fetch(url.toString());
  
          if (!response.ok) {
            console.warn(`   ⚠️ API Error ${response.status}: ${response.statusText}`);
            continue;
          }
  
          const data = await response.json();
  
          if (!data.items || data.items.length === 0) {
            continue;
          }
  
          // Filter results locally to find the best candidate
          for (const item of data.items) {
            const imageUrl = item.link;
            const contextLink = item.image?.contextLink || "";
            const title = item.title || "";
            
            // Combine URL, context link, and title for validation
            const allText = `${imageUrl} ${contextLink} ${title}`.toLowerCase();
  
            // 1. Hard Filter: Forbidden domains/extensions
            if (this.isForbidden(imageUrl)) continue;
  
            // 2. Hard Filter: Forbidden keywords (Double Check)
            if (this.hasBadKeywords(imageUrl, type)) continue;
            
            // 2.5. CRITICAL: Real Photo Validation - reject framed/merchandise/artificial images
            const notRealPhotoKeywords = [
              "picture-frame", "picture frame", "framed-", "-framed", "frame-", "-frame",
              "shirt", "t-shirt", "tshirt", "merchandise", "merch", "print-on",
              "print-on-shirt", "on-shirt", "on-tshirt", "apparel", "clothing",
              "mug", "poster-print", "poster print", "canvas-print", "canvas print",
              "art-print", "art print", "rendered", "3d-render", "3d render",
              "cg-render", "cg render", "computer-generated", "artificial",
              "mockup", "mock-up", "template", "placeholder", "illustration"
            ];
            const hasNotRealPhoto = notRealPhotoKeywords.some(keyword => allText.includes(keyword));
            if (hasNotRealPhoto) {
              console.log(`   ⚠️  Skipping: Not a real direct photo (framed/merchandise/artificial): ${imageUrl}`);
              continue;
            }

            // 3. CRITICAL: Location Validation - ensure image matches the correct location
            if (name) {
              const nameLower = name.toLowerCase();
              const nameWords = name.split(' ').filter(w => w.length > 3); // Get significant words
              
              // For university: must contain at least one significant word from university name
              if (type === "university") {
                const hasUniversityName = nameWords.some(word => 
                  allText.includes(word.toLowerCase())
                );
                if (!hasUniversityName) {
                  console.log(`   ⚠️  Skipping: Image doesn't match university name (${imageUrl})`);
                  continue;
                }
              }
              
              // For city: must contain city name AND country (if provided)
              if (type === "city") {
                const cityNameLower = nameLower;
                const hasCityName = allText.includes(cityNameLower);
                
                if (!hasCityName) {
                  console.log(`   ⚠️  Skipping: Image doesn't match city name "${name}" (${imageUrl})`);
                  continue;
                }
                
                // If country is provided, strongly prefer images that mention the country
                if (country) {
                  const countryLower = country.toLowerCase();
                  const hasCountry = allText.includes(countryLower);
                  
                  // Check for wrong countries (common mistakes)
                  const wrongCountries = ["japan", "tokyo", "china", "beijing", "shanghai", "korea", "seoul"];
                  const hasWrongCountry = wrongCountries.some(wc => allText.includes(wc));
                  
                  if (hasWrongCountry && !hasCountry) {
                    console.log(`   ⚠️  Skipping: Image appears to be from wrong country (${imageUrl})`);
                    continue;
                  }
                  
                  // Prefer images with country, but don't reject if city name is clear
                  if (!hasCountry) {
                    console.log(`   ⚠️  Warning: Image doesn't mention country "${country}", but city name matches`);
                  }
                }
              }
            }
  
            // 4. For university images: Ensure it shows distinctive campus building
            if (type === "university") {
              // Good indicators: campus, building, architecture, exterior
              const campusKeywords = ["campus", "building", "architecture", "exterior", "university"];
              const hasCampusKeywords = campusKeywords.some(keyword => allText.includes(keyword));
              
              // Penalize generic/non-campus keywords
              const genericKeywords = ["generic", "stock-photo", "placeholder", "template"];
              const hasGenericKeywords = genericKeywords.some(keyword => allText.includes(keyword));
              
              if (hasGenericKeywords) {
                console.log(`   ⚠️  Skipping: Appears to be generic/stock image, need distinctive campus building (${imageUrl})`);
                continue;
              }
              
              // Prefer images with campus/building keywords
              if (hasCampusKeywords) {
                console.log(`   ✅ Campus building detected: Image shows distinctive university building`);
              }
            }
            
            // 5. For city images: Prioritize cityscape/many buildings views
            if (type === "city") {
              const cityscapeKeywords = ["cityscape", "skyline", "urban-landscape", "many-buildings", "city-view", "buildings", "downtown", "waterfront", "landmark"];
              const hasCityscapeKeywords = cityscapeKeywords.some(keyword => allText.includes(keyword));
              
              // Penalize single building keywords
              const singleBuildingKeywords = ["single-building", "one-building", "individual-building"];
              const hasSingleBuilding = singleBuildingKeywords.some(keyword => allText.includes(keyword));
              
              if (hasSingleBuilding && !hasCityscapeKeywords) {
                console.log(`   ⚠️  Skipping: Appears to show single building, need cityscape with many buildings (${imageUrl})`);
                continue;
              }
              
              // Prefer images with cityscape keywords
              if (hasCityscapeKeywords) {
                console.log(`   ✅ Cityscape detected: Image shows many buildings`);
              }
            }
  
            // 6. Quality Check: Aspect Ratio (Prefer landscape for app headers)
            const width = parseInt(item.image.width);
            const height = parseInt(item.image.height);
            if (width && height) {
               const aspect = width / height;
               // Reject vertical images (e.g. portraits/phone wallpapers) or extreme panoramas
               if (aspect < 1.2 || aspect > 2.5) {
                   console.log(`   Skipping: Bad aspect ratio ${aspect.toFixed(2)} (${imageUrl})`);
                   continue;
               }
            }

            // 7. CRITICAL: Validate that URL is a direct image URL, not a page URL
            console.log(`   🔍 Validating image URL...`);
            const isValidImage = await this.isValidImageUrl(imageUrl);
            if (!isValidImage) {
              console.log(`   ⚠️  Skipping: URL is not a direct image URL (likely a page URL): ${imageUrl}`);
              continue;
            }

            console.log(`✅ Found acceptable ${type} image: ${imageUrl}`);
            if (contextLink) {
              console.log(`   📍 Image source: ${contextLink}`);
            }
            return imageUrl; // Return the first one that passes strict checks
          }
  
        } catch (error) {
          console.error(`   ⚠️ Strategy failed: ${error.message}`);
        }
      }
  
      console.log(`❌ No suitable ${type} image found after all strategies.`);
      return null;
    }
  
    isForbidden(url) {
      const lower = url.toLowerCase();
      const badDomains = ["wikimedia.org", "wikipedia.org", "facebook.com", "lookaside.fbsbx.com"];
      const badExts = [".svg", ".gif", ".ico"];
  
      return (
        badDomains.some(d => lower.includes(d)) ||
        badExts.some(e => lower.endsWith(e))
      );
    }
  
    hasBadKeywords(url, type) {
      const lower = url.toLowerCase();
      
      // Universal negatives
      const universalBad = ["logo", "crest", "seal", "map", "diagram", "clipart", "vector", "black-white", "vintage"];
      
      // People/crowd negatives (applies to both university and city)
      const peopleBad = [
        "person", "people", "crowd", "crowds", "pedestrian", "pedestrians",
        "tourist", "tourists", "visitor", "visitors", "student", "students",
        "group", "groups", "audience", "fans", "spectator", "spectators",
        "walking", "standing", "sitting", "gathering", "event", "festival",
        "portrait", "portraits", "face", "faces", "human", "humans"
      ];
      
      // Framed/merchandise/artificial images (NOT real direct photos)
      const notRealPhoto = [
        "picture-frame", "picture frame", "framed", "frame-", "-frame",
        "shirt", "t-shirt", "tshirt", "merchandise", "merch", "print-on",
        "print-on-shirt", "on-shirt", "on-tshirt", "apparel", "clothing",
        "mug", "poster-print", "poster print", "canvas-print", "canvas print",
        "art-print", "art print", "rendered", "3d-render", "3d render",
        "cg-render", "cg render", "computer-generated", "artificial",
        "mockup", "mock-up", "template", "placeholder", "illustration",
        "drawing", "sketch", "painting", "artwork"
      ];
      
      // University specific negatives
      const uniBad = ["stadium", "football", "basketball", "sport", "team", "roster", "coach", "mascot", "indoor", "classroom", "cafeteria"];
  
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
  