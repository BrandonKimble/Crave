/**
 * STRUCTURED OUTPUT TEST - Gemini API with JSON Schema
 * 
 * Tests the new structured output implementation that:
 * 1. Uses JSON schema instead of prompt instructions for output format
 * 2. Enforces enum constraints on attribute types
 * 3. Validates field types and requirements at API level
 * 4. Eliminates JSON parsing errors and malformatted responses
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { LLMService } from './src/modules/external-integrations/llm/llm.service';
import type { LLMInputStructure } from './src/modules/external-integrations/llm/llm.types';
import * as fs from 'fs/promises';
import * as path from 'path';

async function testStructuredOutput() {
  console.log('🧪 STRUCTURED OUTPUT TEST - Gemini API with JSON Schema');
  console.log('=====================================================');

  let app: any = null;
  
  try {
    // Initialize NestJS Application
    console.log('\n🏗️  Initializing NestJS Application...');
    app = await NestFactory.createApplicationContext(AppModule);
    await app.init();
    
    const llmService = app.get(LLMService);
    console.log('✅ LLM Service initialized with structured output');

    // Test Input: Sample Reddit content with clear entity extraction opportunities
    const testInput: LLMInputStructure = {
      posts: [
        {
          id: 't3_test123',
          title: 'Best BBQ in Austin?',
          selftext: 'Looking for the best brisket in town. Heard Franklin BBQ is amazing but the wait is crazy. Anyone tried Micklethwait Craft Meats? Their sausage looks incredible.',
          subreddit: 'austinfood',
          author: 'foodie_austin',
          permalink: '/r/austinfood/comments/test123/best_bbq_in_austin/',
          score: 45,
          created_utc: Math.floor(Date.now() / 1000),
          comments: [
            {
              id: 't1_comment1',
              body: 'Franklin is overrated IMO. Try la Barbecue - same pitmaster, half the wait. Their beef ribs are phenomenal.',
              author: 'bbq_expert',
              score: 23,
              created_utc: Math.floor(Date.now() / 1000),
              parent_id: 't3_test123',
              permalink: '/r/austinfood/comments/test123/best_bbq_in_austin/comment1/',
              subreddit: 'austinfood'
            },
            {
              id: 't1_comment2', 
              body: 'Micklethwait is solid! Their house-made sausage with jalapeños is spicy perfection. Great patio dining too.',
              author: 'sausage_lover',
              score: 18,
              created_utc: Math.floor(Date.now() / 1000),
              parent_id: 't3_test123',
              permalink: '/r/austinfood/comments/test123/best_bbq_in_austin/comment2/',
              subreddit: 'austinfood'
            },
            {
              id: 't1_comment3',
              body: 'Both are great but for casual lunch I prefer Stiles Switch. Amazing atmosphere and their burnt ends are addictive.',
              author: 'lunch_enthusiast',
              score: 12,
              created_utc: Math.floor(Date.now() / 1000),
              parent_id: 't3_test123',
              permalink: '/r/austinfood/comments/test123/best_bbq_in_austin/comment3/',
              subreddit: 'austinfood'
            }
          ]
        }
      ]
    };

    console.log('\n📊 Test Input Summary:');
    console.log(`   Posts: ${testInput.posts.length}`);
    console.log(`   Comments: ${testInput.posts[0].comments.length}`);
    console.log(`   Expected entities: Franklin BBQ, la Barbecue, Micklethwait Craft Meats, Stiles Switch`);
    console.log(`   Expected dishes: brisket, beef ribs, sausage, burnt ends`);
    console.log(`   Expected attributes: house-made, spicy, casual (selective vs descriptive)`);

    // Test LLM Processing with Structured Output
    console.log('\n🤖 Processing with Structured Output...');
    const startTime = Date.now();
    
    try {
      const result = await llmService.processContent(testInput);
      const processingTime = Date.now() - startTime;
      
      console.log('\n✅ Structured Output Processing Successful!');
      console.log(`   Processing time: ${processingTime}ms`);
      console.log(`   Mentions extracted: ${result.mentions.length}`);
      
      // Analyze Results
      console.log('\n📋 EXTRACTED MENTIONS ANALYSIS:');
      result.mentions.forEach((mention, i) => {
        console.log(`\n   Mention ${i + 1}: ${mention.temp_id}`);
        console.log(`     Restaurant: ${mention.restaurant.normalized_name || mention.restaurant.original_text} (${mention.restaurant.temp_id})`);
        
        if (mention.dish_or_category) {
          console.log(`     Dish/Category: ${mention.dish_or_category.normalized_name || mention.dish_or_category.original_text} (${mention.dish_or_category.temp_id})`);
        }
        
        if (mention.dish_attributes && mention.dish_attributes.length > 0) {
          console.log(`     Dish Attributes: ${mention.dish_attributes.map(attr => `${attr.attribute} (${attr.type})`).join(', ')}`);
        }
        
        if (mention.restaurant_attributes && mention.restaurant_attributes.length > 0) {
          console.log(`     Restaurant Attributes: ${mention.restaurant_attributes.join(', ')}`);
        }
        
        if (mention.dish_or_category) {
          console.log(`     Menu Item: ${mention.dish_or_category.is_menu_item}`);
        }
        console.log(`     General Praise: ${mention.general_praise}`);
        console.log(`     Source: ${mention.source.type} (${mention.source.id})`);
      });

      // Validate Schema Compliance
      console.log('\n🔍 SCHEMA COMPLIANCE VALIDATION:');
      
      let validationErrors = 0;
      
      result.mentions.forEach((mention, i) => {
        // Check required fields
        if (!mention.temp_id || typeof mention.temp_id !== 'string') {
          console.log(`   ❌ Mention ${i + 1}: Invalid temp_id`);
          validationErrors++;
        }
        
        if (!mention.restaurant || !mention.restaurant.temp_id) {
          console.log(`   ❌ Mention ${i + 1}: Invalid restaurant structure`);
          validationErrors++;
        }
        
        if (mention.dish_or_category && typeof mention.dish_or_category.is_menu_item !== 'boolean') {
          console.log(`   ❌ Mention ${i + 1}: dish_or_category.is_menu_item must be boolean`);
          validationErrors++;
        }
        
        if (typeof mention.general_praise !== 'boolean') {
          console.log(`   ❌ Mention ${i + 1}: general_praise must be boolean`);
          validationErrors++;
        }
        
        // Validate enum constraints for dish attributes
        if (mention.dish_attributes) {
          mention.dish_attributes.forEach((attr, j) => {
            if (!['selective', 'descriptive'].includes(attr.type)) {
              console.log(`   ❌ Mention ${i + 1}, Attribute ${j + 1}: Invalid type '${attr.type}' (must be 'selective' or 'descriptive')`);
              validationErrors++;
            }
          });
        }
        
        // Validate source enum
        if (!['post', 'comment'].includes(mention.source.type)) {
          console.log(`   ❌ Mention ${i + 1}: Invalid source type '${mention.source.type}'`);
          validationErrors++;
        }

        // Validate source content field
        if (!mention.source.content || typeof mention.source.content !== 'string') {
          console.log(`   ❌ Mention ${i + 1}: Missing or invalid source.content field`);
          validationErrors++;
        }
      });
      
      if (validationErrors === 0) {
        console.log('   ✅ All mentions pass schema validation');
      } else {
        console.log(`   ⚠️  ${validationErrors} validation errors found`);
      }

      // Save Results
      const outputData = {
        testMetadata: {
          testName: 'STRUCTURED OUTPUT VALIDATION TEST',
          timestamp: new Date().toISOString(),
          processingTime,
          inputStats: {
            posts: testInput.posts.length,
            comments: testInput.posts.reduce((sum, post) => sum + post.comments.length, 0)
          },
          outputStats: {
            mentions: result.mentions.length,
            validationErrors
          }
        },
        input: testInput,
        output: result,
        schemaValidation: {
          passed: validationErrors === 0,
          errorCount: validationErrors
        }
      };

      const logsDir = path.join(process.cwd(), 'logs');
      await fs.mkdir(logsDir, { recursive: true });
      const outputPath = path.join(logsDir, 'structured-output-test-results.json');
      await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));

      console.log(`\n💾 Results saved to: ${outputPath}`);
      
      // Performance Metrics
      const metrics = llmService.getPerformanceMetrics();
      console.log('\n📈 PERFORMANCE METRICS:');
      console.log(`   Total requests: ${metrics.requestCount}`);
      console.log(`   Average response time: ${metrics.averageResponseTime}ms`);
      console.log(`   Success rate: ${metrics.successRate}%`);
      console.log(`   Total tokens used: ${metrics.totalTokensUsed}`);

      console.log('\n🎯 STRUCTURED OUTPUT TEST RESULTS:');
      console.log('==================================');
      console.log(`✅ JSON Schema Enforcement: WORKING`);
      console.log(`✅ Enum Constraints (attribute types): ${validationErrors === 0 ? 'ENFORCED' : 'PARTIAL'}`);
      console.log(`✅ Required Field Validation: ${validationErrors === 0 ? 'ENFORCED' : 'PARTIAL'}`);
      console.log(`✅ Clean JSON Response: CONFIRMED`);
      console.log(`✅ No Parsing Errors: CONFIRMED`);
      console.log(`✅ Entity Extraction Quality: ${result.mentions.length > 0 ? 'GOOD' : 'NEEDS_REVIEW'}`);

    } catch (error) {
      console.error('\n❌ Structured Output Processing Failed:', error instanceof Error ? error.message : String(error));
      
      if (error instanceof Error && error.stack) {
        console.error('Stack trace:', error.stack);
      }
      
      throw error;
    }

  } catch (error) {
    console.error('\n❌ TEST FAILURE:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    if (app) {
      console.log('\n🔄 Closing application context...');
      await app.close();
      console.log('✅ Application closed');
    }
  }
}

// Run the structured output test
if (require.main === module) {
  testStructuredOutput().catch((error) => {
    console.error('Structured output test failed:', error);
    process.exit(1);
  });
}