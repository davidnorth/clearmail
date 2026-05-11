import OpenAI from 'openai';
import { fixJSON, sleep, parseJSONRobust } from './utils.js';
import { logger } from './logger.js';

const DEEP_BREATH_SUFFIX = `\n\nLet's think step by step and take a deep breath. I will give you a $100,000 reward for ensuring you have correctly classified this email. My career depends on it.`;

export async function classify(email, config) {
  const { subject = '', from = '', body = '' } = email;
  const truncatedBody = body.substring(0, config.behavior.maxEmailChars);

  const client = new OpenAI({
    baseURL: config.provider.baseURL,
    apiKey: config.provider.apiKey,
  });

  const systemPrompt = buildSystemPrompt(config);
  const userPrompt = buildUserPrompt(subject, from, truncatedBody, config);

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await callLLM(client, config.provider.model, systemPrompt, userPrompt);
      const parsed = parseJSONRobust(result);

      return {
        meets_criteria: parsed.meets_criteria ?? parsed.meets_criteria !== false,
        category: parsed.category || config.behavior.unknownLabel,
        explanation: parsed.explanation || 'No explanation provided',
      };
    } catch (err) {
      lastError = err;
      logger.warn(`LLM attempt ${attempt + 1} failed: ${err.message}`);

      // Don't retry on auth errors
      if (err.status === 401 || err.status === 403) {
        throw err;
      }

      if (attempt < 2) {
        const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        await sleep(delay);
      }
    }
  }

  logger.error(`All LLM attempts failed, returning unknown classification`);
  return {
    meets_criteria: false,
    category: config.behavior.unknownLabel,
    explanation: `Classification failed: ${lastError?.message || 'unknown error'}`,
  };
}

function buildSystemPrompt(config) {
  return `You are an email classifier. You will receive an email and must determine:
1. Whether it meets the user's global keep criteria (meets_criteria: true/false)
2. Which single category it belongs to from the list provided
3. A one-sentence explanation of your decision

Respond ONLY with valid JSON in this exact format:
{"meets_criteria": true, "category": "CategoryName", "explanation": "One sentence explanation"}
`;
}

function buildUserPrompt(subject, from, body, config) {
  const categoryNames = config.categories.map(c => c.label);
  const categoriesText = config.categories.map(c => {
    return `=== ${c.label} ===
Keep if:
${c.keepIf || '(no keep rules specified)'}

Reject if:
${c.rejectIf || '(no reject rules specified)'}`;
  }).join('\n\n');

  let prompt = `<email>
<subject>${subject}</subject>
<sender>${from}</sender>
<body>${body}</body>
</email>

<globalRules>
Keep if:
${config.globalRules.keepIf || '(no global keep rules specified)'}

Reject if:
${config.globalRules.rejectIf || '(no global reject rules specified)'}
</globalRules>

<categories>
${categoriesText}
</categories>

Choose EXACTLY ONE category from: [${categoryNames.join(', ')}]

Remember: OUTPUT JSON ONLY. No markdown, no extra text.`;

  if (config.behavior.deepBreathSuffix) {
    prompt += DEEP_BREATH_SUFFIX;
  }

  return prompt;
}

async function callLLM(client, model, systemPrompt, userPrompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await client.chat.completions.create(
      {
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      { signal: controller.signal }
    );

    const content = response.choices[0]?.message?.content || '';
    return fixJSON(content);
  } finally {
    clearTimeout(timeout);
  }
}
