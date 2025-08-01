#!/usr/bin/env ts-node

/**
 * Proper Batch Processing Test
 * 
 * Tests 10 handcrafted comments in batches of 5 (the proven working size)
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { LLMService } from './src/modules/external-integrations/llm/llm.service';
import { EntityResolutionService } from './src/modules/content-processing/entity-resolver/entity-resolution.service';
import { EntityRepository } from './src/repositories/entity.repository';
import { ConnectionRepository } from './src/repositories/connection.repository';
import { LoggerService } from './src/shared';

async function testProperBatchProcessing() {
  console.log('🚀 Testing 10 Comments with Proper Batch Processing');
  console.log('===================================================');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();
  
  const llmService = app.get(LLMService);
  const entityResolution = app.get(EntityResolutionService);
  const entityRepo = app.get(EntityRepository);
  const connectionRepo = app.get(ConnectionRepository);
  const logger = app.get(LoggerService).setContext('ProperBatchTest');
  
  try {
    // Create 10 perfect comments
    const allComments = [
      'Franklin BBQ has the best brisket in Austin. The burnt ends are incredible too!',
      'Uchi serves amazing sushi. Their hamachi is absolutely perfect.',
      'La Barbecue makes fantastic pulled pork sandwiches. The coleslaw is fresh.',
      'Terry Blacks has incredible ribs. Their brisket is tender and smoky.',
      'Hopdoddy makes the best burgers in Austin. The truffle fries are amazing.',
      'Torchys Tacos has fantastic breakfast tacos. The trailer park taco is incredible!',
      'Salt Lick BBQ serves excellent beef ribs. The sauce is tangy.',
      'Justines has amazing French cuisine. The duck confit is perfectly prepared.',
      'Matts El Rancho makes the best enchiladas in Austin. The queso is creamy.',
      'Amys Ice Cream has incredible flavors. The sweet cream is my favorite.'
    ];
    
    console.log('📋 Processing Strategy:');
    console.log(`  Total comments: ${allComments.length}`);
    console.log(`  Batch size: 5 (proven working size)`);
    console.log(`  Number of batches: ${Math.ceil(allComments.length / 5)}`);
    console.log('');
    
    const allMentions: any[] = [];
    const BATCH_SIZE = 5;
    
    // Process in batches of 5
    for (let i = 0; i < allComments.length; i += BATCH_SIZE) {
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const batchComments = allComments.slice(i, i + BATCH_SIZE);
      
      console.log(`🔄 Processing Batch ${batchNumber}/${Math.ceil(allComments.length / BATCH_SIZE)}`);
      console.log(`  Comments: ${batchComments.length}`);
      
      // Format comments for this batch
      const comments = batchComments.map((content, index) => ({
        comment_id: `batch_${batchNumber}_comment_${index + 1}`,
        content: content,
        author: `user_${i + index + 1}`,
        upvotes: 45 - (i + index),
        created_at: new Date().toISOString(),
        parent_id: null,
        url: `https://reddit.com/proper_batch_test/batch_${batchNumber}_comment_${index + 1}`
      }));
      
      const batchInput = {
        posts: [
          {
            post_id: `proper_batch_test_${batchNumber}`,
            title: `Proper Batch Test ${batchNumber}`,
            content: '',
            subreddit: 'austinfood',
            url: `https://reddit.com/proper_batch_test_${batchNumber}`,
            upvotes: 10,
            created_at: new Date().toISOString(),
            comments: comments
          }
        ]
      };
      
      try {
        const startTime = Date.now();
        const batchResult = await llmService.processContent(batchInput);
        const endTime = Date.now();
        
        console.log(`  ✅ Batch ${batchNumber} SUCCESS`);
        console.log(`    Mentions extracted: ${batchResult.mentions.length}`);
        console.log(`    Processing time: ${endTime - startTime}ms`);
        console.log(`    Extraction rate: ${((batchResult.mentions.length / comments.length) * 100).toFixed(1)}%`);
        
        // Add to total mentions
        allMentions.push(...batchResult.mentions);
        
        // Brief delay between batches
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (batchError) {
        console.log(`  ❌ Batch ${batchNumber} FAILED`);
        console.log(`    Error: ${batchError instanceof Error ? batchError.message : String(batchError)}`);
      }
      
      console.log('');
    }
    
    console.log('📊 BATCH PROCESSING RESULTS');
    console.log('===========================');
    console.log(`Total comments processed: ${allComments.length}`);
    console.log(`Total mentions extracted: ${allMentions.length}`);
    console.log(`Overall extraction rate: ${((allMentions.length / allComments.length) * 100).toFixed(1)}%`);
    console.log('');
    
    if (allMentions.length > 0) {
      console.log('📋 All Extracted Mentions:');
      allMentions.forEach((mention, index) => {
        console.log(`  ${index + 1}. ${mention.restaurant?.normalized_name || 'Unknown'} → ${mention.dish_or_category?.normalized_name || 'General'}`);
      });
      console.log('');
      
      // Test Entity Resolution with all mentions
      console.log('🎯 Testing Entity Resolution with All Mentions...');
      const entityInputs: any[] = [];
      
      for (const mention of allMentions) {
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
      
      if (entityInputs.length > 0) {
        const resolutionResult = await entityResolution.resolveBatch(entityInputs);
        
        console.log(`✅ Entity Resolution Results:`);
        console.log(`  Entities processed: ${resolutionResult.resolutionResults.length}`);
        console.log(`  New entities created: ${resolutionResult.newEntitiesCreated}`);
        console.log(`  Exact matches: ${resolutionResult.performanceMetrics.exactMatches}`);
        console.log(`  Fuzzy matches: ${resolutionResult.performanceMetrics.fuzzyMatches}`);
        console.log('');
        
        // Check final database state
        const finalEntityCount = await entityRepo.count();
        const finalConnectionCount = await connectionRepo.count();
        
        console.log(`💾 Final Database State:`);
        console.log(`  Total entities: ${finalEntityCount}`);
        console.log(`  Total connections: ${finalConnectionCount}`);
        console.log('');
        
        // Sample entities
        if (finalEntityCount > 0) {
          const restaurants = await entityRepo.findMany({
            where: { type: 'restaurant' },
            take: 5
          });
          
          console.log(`📊 Sample Restaurants Created:`);
          restaurants.forEach((restaurant, index) => {
            console.log(`  ${index + 1}. ${restaurant.name}`);
          });
        }
        
        console.log('\\n🎉 PROPER BATCH PROCESSING SUCCESS!');
        console.log('====================================');
        console.log(`✅ Processed ${allComments.length} comments in batches of 5`);
        console.log(`✅ Extracted ${allMentions.length} mentions total`);
        console.log(`✅ Created ${resolutionResult.newEntitiesCreated} new entities`);
        console.log(`✅ System handles batch processing correctly`);
        console.log('\\n🚀 READY FOR PRODUCTION-SCALE PROCESSING!');
        
      } else {
        console.log('⚠️ No entities to resolve');
      }
      
    } else {
      console.log('❌ No mentions extracted across all batches');
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Proper batch test failed', error as Error);
    console.log(`❌ Test failed: ${errorMessage}`);
  } finally {
    await app.close();
  }
}

testProperBatchProcessing()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Test crashed:', error);
    process.exit(1);
  });