import { config } from 'dotenv';
config({ path: '.env.test' });

import axios from 'axios';

const GEMINI_API_KEY = process.env.LLM_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash-exp';

// Sample Reddit data
const sampleRedditData = {
  posts: [{
    id: "t3_test123",
    title: "Best BBQ in Austin?",
    content: "Looking for the best BBQ spots in Austin. I've heard Franklin BBQ is amazing but the lines are crazy long.",
    subreddit: "austinfood",
    author: "bbq_lover",
    url: "https://reddit.com/r/austinfood/test123",
    score: 150,
    created_at: "2024-12-20T10:00:00Z",
    comments: [
      {
        id: "t1_comment1",
        content: "Franklin BBQ is definitely worth the wait! Their brisket is the best I've ever had. Also check out la Barbecue and Terry Black's Barbecue.",
        author: "austin_foodie",
        score: 45,
        created_at: "2024-12-20T11:00:00Z",
        parent_id: "t3_test123",
        url: "https://reddit.com/r/austinfood/comments/test123/_/comment1"
      },
      {
        id: "t1_comment2", 
        content: "For a shorter wait, try Micklethwait Craft Meats. Their craft sausages are incredible and the barbacoa is a must-try on weekends.",
        author: "meat_expert",
        score: 38,
        created_at: "2024-12-20T11:30:00Z",
        parent_id: "t3_test123",
        url: "https://reddit.com/r/austinfood/comments/test123/_/comment2"
      },
      {
        id: "t1_comment3",
        content: "Salt & Time has amazing house-made sausages and their beef rib is massive. Plus they have a great butcher shop attached.",
        author: "local_eater",
        score: 25,
        created_at: "2024-12-20T12:00:00Z",
        parent_id: "t3_test123",
        url: "https://reddit.com/r/austinfood/comments/test123/_/comment3"
      }
    ],
    extract_from_post: true
  }]
};

// Extraction prompt
const EXTRACTION_PROMPT = `You are a specialized food entity extraction system. Extract restaurant names and dish/category mentions from the provided Reddit content.

IMPORTANT: Each mention is an independent observation. Extract ALL mentions as separate entries, even if they refer to the same restaurant or dish.

For each mention found, provide:
- Restaurant name (normalized and original text)
- Dish/category (if mentioned)
- Whether it's general praise
- Source details (post or comment ID)

Focus on:
1. Restaurant names (normalize common variations)
2. Specific dishes or menu items
3. Food categories (BBQ, Mexican, Italian, etc.)
4. Restaurant attributes (atmosphere, service quality, etc.)

Return ONLY valid JSON matching this exact structure:
{
  "mentions": [
    {
      "temp_id": "unique_id",
      "restaurant_normalized_name": "Franklin BBQ",
      "restaurant_original_text": "Franklin's",
      "restaurant_temp_id": "rest_123",
      "dish_primary_category": "BBQ",
      "dish_categories": ["BBQ", "Smoked Meats"],
      "dish_original_text": "brisket",
      "dish_temp_id": "dish_456",
      "dish_is_menu_item": true,
      "restaurant_attributes": ["long wait", "worth it"],
      "dish_attributes": ["best", "tender"],
      "general_praise": true,
      "source_type": "comment",
      "source_id": "t1_abc123",
      "source_content": "actual comment text"
    }
  ]
}`;

