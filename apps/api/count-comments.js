const fs = require('fs');
const data = JSON.parse(fs.readFileSync('reddit-response-debug.json', 'utf8'));

let commentCount = 0;

function countComments(obj) {
  if (Array.isArray(obj)) {
    obj.forEach(countComments);
  } else if (obj && typeof obj === 'object') {
    if (obj.kind === 't1' && obj.data && obj.data.body) {
      commentCount++;
    }
    Object.values(obj).forEach(countComments);
  }
}

countComments(data);
console.log(`Total comments found in response: ${commentCount}`);