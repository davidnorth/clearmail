export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function fixJSON(input) {
  let s = input.trim();

  // Strip markdown code fences
  s = s.replace(/^```(?:json)?\s*\n?/i, '');
  s = s.replace(/\n?\s*```\s*$/, '');

  // Fix smart/curly quotes
  s = s.replace(/[\u201C\u201D]/g, '"');
  s = s.replace(/[\u2018\u2019]/g, "'");

  // Fix backticks used as quotes inside JSON values
  s = s.replace(/`/g, "'");

  // Remove escaped underscores
  s = s.replace(/\\_/g, '_');

  // Remove trailing commas before closing brackets/braces
  s = s.replace(/,(\s*[}\]])/g, '$1');

  // Try to extract JSON object if there's trailing text
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    s = s.substring(firstBrace, lastBrace + 1);
  }

  return s;
}

export function parseJSONRobust(text) {
  try {
    return JSON.parse(fixJSON(text));
  } catch (e1) {
    // Retry with more aggressive fixing
    let s = fixJSON(text);
    // Replace single quotes with double quotes for JSON keys/values
    // But only for JSON-like structure, not for content within string values
    s = s.replace(/'/g, '"');
    try {
      return JSON.parse(s);
    } catch (e2) {
      throw new Error(`Failed to parse JSON after multiple attempts: ${e2.message}`);
    }
  }
}
