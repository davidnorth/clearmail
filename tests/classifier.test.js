import { describe, it, expect } from 'vitest';
import { fixJSON, parseJSONRobust } from '../src/utils.js';

describe('fixJSON', () => {
  it('strips markdown code fences', () => {
    const input = '```json\n{"key": "value"}\n```';
    const result = fixJSON(input);
    expect(result.trim()).toBe('{"key": "value"}');
  });

  it('strips fences without json tag', () => {
    const input = '```\n{"key": "value"}\n```';
    const result = fixJSON(input);
    expect(result.trim()).toBe('{"key": "value"}');
  });

  it('replaces curly double quotes', () => {
    const input = '\u201Chello\u201D: \u201Cworld\u201D';
    const result = fixJSON(input);
    expect(result).toContain('"hello"');
    expect(result).toContain('"world"');
  });

  it('replaces curly single quotes', () => {
    const input = "\u2018text\u2019 and \u2018more\u2019";
    const result = fixJSON(input);
    expect(result).toContain("'text'");
  });

  it('replaces backticks', () => {
    const input = '`key`: `value`';
    const result = fixJSON(input);
    expect(result).toContain("'key'");
    expect(result).toContain("'value'");
  });

  it('removes escaped underscores', () => {
    const input = 'escape\\_this\\_here';
    const result = fixJSON(input);
    expect(result).toContain('escape_this_here');
  });

  it('removes trailing commas in objects', () => {
    const input = '{"a": 1, "b": 2,}';
    const result = fixJSON(input);
    expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
  });

  it('removes trailing commas in arrays', () => {
    const input = '[1, 2, 3,]';
    const result = fixJSON(input);
    expect(JSON.parse(result)).toEqual([1, 2, 3]);
  });

  it('extracts JSON from text with trailing content', () => {
    const input = '{"key": "value"} some extra text';
    const result = fixJSON(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  it('handles text before and after JSON', () => {
    const input = 'Sure! Here is the result: {"key": "value"} Hope that helps!';
    const result = fixJSON(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });
});

describe('parseJSONRobust', () => {
  it('parses valid JSON', () => {
    const result = parseJSONRobust('{"meets_criteria": true, "category": "News", "explanation": "Newsletter about tech"}');
    expect(result).toEqual({
      meets_criteria: true,
      category: 'News',
      explanation: 'Newsletter about tech',
    });
  });

  it('parses JSON with markdown fences', () => {
    const result = parseJSONRobust('```json\n{"meets_criteria": false, "category": "Marketing"}\n```');
    expect(result).toEqual({
      meets_criteria: false,
      category: 'Marketing',
    });
  });

  it('parses JSON with smart quotes used as delimiters', () => {
    // Curly quotes used as JSON delimiters (common LLM quirk)
    const input = '{\u201Cmeets_criteria\u201D: true, \u201Ccategory\u201D: \u201CFinancial\u201D}';
    const result = parseJSONRobust(input);
    expect(result.category).toBe('Financial');
    expect(result.meets_criteria).toBe(true);
  });

  it('parses JSON with trailing content', () => {
    const result = parseJSONRobust('{"meets_criteria": true, "category": "Personal"} Let me know if you need anything else!');
    expect(result.category).toBe('Personal');
  });

  it('handles boolean and string values', () => {
    const result = parseJSONRobust('{"meets_criteria": false, "category": "Financial", "explanation": "Bank statement"}');
    expect(result.meets_criteria).toBe(false);
    expect(result.category).toBe('Financial');
    expect(result.explanation).toBe('Bank statement');
  });

  it('falls back to defaults on unparseable input', () => {
    expect(() => parseJSONRobust('this is not json at all')).toThrow();
  });
});
