const { z } = require('zod');

/**
 * Zod schema definitions for university data extraction
 * Matches the exact desired output structure for AfroRank
 */

// Allowed programs list for the matching algorithm
const ALLOWED_PROGRAMS = [
  // Engineering & Technology
  'Mechanical', 'Civil', 'Electrical', 'Chemical', 'Aerospace', 'Biomedical Engineering',
  // Computer Science & IT
  'Software Engineering', 'Data Science', 'AI/ML', 'Cybersecurity', 'Information Systems',
  // Business & Management
  'Accounting', 'Finance', 'Marketing', 'Entrepreneurship', 'Supply Chain', 'MBA',
  // Health & Life Sciences
  'Medicine', 'Nursing', 'Pharmacy', 'Public Health', 'Dentistry', 'Physiotherapy',
  // Natural Sciences
  'Biology', 'Chemistry', 'Physics', 'Mathematics', 'Environmental Science',
  // Social Sciences
  'Psychology', 'Sociology', 'Political Science', 'Economics', 'Anthropology',
  // Arts & Humanities
  'History', 'Philosophy', 'Literature', 'Languages', 'Religious Studies', 'Music', 'Fine Art',
  // Law & Legal Studies
  'Law (LLB/JD)', 'International Law', 'Criminal Justice', 'Human Rights',
  // Education
  'Teaching', 'Curriculum Design', 'Educational Psychology', 'Special Education',
  // Architecture & Design
  'Architecture', 'Urban Planning', 'Interior Design', 'Industrial Design',
  // Communications & Media
  'Journalism', 'Film', 'Public Relations', 'Advertising', 'Digital Media',
  // Agriculture & Environment
  'Agronomy', 'Food Science', 'Forestry', 'Sustainability', 'Marine Science',
];

