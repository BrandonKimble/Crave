const fs = require('fs');
const data = JSON.parse(fs.readFileSync('reddit-response-debug.json', 'utf8'));

let uniqueComments = new Set();
let duplicateCount = 0;

function countUniqueComments(obj) {
  if (Array.isArray(obj)) {
    obj.forEach(countUniqueComments);
  } else if (obj && typeof obj === 'object') {
    if (obj.kind === 't1' && obj.data && obj.data.id) {
      if (uniqueComments.has(obj.data.id)) {
        duplicateCount++;
        console.log(`Duplicate found: ${obj.data.id}`);
      } else {
        uniqueComments.add(obj.data.id);
      }
    }
    Object.values(obj).forEach(val => {
      if (typeof val === 'object' && val !== null) {
        countUniqueComments(val);
      }
    });
  }
}

// Count unique comments
countUniqueComments(data);

console.log(`\nUnique comments: ${uniqueComments.size}`);
console.log(`Duplicate comments: ${duplicateCount}`);
console.log(`Total comment objects: ${uniqueComments.size + duplicateCount}`);

// Also count what the pipeline sees
const commentListing = data[1];
const topLevelComments = commentListing?.data?.children || [];
console.log(`\nTop-level comments: ${topLevelComments.filter(c => c.kind === 't1').length}`);

// Check post data
const postData = data[0]?.data?.children?.[0]?.data;
console.log(`\nPost reports: ${postData?.num_comments} comments`);