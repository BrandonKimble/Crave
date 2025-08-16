/**
 * Extractor Utilities
 *
 * Pure functions for extracting data from various formats.
 * Replaces multiple extractor services with simple, testable functions.
 */

/**
 * Extract mentions of restaurants from text
 */
export function extractRestaurantMentions(text: string): string[] {
  // Common patterns for restaurant mentions
  const patterns = [
    /(?:at|from|to|visited|tried|went to|ate at|dined at)\s+([A-Z][A-Za-z'\s&-]+)/g,
    /([A-Z][A-Za-z'\s&-]+)(?:'s|'s)?(?:\s+restaurant|\s+cafe|\s+bar|\s+grill|\s+kitchen|\s+bbq)/gi,
  ];

  const mentions = new Set<string>();

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = match[1].trim();
      if (name.length > 2 && name.length < 50) {
        mentions.add(name);
      }
    }
  }

  return Array.from(mentions);
}

/**
 * Extract dish/food mentions from text
 */
export function extractDishMentions(text: string): string[] {
  // Common food patterns
  const patterns = [
    /(?:ordered|had|tried|got|recommend|loved?)\s+(?:the\s+)?([a-z][a-z\s-]+)/gi,
    /(?:their|the)\s+([a-z][a-z\s-]+)\s+(?:is|was|were)\s+(?:amazing|great|good|delicious|fantastic)/gi,
  ];

  const mentions = new Set<string>();

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const dish = match[1].trim().toLowerCase();
      if (dish.length > 2 && dish.length < 50) {
        mentions.add(dish);
      }
    }
  }

  return Array.from(mentions);
}

/**
 * Extract URLs from text
 */
export function extractUrls(text: string): string[] {
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  return text.match(urlPattern) || [];
}

/**
 * Extract Reddit usernames from text
 */
export function extractRedditUsernames(text: string): string[] {
  const usernamePattern = /(?:^|[^a-zA-Z0-9_])(?:u\/|\/u\/)([a-zA-Z0-9_-]+)/g;
  const matches = text.matchAll(usernamePattern);
  return Array.from(matches, (m) => m[1]);
}

/**
 * Extract subreddit references from text
 */
export function extractSubreddits(text: string): string[] {
  const subredditPattern = /(?:^|[^a-zA-Z0-9_])(?:r\/|\/r\/)([a-zA-Z0-9_]+)/g;
  const matches = text.matchAll(subredditPattern);
  return Array.from(matches, (m) => m[1]);
}

/**
 * Extract addresses from text
 */
export function extractAddresses(
  text: string,
): Array<{ street?: string; city?: string; state?: string; zip?: string }> {
  const addresses: Array<{
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  }> = [];

  // US address pattern
  const addressPattern =
    /(\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct))\s*,?\s*([A-Za-z\s]+)\s*,?\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/gi;

  const matches = text.matchAll(addressPattern);
  for (const match of matches) {
    addresses.push({
      street: match[1].trim(),
      city: match[2].trim(),
      state: match[3].trim(),
      zip: match[4].trim(),
    });
  }

  return addresses;
}

/**
 * Extract price mentions from text
 */
export function extractPrices(
  text: string,
): Array<{ amount: number; context?: string }> {
  const pricePattern = /\$(\d+(?:\.\d{2})?)\s*(?:for\s+)?([a-z\s]+)?/gi;
  const prices: Array<{ amount: number; context?: string }> = [];

  const matches = text.matchAll(pricePattern);
  for (const match of matches) {
    prices.push({
      amount: parseFloat(match[1]),
      context: match[2]?.trim(),
    });
  }

  return prices;
}

/**
 * Extract ratings/scores from text
 */
