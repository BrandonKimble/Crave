#!/usr/bin/env ts-node

/**
 * Test with 10 Hand-Crafted Comments
 * 
 * Uses carefully crafted comments that should definitely extract entities
 * to isolate and fix the LLM parsing issue
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { LLMService } from './src/modules/external-integrations/llm/llm.service';
import { EntityResolutionService } from './src/modules/content-processing/entity-resolver/entity-resolution.service';
import { EntityRepository } from './src/repositories/entity.repository';
import { ConnectionRepository } from './src/repositories/connection.repository';
import { LoggerService } from './src/shared';

async function testHandcraftedComments() {
  console.log('🚀 Testing 10 Hand-Crafted Comments');
  console.log('====================================');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();
  
  const llmService = app.get(LLMService);
  const entityResolution = app.get(EntityResolutionService);
  const entityRepo = app.get(EntityRepository);
  const connectionRepo = app.get(ConnectionRepository);
  const logger = app.get(LoggerService).setContext('HandcraftedTest');
  
  try {
    // Create 10 perfect comments that should definitely work
    const testInput = {
      posts: [
        {
          post_id: 'handcrafted_test',
          title: 'Austin Food Recommendations',
          content: 'Looking for great food in Austin',
          subreddit: 'austinfood',
          url: 'https://reddit.com/handcrafted_test',
          upvotes: 10,
          created_at: new Date().toISOString(),
          comments: [
            {
              comment_id: 'comment_1',
              content: 'Franklin BBQ has the best brisket in Austin. The burnt ends are incredible too!',
              author: 'bbq_lover',
              upvotes: 45,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/handcrafted_test/1'
            },
            {
              comment_id: 'comment_2',
              content: 'Uchi serves amazing sushi. Their hamachi is absolutely perfect and the omakase is outstanding.',
              author: 'sushi_fan',
              upvotes: 38,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/handcrafted_test/2'
            },
            {
              comment_id: 'comment_3',
              content: 'La Barbecue makes fantastic pulled pork sandwiches. The coleslaw is fresh and delicious.',
              author: 'food_critic',
              upvotes: 32,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/handcrafted_test/3'
            },
            {
              comment_id: 'comment_4',
              content: 'Terry Blacks has incredible ribs. Their brisket is tender and smoky. Best BBQ joint in town!',
              author: 'austin_eats',
              upvotes: 29,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/handcrafted_test/4'
            },
            {
              comment_id: 'comment_5',
              content: 'Hopdoddy makes the best burgers in Austin. The truffle fries are amazing and the shakes are perfect.',
              author: 'burger_expert',
              upvotes: 26,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/handcrafted_test/5'
            },
            {
              comment_id: 'comment_6',
              content: 'Torchys Tacos has fantastic breakfast tacos. The trailer park taco is incredible!',
              author: 'taco_tuesday',
              upvotes: 24,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/handcrafted_test/6'
            },
            {
              comment_id: 'comment_7',
              content: 'Salt Lick BBQ serves excellent beef ribs. The sauce is tangy and the atmosphere is great.',
              author: 'bbq_connoisseur',
              upvotes: 22,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/handcrafted_test/7'
            },
            {
              comment_id: 'comment_8',
              content: 'Justines has amazing French cuisine. The duck confit is perfectly prepared and the wine selection is outstanding.',
              author: 'fine_dining',
              upvotes: 20,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/handcrafted_test/8'
            },
            {
              comment_id: 'comment_9',
              content: 'Matts El Rancho makes the best enchiladas in Austin. The queso is creamy and the margaritas are strong.',
              author: 'tex_mex_lover',
              upvotes: 18,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/handcrafted_test/9'
            },
            {
              comment_id: 'comment_10',
              content: 'Amys Ice Cream has incredible flavors. The sweet cream is my favorite and the Mexican vanilla is amazing.',
              author: 'ice_cream_addict',
              upvotes: 16,
              created_at: new Date().toISOString(),
              parent_id: null,
              url: 'https://reddit.com/handcrafted_test/10'
            }
          ]
        }
      ]
    };
    
    console.log('📋 Test Input Summary:');
    console.log(`  Comments: ${testInput.posts[0].comments.length}`);
    console.log('  Each comment contains:');
    console.log('    - Clear restaurant name');
    console.log('    - Specific dish mentions');
    console.log('    - Positive sentiment');
    console.log('    - High upvote counts');
    console.log('');
    
    testInput.posts[0].comments.forEach((comment, index) => {
      console.log(`  ${index + 1}. "${comment.content.substring(0, 60)}..." (${comment.upvotes} upvotes)`);
    });
    
    console.log('\n🔍 Testing LLM Processing with Debug...');
    const startTime = Date.now();
    
    // Add detailed logging before LLM call
    console.log('About to call LLM service...');
    
    try {
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
          console.log('');
        });
        
        // Test Entity Resolution with successful extractions
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
          
          // Check final state
          const finalEntityCount = await entityRepo.count();
          const finalConnectionCount = await connectionRepo.count();
          
          console.log(`\n💾 Database State:`);
          console.log(`  Total entities: ${finalEntityCount}`);
          console.log(`  Total connections: ${finalConnectionCount}`);
          
          console.log('\n🎉 HANDCRAFTED COMMENTS TEST SUCCESS!');
          console.log(`   ${llmResult.mentions.length} mentions extracted from ${testInput.posts[0].comments.length} perfect comments`);
          console.log(`   ${resolutionResult.newEntitiesCreated} new entities created`);
          console.log('   LLM processing is working correctly!');
          
        } else {
          console.log('⚠️  No entities to resolve');
        }
        
      } else {
        console.log('❌ PARSING ISSUE: No mentions extracted from perfect comments');
        console.log('   This confirms the LLM parsing issue needs to be fixed');
        
        // Let's debug what the LLM actually returned
        console.log('\n🔍 LLM SERVICE DEBUG:');
        console.log('   The comments should have extracted 20+ mentions easily');
        console.log('   Each comment has clear restaurant + dish + positive sentiment');
        console.log('   This suggests the parsing logic is not handling Gemini 2.5-flash preview responses correctly');
      }
      
    } catch (llmError) {
      const errorMessage = llmError instanceof Error ? llmError.message : String(llmError);
      console.log(`❌ LLM Processing failed: ${errorMessage}`);
      
      if (llmError instanceof Error && llmError.stack) {
        console.log(`Stack: ${llmError.stack}`);
      }
      
      console.log('\n🔍 ERROR ANALYSIS:');
      if (errorMessage.includes('Empty text content')) {
        console.log('   CONFIRMED: Gemini 2.5-flash preview parsing issue');
        console.log('   The API returns content but our parser thinks it is empty');
        console.log('   Need to debug the parseResponse method in LLM service');
      }
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Handcrafted test failed', error as Error);
    console.log(`❌ Test failed: ${errorMessage}`);
  } finally {
    await app.close();
  }
}

testHandcraftedComments()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Test crashed:', error);
    process.exit(1);
  });