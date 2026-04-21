/**
 * Standalone image search test.
 * Tests the full 3-tier waterfall (Wikipedia → Gemini landmark/viewpoint → Google CSE)
 * WITHOUT triggering a full Gemini university/city data extraction.
 *
 * Usage:
 *   node testImages.js university "Harvard University"
 *   node testImages.js city "Toronto" "Canada"
 *   node testImages.js university "Goldsmiths' College"
 *   node testImages.js city "London" "United Kingdom"
 */

const dotenv = require('dotenv');
const { ImageSearchService } = require('./src/imageSearchService');

dotenv.config();

const args = process.argv.slice(2);
const mode = args[0]; // 'university' or 'city'

if (!mode || !['university', 'city'].includes(mode)) {
  console.error('Usage:');
  console.error('  node testImages.js university "University Name"');
  console.error('  node testImages.js city "City Name" "Country"');
  process.exit(1);
}

async function run() {
  const geminiApiKey   = process.env.GEMINI_API_KEY;
  const googleCseApiKey = process.env.GOOGLE_CSE_API_KEY;
  const googleCseId    = process.env.GOOGLE_CSE_ID;

  if (!geminiApiKey) {
    console.error('ERROR: GEMINI_API_KEY not set in .env');
    process.exit(1);
  }
  if (!googleCseApiKey || !googleCseId) {
    console.error('ERROR: GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID must be set in .env');
    process.exit(1);
  }

  const imageService = new ImageSearchService(googleCseApiKey, googleCseId, geminiApiKey);

  console.log('\n═══════════════════════════════════════════════');
  console.log(' IMAGE SEARCH TEST');
  console.log(`  Mode    : ${mode}`);

  let imageUrl = null;

  if (mode === 'university') {
    const universityName = args[1];
    if (!universityName) {
      console.error('ERROR: Provide a university name. e.g. node testImages.js university "Harvard University"');
      process.exit(1);
    }
    console.log(`  Subject : ${universityName}`);
    console.log('═══════════════════════════════════════════════\n');

    imageUrl = await imageService.searchUniversityImage(universityName);

  } else {
    const cityName = args[1];
    const country  = args[2] || '';
    if (!cityName) {
      console.error('ERROR: Provide a city name. e.g. node testImages.js city "Toronto" "Canada"');
      process.exit(1);
    }
    console.log(`  Subject : ${cityName}${country ? ', ' + country : ''}`);
    console.log('═══════════════════════════════════════════════\n');

    imageUrl = await imageService.searchCityImage(cityName, country);
  }

  console.log('\n═══════════════════════════════════════════════');
  if (imageUrl) {
    console.log('  RESULT  : ✅ Image found');
    console.log(`  URL     : ${imageUrl}`);
  } else {
    console.log('  RESULT  : ❌ No image found after all 3 tiers');
  }
  console.log('═══════════════════════════════════════════════\n');
}

run().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
