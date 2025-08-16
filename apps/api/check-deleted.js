const fs = require('fs');
const data = JSON.parse(fs.readFileSync('reddit-response-debug.json', 'utf8'));

let deletedComments = [];
let validComments = [];

function checkComments(obj) {
  if (Array.isArray(obj)) {
    obj.forEach(checkComments);
  } else if (obj && typeof obj === 'object') {
    if (obj.kind === 't1' && obj.data) {
      if (obj.data.body === '[deleted]' || obj.data.body === '[removed]' || 
          obj.data.author === '[deleted]' || !obj.data.author) {
        deletedComments.push({
          id: obj.data.id,
          body: obj.data.body?.substring(0, 50),
          author: obj.data.author
        });
      } else {
        validComments.push(obj.data.id);
      }
    }
    Object.values(obj).forEach(val => {
      if (typeof val === 'object' && val !== null) {
        checkComments(val);
      }
    });
  }
}

checkComments(data);

console.log(`Valid comments: ${validComments.length}`);
console.log(`Deleted/removed comments: ${deletedComments.length}`);
console.log(`Total: ${validComments.length + deletedComments.length}`);

if (deletedComments.length > 0) {
  console.log('\nDeleted comments filtered out:');
  deletedComments.slice(0, 5).forEach(c => {
    console.log(`  - ${c.id}: author=${c.author}, body="${c.body}"`);
  });
  if (deletedComments.length > 5) {
    console.log(`  ... and ${deletedComments.length - 5} more`);
  }
}