const fs = require('fs');
const data = JSON.parse(fs.readFileSync('reddit-response-debug.json', 'utf8'));

let stats = {
  topLevelComments: 0,
  totalComments: 0,
  maxDepthFound: 0,
  commentsByDepth: {},
  moreObjects: [],
  deletedComments: 0
};

function analyzeComments(obj, currentDepth = 0) {
  if (Array.isArray(obj)) {
    obj.forEach(item => analyzeComments(item, currentDepth));
  } else if (obj && typeof obj === 'object') {
    // Check for comment
    if (obj.kind === 't1' && obj.data) {
      stats.totalComments++;
      
      // Track depth
      const depth = obj.data.depth || currentDepth;
      stats.maxDepthFound = Math.max(stats.maxDepthFound, depth);
      stats.commentsByDepth[depth] = (stats.commentsByDepth[depth] || 0) + 1;
      
      if (depth === 0) {
        stats.topLevelComments++;
      }
      
      // Check if deleted
      if (obj.data.body === '[deleted]' || obj.data.body === '[removed]') {
        stats.deletedComments++;
      }
      
      // Process replies
      if (obj.data.replies && obj.data.replies.data && obj.data.replies.data.children) {
        analyzeComments(obj.data.replies.data.children, depth + 1);
      }
    }
    
    // Check for "more" objects
    if (obj.kind === 'more' && obj.data) {
      stats.moreObjects.push({
        count: obj.data.count,
        children: obj.data.children ? obj.data.children.length : 0,
        parent_id: obj.data.parent_id,
        depth: obj.data.depth || currentDepth
      });
    }
    
    // Recurse through all properties
    Object.values(obj).forEach(val => {
      if (typeof val === 'object' && val !== null) {
        analyzeComments(val, currentDepth);
      }
    });
  }
}

// Analyze the data
analyzeComments(data[1]); // Comments are in the second array element

console.log('📊 Reddit Comment Analysis');
console.log('===========================\n');

console.log('Total Statistics:');
console.log(`  Total comments in response: ${stats.totalComments}`);
console.log(`  Top-level comments: ${stats.topLevelComments}`);
console.log(`  Deleted/removed comments: ${stats.deletedComments}`);
console.log(`  Maximum depth reached: ${stats.maxDepthFound}`);

console.log('\nComments by depth level:');
Object.keys(stats.commentsByDepth).sort((a, b) => parseInt(a) - parseInt(b)).forEach(depth => {
  console.log(`  Depth ${depth}: ${stats.commentsByDepth[depth]} comments`);
});

console.log('\n"More" objects found:');
if (stats.moreObjects.length > 0) {
  console.log(`  Total "more" objects: ${stats.moreObjects.length}`);
  const totalMoreComments = stats.moreObjects.reduce((sum, m) => sum + (m.count || 0), 0);
  console.log(`  Total additional comments available: ${totalMoreComments}`);
  
  console.log('\n  Details:');
  stats.moreObjects.forEach((more, i) => {
    console.log(`    ${i + 1}. ${more.count} more comments at depth ${more.depth}`);
  });
} else {
  console.log('  No "more" objects found');
}

// Check if we hit the depth limit
if (stats.maxDepthFound >= 9) {
  console.log('\n⚠️  Warning: Maximum depth (${stats.maxDepthFound}) is at or near the API limit (10)');
  console.log('  Some deeply nested comments may be missing due to depth limit');
}

// Calculate missing comments
const postData = data[0]?.data?.children?.[0]?.data;
const reportedComments = postData?.num_comments || 0;
const missingComments = reportedComments - stats.totalComments;

console.log('\n📈 Missing Comments Analysis:');
console.log(`  Reported by Reddit: ${reportedComments} comments`);
console.log(`  Retrieved in response: ${stats.totalComments} comments`);
console.log(`  Missing: ${missingComments} comments`);

if (missingComments > 0) {
  console.log('\n  Possible reasons for missing comments:');
  if (stats.moreObjects.length > 0) {
    console.log(`  - ${stats.moreObjects.reduce((sum, m) => sum + (m.count || 0), 0)} comments in "more" objects (need additional API calls)`);
  }
  if (stats.maxDepthFound >= 9) {
    console.log('  - Comments beyond depth limit of 10');
  }
  if (stats.deletedComments > 0) {
    console.log(`  - ${stats.deletedComments} deleted/removed comments still counted in total`);
  }
}