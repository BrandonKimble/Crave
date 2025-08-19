/**
 * Calculate Collection Window Utility
 * 
 * Implements PRD Section 5.1.2 safety buffer equation:
 * safe_interval = (750_posts / avg_posts_per_day)
 * 
 * This utility calculates the appropriate timestamp for testing
 * to ensure we collect the target number of posts (750-1000)
 */

export interface SubredditVolumeData {
  subreddit: string;
  avgPostsPerDay: number;
  targetPosts: number;
}

export interface CollectionWindow {
  subreddit: string;
  avgPostsPerDay: number;
  targetPosts: number;
  calculatedDays: number;
  constrainedDays: number;
  fromTimestamp: number;
  fromDate: Date;
  toDate: Date;
  expectedPosts: number;
  reasoning: string;
}

// PRD constants
const MIN_INTERVAL_DAYS = 7;
const MAX_INTERVAL_DAYS = 60;
const DEFAULT_TARGET_POSTS = 750;

// Known subreddit volumes from PRD
const SUBREDDIT_VOLUMES: Record<string, number> = {
  austinfood: 15,    // ~15 posts/day per PRD
  FoodNYC: 40,       // ~40 posts/day per PRD  
  foodnyc: 40,       // alias
  AustinFood: 15,    // alias
};

/**
 * Calculate the collection window for a subreddit
 * @param subreddit - The subreddit name
 * @param targetPosts - Target number of posts to collect (default: 750)
 * @param customAvgPostsPerDay - Override the default posting volume
 */
export function calculateCollectionWindow(
  subreddit: string,
  targetPosts: number = DEFAULT_TARGET_POSTS,
  customAvgPostsPerDay?: number
): CollectionWindow {
  // Get average posts per day
  const avgPostsPerDay = customAvgPostsPerDay || 
    SUBREDDIT_VOLUMES[subreddit] || 
    SUBREDDIT_VOLUMES[subreddit.toLowerCase()] ||
    20; // Default fallback

  // Calculate days needed using PRD equation
  const calculatedDays = targetPosts / avgPostsPerDay;
  
  // Apply PRD constraints (7-60 days)
  const constrainedDays = Math.max(
    MIN_INTERVAL_DAYS,
    Math.min(MAX_INTERVAL_DAYS, calculatedDays)
  );

  // Calculate timestamps
  const now = Date.now();
  const fromTimestamp = Math.floor(now / 1000) - (constrainedDays * 24 * 60 * 60);
  const fromDate = new Date(fromTimestamp * 1000);
  const toDate = new Date(now);

  // Calculate expected posts based on actual interval
  const expectedPosts = Math.round(constrainedDays * avgPostsPerDay);

  // Generate reasoning
  let reasoning = '';
  if (calculatedDays < MIN_INTERVAL_DAYS) {
    reasoning = `Calculated ${calculatedDays.toFixed(1)} days, but constrained to minimum ${MIN_INTERVAL_DAYS} days`;
  } else if (calculatedDays > MAX_INTERVAL_DAYS) {
    reasoning = `Calculated ${calculatedDays.toFixed(1)} days, but constrained to maximum ${MAX_INTERVAL_DAYS} days`;
  } else {
    reasoning = `Using calculated interval of ${calculatedDays.toFixed(1)} days`;
  }

  return {
    subreddit,
    avgPostsPerDay,
    targetPosts,
    calculatedDays,
    constrainedDays,
    fromTimestamp,
    fromDate,
    toDate,
    expectedPosts,
    reasoning
  };
}

/**
 * Calculate windows for scale testing (different target volumes)
 */
export function calculateTestingWindows(subreddit: string = 'austinfood') {
  const volumes = [100, 500, 750, 1000];
  const avgPostsPerDay = SUBREDDIT_VOLUMES[subreddit.toLowerCase()] || 15;
  
  console.log(`\n📊 Collection Windows for r/${subreddit} (${avgPostsPerDay} posts/day):`);
  console.log('='.repeat(60));
  
  const windows = volumes.map(target => {
    const window = calculateCollectionWindow(subreddit, target);
    console.log(`\n🎯 Target: ${target} posts`);
    console.log(`   Calculated interval: ${window.calculatedDays.toFixed(1)} days`);
    console.log(`   Constrained interval: ${window.constrainedDays} days`);
    console.log(`   Expected posts: ${window.expectedPosts}`);
    console.log(`   From: ${window.fromDate.toISOString()}`);
    console.log(`   To: ${window.toDate.toISOString()}`);
    console.log(`   Reasoning: ${window.reasoning}`);
    return window;
  });
  
  return windows;
}

/**
 * Get timestamp for testing based on target post count
 */
export function getTestTimestamp(
  subreddit: string = 'austinfood',
  targetPosts: number = 750
): number {
  const window = calculateCollectionWindow(subreddit, targetPosts);
  
  console.log(`\n🔍 Test Configuration for r/${subreddit}:`);
  console.log(`   Target posts: ${targetPosts}`);
  console.log(`   Time window: ${window.constrainedDays} days`);
  console.log(`   Expected posts: ${window.expectedPosts}`);
  console.log(`   From timestamp: ${window.fromTimestamp}`);
  console.log(`   From date: ${window.fromDate.toISOString()}`);
  
  return window.fromTimestamp;
}

// Export for use in tests
export default {
  calculateCollectionWindow,
  calculateTestingWindows,
  getTestTimestamp,
  SUBREDDIT_VOLUMES
};