export function extractRatings(
  text: string,
): Array<{ rating: number; scale: number }> {
  const ratings: Array<{ rating: number; scale: number }> = [];

  // Common rating patterns
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:out of|\/)\s*(\d+)/gi, // "8 out of 10", "4.5/5"
    /(\d+(?:\.\d+)?)\s*stars?/gi, // "4.5 stars"
    /rated?\s+(?:it\s+)?(\d+(?:\.\d+)?)/gi, // "rated 8.5"
  ];

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[2]) {
        ratings.push({
          rating: parseFloat(match[1]),
          scale: parseFloat(match[2]),
        });
      } else {
        // Assume 5-star scale for star ratings
        ratings.push({
          rating: parseFloat(match[1]),
          scale: 5,
        });
      }
    }
  }

  return ratings;
}

/**
 * Extract sentiment indicators from text
 */
export function extractSentiment(text: string): {
  positive: string[];
  negative: string[];
  score: number;
} {
  const positive = [
    'amazing',
    'excellent',
    'fantastic',
    'great',
    'wonderful',
    'delicious',
    'perfect',
    'outstanding',
    'incredible',
    'best',
    'love',
    'loved',
    'recommend',
    'must try',
    'favorite',
    'awesome',
    'phenomenal',
  ];

  const negative = [
    'terrible',
    'awful',
    'horrible',
    'bad',
    'worst',
    'disgusting',
    'disappointing',
    'poor',
    'mediocre',
    'overrated',
    'avoid',
    'never again',
    'waste',
    'bland',
    'cold',
    'rude',
    'slow',
  ];

  const lowerText = text.toLowerCase();
  const foundPositive: string[] = [];
  const foundNegative: string[] = [];

  for (const word of positive) {
    if (lowerText.includes(word)) {
      foundPositive.push(word);
    }
  }

  for (const word of negative) {
    if (lowerText.includes(word)) {
      foundNegative.push(word);
    }
  }

  // Simple sentiment score (-1 to 1)
  const score =
    (foundPositive.length - foundNegative.length) /
    Math.max(1, foundPositive.length + foundNegative.length);

  return {
    positive: foundPositive,
    negative: foundNegative,
    score,
  };
}

/**
 * Extract metadata from Reddit post/comment
 */
export function extractRedditMetadata(item: any): {
  id: string;
  author: string;
  subreddit: string;
  score: number;
  created: Date;
  edited: boolean;
  awards: number;
  permalink: string;
} {
  return {
    id: item.id || item.name?.replace(/^t[0-9]_/, '') || '',
    author: item.author || '[deleted]',
    subreddit: item.subreddit || '',
    score: item.score || item.ups || 0,
    created: new Date((item.created_utc || item.created || 0) * 1000),
    edited: Boolean(item.edited),
    awards: item.total_awards_received || 0,
    permalink: item.permalink || '',
  };
}

/**
 * Extract key phrases using simple NLP
 */
export function extractKeyPhrases(
  text: string,
  maxPhrases: number = 5,
): string[] {
  // Remove common words
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'as',
    'is',
    'was',
    'are',
    'were',
    'been',
    'be',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'should',
    'could',
    'may',
    'might',
    'must',
    'can',
    'this',
    'that',
    'these',
    'those',
    'i',
    'you',
    'he',
    'she',
    'it',
    'we',
    'they',
  ]);

  // Split into words and filter
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  // Count word frequency
  const frequency = new Map<string, number>();
  for (const word of words) {
    frequency.set(word, (frequency.get(word) || 0) + 1);
  }

  // Sort by frequency and return top phrases
  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxPhrases)
    .map(([word]) => word);
}

/**
 * Extract structured data from LLM response
 */
export function extractStructuredData<T>(
  text: string,
  schema: {
    [K in keyof T]: RegExp | ((text: string) => T[K]);
  },
): Partial<T> {
  const result: Partial<T> = {};

  for (const [key, extractor] of Object.entries(schema)) {
    if (extractor instanceof RegExp) {
      const match = text.match(extractor);
      if (match) {
        (result as any)[key] = match[1] || match[0];
      }
    } else if (typeof extractor === 'function') {
      (result as any)[key] = extractor(text);
    }
  }

  return result;
}
