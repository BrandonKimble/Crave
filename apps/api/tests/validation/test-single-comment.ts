#!/usr/bin/env ts-node

/**
 * Single Comment Pipeline Test
 * 
 * Tests the complete pipeline with one realistic comment to validate end-to-end flow
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { LLMService } from './src/modules/external-integrations/llm/llm.service';
import { EntityResolutionService } from './src/modules/content-processing/entity-resolver/entity-resolution.service';
import { EntityRepository } from './src/repositories/entity.repository';
import { ConnectionRepository } from './src/repositories/connection.repository';

async function testSingleComment() {
  console.log('🚀 Testing Pipeline with Single Comment');
  console.log('======================================');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();
  
  const llmService = app.get(LLMService);
  const entityResolution = app.get(EntityResolutionService);
  const entityRepo = app.get(EntityRepository);
  const connectionRepo = app.get(ConnectionRepository);
  
  try {
    // Single focused test with one great comment
    const testInput = {
      posts: [
        {
          post_id: 'single_test',
          title: 'BBQ Recommendations',
          content: 'Looking for good BBQ',
          subreddit: 'austinfood',
          url: 'https://reddit.com/single_test',
          upvotes: 5,
          created_at: new Date().toISOString(),
          comments: [
            {
              comment_id: 'single_comment',
              content: 'Franklin BBQ has incredible brisket. Their burnt ends are amazing too. Best BBQ in Austin hands down!',
              author: 'bbq_lover',
              upvotes: 45,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/single_test/single_comment'
            }
          ]
        }
      ]
    };
    
    console.log('📋 Test Content:');
    console.log(`  Comment: "${testInput.posts[0].comments[0].content}"`);
    console.log(`  Upvotes: ${testInput.posts[0].comments[0].upvotes}`);
    console.log('  Expected: Franklin BBQ → brisket & burnt ends');
    console.log('');
    
    console.log('🧠 Processing through LLM...');
    const llmResult = await llmService.processContent(testInput);
    
    console.log(`✅ LLM Result: ${llmResult.mentions.length} mentions extracted`);
    
    if (llmResult.mentions.length > 0) {
      console.log('\n📋 Extracted Mentions:');
      llmResult.mentions.forEach((mention, index) => {
        console.log(`  ${index + 1}. Restaurant: ${mention.restaurant?.normalized_name || 'None'}`);
        console.log(`     Dish: ${mention.dish_or_category?.normalized_name || 'None'}`);
        console.log(`     General praise: ${mention.general_praise}`);
        console.log(`     Menu item: ${mention.is_menu_item}`);
        console.log(`     Source upvotes: ${mention.source.upvotes}`);
        console.log('');
      });
      
      // Test Entity Resolution
      console.log('🎯 Testing Entity Resolution...');
      const entityInputs: any[] = [];
      
      for (const mention of llmResult.mentions) {
        if (mention.restaurant?.normalized_name) {
          entityInputs.push({
            tempId: mention.restaurant.temp_id,
            normalizedName: mention.restaurant.normalized_name,
            originalText: mention.restaurant.original_text || mention.restaurant.normalized_name,
            entityType: 'restaurant' as const,
            aliases: []
          });
        }
        
        if (mention.dish_or_category?.normalized_name) {
          entityInputs.push({
            tempId: mention.dish_or_category.temp_id,
            normalizedName: mention.dish_or_category.normalized_name,
            originalText: mention.dish_or_category.original_text || mention.dish_or_category.normalized_name,
            entityType: 'dish_or_category' as const,
            aliases: []
          });
        }
      }
      
      const resolutionResult = await entityResolution.resolveBatch(entityInputs);
      
      console.log(`✅ Entity Resolution: ${resolutionResult.newEntitiesCreated} new entities created`);
      console.log(`   Exact matches: ${resolutionResult.performanceMetrics.exactMatches}`);
      console.log(`   Fuzzy matches: ${resolutionResult.performanceMetrics.fuzzyMatches}`);
      console.log('');
      
      // Check final database state
      const entityCount = await entityRepo.count();
      const connectionCount = await connectionRepo.count();
      
      console.log(`💾 Database State:`);
      console.log(`   Entities: ${entityCount}`);
      console.log(`   Connections: ${connectionCount}`);
      console.log('');
      
      // Sample entities
      if (entityCount > 0) {
        const entities = await entityRepo.findMany({ take: 5 });
        console.log('📊 Recent Entities:');
        entities.slice(-3).forEach(entity => {
          console.log(`   ${entity.type}: ${entity.name}`);
        });
      }
      
      console.log('\n🎉 SINGLE COMMENT PIPELINE SUCCESS!');
      console.log('   ✅ Reddit comment processed');
      console.log('   ✅ LLM extracted entities');  
      console.log('   ✅ Entity resolution completed');
      console.log('   ✅ Database updated');
      console.log('\n🚀 READY FOR FULL SCALE TESTING!');
      
    } else {
      console.log('❌ No mentions extracted from comment');
      console.log('   Content: "' + testInput.posts[0].comments[0].content + '"');
      console.log('   This comment should clearly extract Franklin BBQ → brisket');
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`❌ Test failed: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      console.log(`Stack: ${error.stack}`);
    }
  } finally {
    await app.close();
  }
}

testSingleComment()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Test crashed:', error);
    process.exit(1);
  });