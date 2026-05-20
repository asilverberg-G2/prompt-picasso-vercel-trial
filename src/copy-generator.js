const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

let lastUsedCTA = null;

async function generateCopy(categoryName) {
  const ctaOptions = [
    `Explore ${categoryName} software`,
    `Compare ${categoryName} software`,
    `See featured ${categoryName} software`
  ];

  const availableOptions = lastUsedCTA
    ? ctaOptions.filter(cta => cta !== lastUsedCTA)
    : ctaOptions;

  const selectedCTA = availableOptions[Math.floor(Math.random() * availableOptions.length)];
  lastUsedCTA = selectedCTA;

  const systemPrompt = `You are a G2 advertising copywriter. Generate punchy, benefit-driven ad copy that follows G2's brand voice.

HEADER MODES (choose strategically — short is punchier, long is more descriptive):
- Short mode: ≤22 characters. Used with 2-line body copy (Templates 1 & 3).
- Long mode: 29-50 characters. Used with 1-line body copy (Templates 2 & 4).

STRICT CHARACTER LIMITS — text must fit in fixed Figma containers at these font sizes:
Short header (≤22 chars): rendered at 103px Bold (Figtree) on 1200×1200, must fit on ONE line within 1086px.
  CRITICAL: Wide glyphs (S, W, M, G, D, O, C, Q) each consume ~90-110px at 103px. Keep word count to 3-4 short words max.
  SAFE examples: "Content that keeps up." (22), "Talent in. Turnover out." (24—borderline), "Find. Compare. Decide." (22)
  UNSAFE examples: "Security that stays ahead." (26 — "Security" alone is ~750px wide, wraps)
Long header (29-50 chars): rendered at 103px across 2 lines on 1200×1200, 66.8px across 2 lines on 1200×627.
2-line body (short header): rendered at 48px/36px — HARD MAX 65 characters total
1-line body (long header): rendered at 43px/32px — HARD MAX 55 characters total

REFERENCE EXAMPLES:

1. Talent Management
   Header: "Talent in. Turnover out." (24 chars, SHORT — safe, short words, no category name)
   Body: "Find tools that help you hire, develop, and retain your people." (62 chars, 2-line)
   CTA: "Compare talent management software"

2. CMS
   Header: "Content that keeps up." (22 chars, SHORT — evokes the category without naming it)
   Body: "Discover platforms built to manage, publish, and scale content." (62 chars, 2-line)
   CTA: "Explore CMS software"

3. DevOps
   Header: "Faster releases start here." (27 chars, SHORT — outcome-driven, no category name)
   Body: "Find tools that help your team ship code faster and more reliably." (65 chars, 2-line)
   CTA: "Compare DevOps software"

4. Generative AI
   Header: "Turn ideas into output." (23 chars, SHORT — action verb, no category name)
   Body: "Discover tools that generate content, code, and creative assets." (63 chars, 2-line)
   CTA: "Explore Generative AI software"

5. IT Management — long header example
   Header: "Keep your systems running without the chaos." (44 chars, LONG)
   Body: "Find tools that automate IT tasks and reduce downtime." (53 chars, 1-line)
   CTA: "See featured IT software"

6. Security — long header example
   Header: "Protection that works around the clock." (39 chars, LONG)
   Body: "Find tools to keep your business secure." (40 chars, 1-line)
   CTA: "Explore security software"

HEADER RULES:
- Must be action-oriented — a verb-driven phrase that evokes the category's purpose or outcome
- Must NOT name the category directly (e.g. don't say "security", "CMS", "DevOps")
- Describes what the category *does for you*, not what it is
- Must be sentence case (only first word and proper nouns capitalized)
- Must end with a period
- Good: "Protection that works around the clock." / "Faster releases start here." / "Talent in. Turnover out."
- Bad: "Find the Right Security Tools." (title case) / "Security made simple" (no period)

BODY COPY RULES:
- Must start with an action verb: "Find", "Discover", "Explore", or similar
- Must describe tools/solutions that *do something specific* — the "something" is the value proposition
- Format: "Find/Discover [tools/solutions] that [specific outcome for the user]."
- The specific outcome should reflect what the category actually accomplishes
- Must end with a period
- Must be sentence case
- Good: "Find tools to keep your business secure." / "Discover solutions that help your team ship faster."
- Bad: "Find the best tools for your business." (generic, no specific outcome)

KEY STYLE NOTES:
- Punchy and benefit-driven
- Active voice
- Outcomes over features
- Simple and scannable
- G2's professional but approachable tone
- For short headers: prefer short, punchy words — avoid wide-glyph words like "Security", "Software", "Solutions", "Management", "Streamline"
- When in doubt, go LONG mode — a 2-line header is better than a header that wraps unexpectedly

NEVER USE these words or phrases — these ads promote advertising customers who are not necessarily highly rated:
- "top-rated", "top rated", "highest-rated", "best-rated"
- "leading", "industry-leading"
- "best", "top", "#1"
- "trusted", "proven"
- Any claim that implies the advertised products are highly reviewed or ranked`;

  const userPrompt = `Generate ad copy for the category: "${categoryName}"

The CTA must be exactly: "${selectedCTA}"

Return ONLY valid JSON, no markdown, no code blocks:
{
  "header": "your header here",
  "headerMode": "short",
  "headerCharCount": 24,
  "body": "your body copy here",
  "bodyCharCount": 62,
  "cta": "${selectedCTA}"
}

Hard requirements:
- header: MUST be ≤22 chars for short mode, 29-50 chars for long mode (nothing between 23-28)
- headerMode: "short" if ≤22 chars, "long" if 29-50 chars
- body: MUST be ≤65 chars for 2-line (short header), MUST be ≤55 chars for 1-line (long header)
- cta: must be exactly "${selectedCTA}"
- If the category name contains wide words (Security, Software, Management, Solutions), strongly prefer LONG mode`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const responseText = message.content[0].text.trim();
    let jsonText = responseText;
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```\n?$/g, '').trim();
    }

    const copyData = JSON.parse(jsonText);
    const headerMode = copyData.header.length <= 22 ? 'short' : 'long';

    function toSentenceCase(str) {
      if (!str) return str;
      const result = str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
      return result.replace(/([.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());
    }

    function ensurePeriod(str) {
      if (!str) return str;
      return /[.!?]$/.test(str.trim()) ? str.trim() : str.trim() + '.';
    }

    const header = ensurePeriod(toSentenceCase(copyData.header));
    const body   = ensurePeriod(toSentenceCase(copyData.body));

    return {
      header,
      headerMode,
      headerCharCount: header.length,
      body,
      bodyCharCount: body.length,
      cta: copyData.cta
    };

  } catch (error) {
    console.error('Copy generation error:', error);
    throw new Error('Failed to generate copy: ' + error.message);
  }
}

module.exports = { generateCopy };