const UniversitySchema = z.object({
  university: z.string().describe('Full name of the university'),

  // --- NEW matching algorithm fields (top-level) ---
  tuition_numeric: z.number().nullable().optional().describe('Annual tuition as a plain integer in USD. No currency symbols, commas, or text.'),
  total_cost_numeric: z.number().nullable().optional().describe('Total annual cost of attendance as a plain integer in USD.'),
  programs: z.array(z.string()).optional().default([]).describe('Academic programs from the predefined allowed list.'),

  location: z.object({
    city: z.string(),
    state: z.string().optional(),
    country: z.string(),
    source: z.string().describe('URL where location was verified'),
    // --- NEW ---
    climate: z.enum(['warm', 'moderate', 'cold']).nullable().optional().describe('General climate classification: warm, moderate, or cold.'),
  }),

  basic_info: z.object({
    founded: z.string().describe('e.g. Est. 1867'), // Changed from number to string to match "Est. 1867" format
    type: z.string().optional().describe('e.g., Public, Private'),
    setting: z.string().optional().describe('e.g., Urban, Rural'),
    campus_type: z.string().optional().describe('e.g. Urban-suburban mix'),
    website: z.string(),
    total_enrollment: z.string().optional(),
    international_students: z.string().optional().describe('e.g. ~11,000 (from 120+ countries)'),
    notable_alumni: z.array(z.string()).optional().describe('List of alumni including African innovators'),
    source: z.string(),
    // --- NEW ---
    campus_setting: z.enum(['urban', 'suburban', 'rural']).nullable().optional().describe('Normalized campus environment: urban, suburban, or rural.'),
    international_students_pct: z.number().nullable().optional().describe('International student percentage as a decimal between 0 and 1.'),
  }),

  cost_of_attendance: z.object({
    academic_year: z.string().optional().describe('e.g., 2024-2025'),
    tuition: z.string().describe('International tuition e.g. $34,500 / year'), // Renamed for simplicity
    books_supplies: z.string().optional(),
    transportation_misc: z.string().optional(),
    average_total: z.string().optional().describe('Total annual cost for international students'),
    average_net_price: z.string().optional().describe('After aid'),
    source: z.string(),
  }),

  diversity_direct: z
    .string()
    .describe('Percent of students of color only (e.g. "42%") — no words, just the value.'),

  tuition_direct: z
    .string()
    .describe('Single tuition amount only, e.g. "$24000" (no words, just the value).'),

  university_image: z
    .string()
    .describe('URL to a high-quality REAL DIRECT PHOTOGRAPH of a distinctive, recognizable campus building specific to this university. Must be a real photo, NOT framed, NOT on merchandise (shirts/mugs/posters), NOT rendered/artificial. Must show the actual distinctive building(s) of this specific university (e.g., grand stone buildings with ivy, red-brick towers, modern glass buildings, traditional architecture). Examples: University of Illinois (stone building with ivy), Howard University (red-brick tower), NYU (modern glass building). PRIORITY: Official .edu page URLs with images (e.g., towson.edu/visit/, university.edu/campus/), case study pages, or partnership sites. Also acceptable: Direct image URLs from credible sources. FORBIDDEN: Wikimedia Commons (upload.wikimedia.org), FineArtAmerica (images.fineartamerica.com), framed images, merchandise, rendered images. REQUIRED.'),

  city_image: z
    .string()
    .describe('URL to a high-quality REAL DIRECT PHOTOGRAPH cityscape image showing many buildings of the city where the university is located. Must be a real photo, NOT framed, NOT on merchandise (shirts/mugs/posters), NOT rendered/artificial. Must show a city view with lots of buildings visible (cityscape/urban landscape/skyline), not a single building. Examples: Chicago (skyline with skyscrapers), Toronto (waterfront skyline), Washington D.C. (Capitol with city context), London (Big Ben with city). Types: city skylines, waterfront cityscapes, urban landscapes with multiple buildings, landmarks with city context. PRIORITY: Official city/tourism page URLs with images. Also acceptable: Direct image URLs from credible sources. FORBIDDEN: Wikimedia Commons (upload.wikimedia.org), FineArtAmerica (images.fineartamerica.com), framed images, merchandise, rendered images. REQUIRED.'),

  university_rating: z
    .string()
    .describe('Overall rating of the university on a scale of 1-5. Provide only the number (e.g., "4", "5", "3"). Based on academic reputation, student satisfaction, facilities, and overall quality. REQUIRED.'),

  city_rating: z
    .string()
    .describe('Overall rating of the city on a scale of 1-5. Provide only the number (e.g., "4", "5", "3"). Based on livability, safety, cost of living, cultural opportunities, and overall quality of life for students. REQUIRED.'),

  scholarships: z.array(
    z.object({
      name: z.string(),
      amount: z.string(),
      eligibility: z.string().describe('Focus on International/African eligibility'),
      link: z.string().describe("Direct URL to this specific scholarship's page"), // REQUIRED
      source: z.string(),
    })
  ).optional(),

  admissions: z.object({
    acceptance_rate: z.string().optional(),
    gpa_thresholds: z.object({
      engineering: z.string().optional().describe('e.g. Highly competitive (3.7+)'),
      arts_sciences: z.string().optional().describe('e.g. Moderate (3.4+)'),
    }).optional(),
    english_proficiency: z.string().optional().describe('Summary e.g. TOEFL (100) / IELTS (7.0)'),
    enrollment_requirements: z.array(z.string()).optional(),
    deadlines: z.object({
      early_action: z.string().optional(),
      regular_decision: z.string().optional(),
    }).optional(),
    visa_info: z.object({
      type: z.string().optional(),
      documents: z.array(z.string()).optional(),
    }).optional(),
    source: z.string(),
    // --- NEW ---
    acceptance_rate_numeric: z.number().nullable().optional().describe('Acceptance rate as a decimal between 0 and 1.'),
    min_gpa: z.number().nullable().optional().describe('Minimum GPA required or recommended, on a 4.0 scale.'),
  }),

  campus_life: z.object({ // Renamed from student_life
    food: z.string().optional().describe('Dining options description'),
    nightlife: z.string().optional(),
    athletics: z.string().optional(),
    diversity: z.string().optional(),
    student_clubs: z.array(z.string()).optional().describe('Focus on African/Black student associations'),
    source: z.string().optional(),
    // --- NEW ---
    has_african_student_association: z.boolean().nullable().optional().describe('Whether the university has an African Student Association or similar organization.'),
  }).optional(),

  roi_outcomes: z.object({
    graduation_rate: z.string().optional(),
    employment_rate: z.string().optional(),
    average_starting_salary: z.string().optional(),
    top_employers: z.array(z.string()).optional(),
    alumni_perks: z.string().optional().describe('Summary of network strength'),
    source: z.string().optional(),
  }).optional(),

  rankings: z.object({
    top_majors: z.array(z.string()).optional(),
    professor_ratings: z.string().optional().describe('e.g. 4.3/5'),
    global_ranking_qs: z.string().optional(),
    overall_national_rank: z.string().describe('Overall national ranking in format "#X in [Country]" (e.g., "#3 in Canada", "#1 in USA", "#5 in UK"). This is the OVERALL ranking, not category-specific. REQUIRED.'),
    us_news_rank: z.string().describe('US News ranking from www.usnews.com. REQUIRED for ALL universities (both US and international). Format: e.g., "#15 in National Universities" or "#3 in Global Universities" or "Not ranked" if not found.'),
    ranking_canada: z.string().optional().describe('National ranking in Canada (e.g., Maclean\'s). Include ONLY if university is in Canada.'),
    ranking_us: z.string().optional().describe('National ranking in US (e.g., US News). Include ONLY if university is in United States.'),
    ranking_uk: z.string().optional().describe('National ranking in UK (e.g., Times/Sunday Times). Include ONLY if university is in United Kingdom.'),
    source: z.string().optional(),
  }).optional(),

  data_verification_notes: z.string().describe(
    'Chain of thought summary: Where was tuition/acceptance rate found? Any discrepancies?'
  ),
});

module.exports = { UniversitySchema, ALLOWED_PROGRAMS };
