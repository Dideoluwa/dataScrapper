const { z } = require('zod');

/**
 * Zod schema definitions for university data extraction
 * Matches the exact desired output structure for AfroRank
 */

const UniversitySchema = z.object({
  university: z.string().describe('Full name of the university'),

  location: z.object({
    city: z.string(),
    state: z.string().optional(),
    country: z.string(),
    source: z.string().describe('URL where location was verified'),
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
  }),

  campus_life: z.object({ // Renamed from student_life
    food: z.string().optional().describe('Dining options description'),
    nightlife: z.string().optional(),
    athletics: z.string().optional(),
    diversity: z.string().optional(),
    student_clubs: z.array(z.string()).optional().describe('Focus on African/Black student associations'),
    source: z.string().optional(),
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
    us_news_ranking: z.string().optional(),
    source: z.string().optional(),
  }).optional(),

  data_verification_notes: z.string().describe(
    'Chain of thought summary: Where was tuition/acceptance rate found? Any discrepancies?'
  ),
});

module.exports = { UniversitySchema };
