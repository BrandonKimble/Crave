#!/usr/bin/env ts-node

/**
 * Complete Pipeline Test with Reddit Comments
 * 
 * Tests with realistic Reddit comments that contain sentiment and food experiences
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { LLMService } from './src/modules/external-integrations/llm/llm.service';
import { EntityResolutionService } from './src/modules/content-processing/entity-resolver/entity-resolution.service';
import { EntityRepository } from './src/repositories/entity.repository';
import { ConnectionRepository } from './src/repositories/connection.repository';

async function testWithComments() {
  console.log('🚀 Testing Pipeline with Reddit Comments');
  console.log('========================================');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();
  
  const llmService = app.get(LLMService);
  const entityResolution = app.get(EntityResolutionService);
  const entityRepo = app.get(EntityRepository);
  const connectionRepo = app.get(ConnectionRepository);
  
  try {
    // Create realistic Reddit post with rich comments
    const testInput = {
      posts: [
        {
          post_id: 'comment_test_1',
          title: 'Best BBQ in Austin?',
          content: 'Looking for recommendations for great BBQ joints in Austin. What are your favorites?',
          subreddit: 'austinfood',
          url: 'https://reddit.com/r/austinfood/comment_test_1',
          upvotes: 15,
          created_at: new Date().toISOString(),
          comments: [
            {
              comment_id: 'comment_1',
              content: 'Franklin BBQ hands down. Their brisket is incredible - so tender and smoky. The line is worth the wait. Get there early!',
              author: 'bbq_lover_atx',
              upvotes: 45,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/r/austinfood/comment_test_1/comment_1'
            },
            {
              comment_id: 'comment_2', 
              content: 'La Barbecue is amazing too! Their pulled pork sandwich is fantastic and the sides are great. Less wait time than Franklin.',
              author: 'foodie_austin',
              upvotes: 32,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/r/austinfood/comment_test_1/comment_2'
            },
            {
              comment_id: 'comment_3',
              content: 'Micklethwait Craft Meats has the best sausage in town. Their burnt ends are incredible too. Great beer selection.',
              author: 'austin_eats',
              upvotes: 28,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/r/austinfood/comment_test_1/comment_3'
            },
            {
              comment_id: 'comment_4',
              content: 'Agreed! Franklin is overrated though. Terry Black\'s has better brisket and no 3 hour wait. Their ribs are phenomenal.',
              author: 'local_bbq_expert',
              upvotes: 23,
              created_at: new Date().toISOString(),
              parent_id: 'comment_1',
              url: 'https://reddit.com/r/austinfood/comment_test_1/comment_4'
            },
            {
              comment_id: 'comment_5',
              content: 'Don\'t sleep on Stiles Switch! Their turkey is amazing and the mac and cheese side is incredible. Hidden gem.',
              author: 'bbq_connoisseur',
              upvotes: 19,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/r/austinfood/comment_test_1/comment_5'
            }
          ]
        },
        {
          post_id: 'comment_test_2',
          title: 'Sushi recommendations?',
          content: 'What are the best sushi places in Austin?',
          subreddit: 'austinfood',
          url: 'https://reddit.com/r/austinfood/comment_test_2',
          upvotes: 8,
          created_at: new Date().toISOString(),
          comments: [
            {
              comment_id: 'sushi_comment_1',
              content: 'Uchi is absolutely incredible. Their omakase is the best in the city. The hamachi is perfect and service is amazing.',
              author: 'sushi_lover',
              upvotes: 67,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/r/austinfood/comment_test_2/sushi_comment_1'
            },
            {
              comment_id: 'sushi_comment_2',
              content: 'Uchiko has the best atmosphere and their toro is incredible. Expensive but worth every penny for special occasions.',
              author: 'fine_dining_fan',
              upvotes: 34,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/r/austinfood/comment_test_2/sushi_comment_2'
            }
          ]
        }
      ]
    };
    
    console.log('📋 Test Input Summary:');
    console.log(`  Posts: ${testInput.posts.length}`);
    console.log(`  Total Comments: ${testInput.posts.reduce((sum, post) => sum + post.comments.length, 0)}`);
    console.log('');
    
    testInput.posts.forEach((post, postIndex) => {
      console.log(`  POST ${postIndex + 1}: "${post.title}" (${post.comments.length} comments)`);
      post.comments.forEach((comment, commentIndex) => {
        console.log(`    Comment ${commentIndex + 1}: "${comment.content.substring(0, 60)}..." (${comment.upvotes} upvotes)`);
      });
    });
    
    console.log('\n🧠 Processing through LLM...');
    const startTime = Date.now(); 
    const llmResult = await llmService.processContent(testInput);
    const processingTime = Date.now() - startTime;
    
    console.log(`✅ LLM Processing Results:`);
    console.log(`  Processing time: ${processingTime}ms`);
    console.log(`  Mentions extracted: ${llmResult.mentions.length}`);
    console.log('');
    
    if (llmResult.mentions.length > 0) {
      console.log('📋 Extracted Mentions:');
      llmResult.mentions.forEach((mention, index) => {
        console.log(`  ${index + 1}. ${mention.restaurant?.normalized_name || 'Unknown'} → ${mention.dish_or_category?.normalized_name || 'General'}`);
        console.log(`     Source: ${mention.source.type} (${mention.source.upvotes} upvotes)`);
        console.log(`     General praise: ${mention.general_praise}`);
        console.log(`     Menu item: ${mention.is_menu_item}`);
        if (mention.dish_attributes && mention.dish_attributes.length > 0) {
          console.log(`     Dish attributes: ${mention.dish_attributes.map(d => `${d.attribute} (${d.type})`).join(', ')}`);
        }
        if (mention.restaurant_attributes && mention.restaurant_attributes.length > 0) {
          console.log(`     Restaurant attributes: ${mention.restaurant_attributes.join(', ')}`);
        }
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
      
      if (entityInputs.length > 0) {
        const resolutionResult = await entityResolution.resolveBatch(entityInputs);
        
        console.log(`✅ Entity Resolution Results:`);
        console.log(`  Entities processed: ${resolutionResult.resolutionResults.length}`);
        console.log(`  New entities created: ${resolutionResult.newEntitiesCreated}`);
        console.log(`  Exact matches: ${resolutionResult.performanceMetrics.exactMatches}`);
        console.log(`  Fuzzy matches: ${resolutionResult.performanceMetrics.fuzzyMatches}`);
        console.log('');
        
        // Check database state
        const finalEntityCount = await entityRepo.count();
        const finalConnectionCount = await connectionRepo.count();
        
        console.log(`💾 Database State:`);
        console.log(`  Total entities: ${finalEntityCount}`);
        console.log(`  Total connections: ${finalConnectionCount}`);
        console.log('');
        
        // Sample some entities
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
        
        console.log('\n🎉 SUCCESS: Complete pipeline working with comment data!');
        console.log(`   ${llmResult.mentions.length} mentions extracted from ${testInput.posts.reduce((sum, post) => sum + post.comments.length, 0)} comments`);
        console.log(`   ${resolutionResult.newEntitiesCreated} new entities created`);
        console.log('   Real Reddit comments → LLM extraction → Entity resolution → Database storage');
        
      } else {
        console.log('⚠️  No entities to resolve');
      }
      
    } else {
      console.log('❌ No mentions extracted from comments');
      console.log('   This suggests an issue with the LLM processing or comment criteria');
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

testWithComments()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Test crashed:', error);
    process.exit(1);
  });