async function testExtraction() {
  console.log('🧪 Testing Entity Extraction with Gemini...\n');
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  const requestBody = {
    contents: [{
      parts: [{
        text: `${EXTRACTION_PROMPT}\n\nReddit Content:\n${JSON.stringify(sampleRedditData, null, 2)}`
      }]
    }],
    generationConfig: {
      temperature: 0.1,
      topK: 40,
      topP: 0.95,
      candidateCount: 1,
      responseMimeType: "application/json"
    }
  };

  try {
    console.log('📤 Sending request to Gemini...');
    const startTime = Date.now();
    
    const response = await axios.post(url, requestBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    
    const duration = Date.now() - startTime;
    console.log(`✅ Response received in ${duration}ms\n`);
    
    // Parse response
    const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new Error('No content in response');
    }
    
    const extracted = JSON.parse(content);
    
    // Analyze extraction quality
    console.log('📊 EXTRACTION ANALYSIS:');
    console.log('=' .repeat(50));
    console.log(`Total mentions extracted: ${extracted.mentions.length}`);
    
    // Expected entities
    const expectedRestaurants = [
      'Franklin BBQ',
      'la Barbecue', 
      "Terry Black's Barbecue",
      'Micklethwait Craft Meats',
      'Salt & Time'
    ];
    
    const expectedDishes = [
      'brisket',
      'craft sausages',
      'barbacoa',
      'house-made sausages',
      'beef rib'
    ];
    
    // Check what was found
    const foundRestaurants = new Set(extracted.mentions.map((m: any) => m.restaurant_normalized_name).filter(Boolean));
    const foundDishes = new Set(extracted.mentions.map((m: any) => m.dish_original_text).filter(Boolean));
    
    console.log('\n🏪 RESTAURANTS:');
    console.log(`Expected: ${expectedRestaurants.length}`);
    console.log(`Found: ${foundRestaurants.size}`);
    console.log(`Accuracy: ${Math.round((foundRestaurants.size / expectedRestaurants.length) * 100)}%`);
    
    console.log('\nFound restaurants:');
    foundRestaurants.forEach(r => console.log(`  ✓ ${r}`));
    
    const missedRestaurants = expectedRestaurants.filter(r => !Array.from(foundRestaurants).some((f: any) => f?.toLowerCase().includes(r.toLowerCase())));
    if (missedRestaurants.length > 0) {
      console.log('\nMissed restaurants:');
      missedRestaurants.forEach(r => console.log(`  ✗ ${r}`));
    }
    
    console.log('\n🍖 DISHES/CATEGORIES:');
    console.log(`Expected: ${expectedDishes.length}`);
    console.log(`Found: ${foundDishes.size}`);
    console.log(`Accuracy: ${Math.round((foundDishes.size / expectedDishes.length) * 100)}%`);
    
    console.log('\nFound dishes:');
    foundDishes.forEach(d => console.log(`  ✓ ${d}`));
    
    const missedDishes = expectedDishes.filter(d => !Array.from(foundDishes).some((f: any) => f?.toLowerCase().includes(d.toLowerCase())));
    if (missedDishes.length > 0) {
      console.log('\nMissed dishes:');
      missedDishes.forEach(d => console.log(`  ✗ ${d}`));
    }
    
    // Check attribution quality
    console.log('\n📍 ATTRIBUTION QUALITY:');
    const withSource = extracted.mentions.filter((m: any) => m.source_id && m.source_type).length;
    console.log(`Mentions with proper source attribution: ${withSource}/${extracted.mentions.length} (${Math.round((withSource/extracted.mentions.length) * 100)}%)`);
    
    // Save full results
    const fs = require('fs');
    fs.writeFileSync('extraction-test-results.json', JSON.stringify({
      request: sampleRedditData,
      response: extracted,
      analysis: {
        totalMentions: extracted.mentions.length,
        restaurantsFound: Array.from(foundRestaurants),
        dishesFound: Array.from(foundDishes),
        missedRestaurants,
        missedDishes,
        attributionRate: withSource / extracted.mentions.length
      }
    }, null, 2));
    
    console.log('\n💾 Full results saved to extraction-test-results.json');
    
    // Show sample mentions
    console.log('\n📝 SAMPLE MENTIONS:');
    extracted.mentions.slice(0, 3).forEach((m: any, i: number) => {
      console.log(`\nMention ${i + 1}:`);
      console.log(`  Restaurant: ${m.restaurant_normalized_name || 'N/A'}`);
      console.log(`  Dish: ${m.dish_original_text || 'N/A'}`);
      console.log(`  Source: ${m.source_type} ${m.source_id}`);
    });
    
  } catch (error: any) {
    console.error('❌ Extraction failed:', error.message);
    if (error.response?.data) {
      console.error('API Error:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testExtraction().catch(console.error);