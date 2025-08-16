import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '.env.test') });

import axios from 'axios';

async function testRedditComments() {
  const CLIENT_ID = process.env.REDDIT_CLIENT_ID;
  const CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;
  
  console.log('🔍 Testing Reddit Comments Retrieval');
  console.log('=====================================\n');
  
  // First, get an access token
  console.log('1. Authenticating with Reddit...');
  const authResponse = await axios.post(
    'https://www.reddit.com/api/v1/access_token',
    'grant_type=client_credentials',
    {
      auth: {
        username: CLIENT_ID!,
        password: CLIENT_SECRET!,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'CraveSearch/1.0.0',
      },
    }
  );
  
  const accessToken = authResponse.data.access_token;
  console.log('✅ Authentication successful\n');
  
  // Now fetch the post with comments
  const postId = '1g1dspf'; // "Best special in Austin?" post
  const subreddit = 'austinfood';
  
  console.log(`2. Fetching post ${postId} from r/${subreddit}...`);
  
  const url = `https://oauth.reddit.com/r/${subreddit}/comments/${postId}?limit=500&depth=10`;
  console.log(`   URL: ${url}\n`);
  
  const response = await axios.get(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'CraveSearch/1.0.0',
    },
  });
  
  console.log('3. Response structure:');
  console.log(`   - Response is array: ${Array.isArray(response.data)}`);
  console.log(`   - Array length: ${response.data.length}`);
  
  if (Array.isArray(response.data) && response.data.length >= 2) {
    // Post data
    const postListing = response.data[0];
    const postData = postListing?.data?.children?.[0]?.data;
    console.log('\n4. Post Data:');
    console.log(`   - Title: ${postData?.title}`);
    console.log(`   - Author: ${postData?.author}`);
    console.log(`   - Score: ${postData?.score}`);
    console.log(`   - Number of comments: ${postData?.num_comments}`);
    
    // Comments data
    const commentListing = response.data[1];
    const comments = commentListing?.data?.children || [];
    console.log('\n5. Comments Data:');
    console.log(`   - Comments in response: ${comments.length}`);
    console.log(`   - Expected comments: ${postData?.num_comments}`);
    
    if (comments.length > 0) {
      console.log('\n   First 5 comments:');
      comments.slice(0, 5).forEach((comment: any, i: number) => {
        if (comment.kind === 't1' && comment.data) {
          const data = comment.data;
          console.log(`   ${i + 1}. Author: ${data.author}, Score: ${data.score}`);
          console.log(`      Body preview: ${data.body?.substring(0, 100)}...`);
        }
      });
    } else {
      console.log('   ⚠️ No comments found in response!');
    }
    
    // Check for "more" comments indicator
    const moreComments = comments.filter((c: any) => c.kind === 'more');
    if (moreComments.length > 0) {
      const totalMore = moreComments.reduce((sum: number, m: any) => sum + (m.data?.count || 0), 0);
      console.log(`\n   ⚠️ Found ${moreComments.length} "more" objects with ${totalMore} additional comments`);
      console.log('   These comments require additional API calls to retrieve');
    }
  }
  
  // Save full response for debugging
  const fs = require('fs');
  fs.writeFileSync('reddit-response-debug.json', JSON.stringify(response.data, null, 2));
  console.log('\n💾 Full response saved to reddit-response-debug.json');
}

testRedditComments().catch(console.error);