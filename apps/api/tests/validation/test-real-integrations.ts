#!/usr/bin/env ts-node

/**
 * Real Integration Test - Step by Step
 * 
 * Tests each service integration point individually with REAL data:
 * 1. Reddit API collection
 * 2. LLM processing with real content
 * 3. Entity resolution with real extracted entities
 * 4. Database operations with real resolved entities
 * 
 * This bypasses complex batch processing and focuses on core integration points.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { RedditService } from './src/modules/external-integrations/reddit/reddit.service';
import { LLMService } from './src/modules/external-integrations/llm/llm.service';
import { EntityResolutionService } from './src/modules/content-processing/entity-resolver/entity-resolution.service';
import { EntityRepository } from './src/repositories/entity.repository';
import { ConnectionRepository } from './src/repositories/connection.repository';
import { MentionRepository } from './src/repositories/mention.repository';
import { LoggerService } from './src/shared';

interface IntegrationTestResults {
  redditApi: {
    success: boolean;
    postsRetrieved: number;
    processingTime: number;
    error?: string;
  };
  llmProcessing: {
    success: boolean;
    contentProcessed: number;
    entitiesExtracted: number;
    processingTime: number;
    error?: string;
  };
  entityResolution: {
    success: boolean;
    entitiesResolved: number;
    newEntitiesCreated: number;
    processingTime: number;
    error?: string;
  };
  databaseOperations: {
    success: boolean;
    entitiesInDatabase: number;
    connectionsInDatabase: number;
    mentionsInDatabase: number;
    error?: string;
  };
}

async function testRealIntegrations(): Promise<IntegrationTestResults> {
  console.log('🧪 Starting Real Integration Tests');
  console.log('=================================');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();
  
  // Get services
  const redditService = app.get(RedditService);
  const llmService = app.get(LLMService);
  const entityResolution = app.get(EntityResolutionService);
  const entityRepo = app.get(EntityRepository);
  const connectionRepo = app.get(ConnectionRepository);
  const mentionRepo = app.get(MentionRepository);
  const logger = app.get(LoggerService).setContext('IntegrationTest');
  
  const results: IntegrationTestResults = {
    redditApi: { success: false, postsRetrieved: 0, processingTime: 0 },
    llmProcessing: { success: false, contentProcessed: 0, entitiesExtracted: 0, processingTime: 0 },
    entityResolution: { success: false, entitiesResolved: 0, newEntitiesCreated: 0, processingTime: 0 },
    databaseOperations: { success: false, entitiesInDatabase: 0, connectionsInDatabase: 0, mentionsInDatabase: 0 }
  };

  try {
    // TEST 1: Reddit API Collection
    console.log('\\n🔗 TEST 1: Reddit API Collection');
    console.log('-------------------------------');
    
    const redditStartTime = Date.now();
    
    try {
      const redditResult = await redditService.getChronologicalPosts('austinfood', 5);
      
      results.redditApi.success = true;
      results.redditApi.postsRetrieved = redditResult.data.length;
      results.redditApi.processingTime = Date.now() - redditStartTime;
      
      console.log(`✅ Reddit API test successful:`);
      console.log(`   Posts retrieved: ${results.redditApi.postsRetrieved}`);
      console.log(`   Processing time: ${results.redditApi.processingTime}ms`);
      
      if (results.redditApi.postsRetrieved === 0) {
        console.log('⚠️  No posts retrieved - may indicate rate limiting or API issues');
      }
      
      // TEST 2: LLM Processing with Real Reddit Data
      if (results.redditApi.postsRetrieved > 0) {
        console.log('\\n🧠 TEST 2: LLM Content Processing');
        console.log('---------------------------------');
        
        const llmStartTime = Date.now();
        
        try {
          // Convert Reddit data to LLM input format
          const llmInput = {
            posts: redditResult.data.slice(0, 3).map((post: any) => ({
              post_id: post.id || 'unknown',
              title: post.title || '',
              content: post.selftext || post.body || '',
              subreddit: post.subreddit || 'austinfood',
              url: `https://reddit.com${post.permalink || ''}`,
              upvotes: post.score || 0,
              created_at: new Date((post.created_utc || Date.now() / 1000) * 1000).toISOString(),
              comments: []
            }))
          };
          
          console.log(`Processing ${llmInput.posts.length} posts through LLM...`);
          console.log(`Sample post titles: ${llmInput.posts.map(p => p.title.substring(0, 50)).join(', ')}`);
          
          const llmResult = await llmService.processContent(llmInput);
          
          results.llmProcessing.success = true;
          results.llmProcessing.contentProcessed = llmInput.posts.length;
          results.llmProcessing.entitiesExtracted = llmResult.mentions?.length || 0;
          results.llmProcessing.processingTime = Date.now() - llmStartTime;
          
          console.log(`✅ LLM processing successful:`);
          console.log(`   Content pieces processed: ${results.llmProcessing.contentProcessed}`);
          console.log(`   Entities extracted: ${results.llmProcessing.entitiesExtracted}`);
          console.log(`   Processing time: ${results.llmProcessing.processingTime}ms`);
          
          if (results.llmProcessing.entitiesExtracted > 0) {
            console.log(`   Sample entities: ${llmResult.mentions.slice(0, 3).map(m => 
              m.restaurant?.normalized_name || 'unnamed restaurant'
            ).join(', ')}`);
          }
          
          // TEST 3: Entity Resolution with Real LLM Output
          if (results.llmProcessing.entitiesExtracted > 0) {
            console.log('\\n🎯 TEST 3: Entity Resolution');
            console.log('----------------------------');
            
            const entityStartTime = Date.now();
            
            try {
              // Convert LLM output to entity resolution input
              const entityInput = llmResult.mentions.map(mention => ({
                tempId: mention.temp_id,
                normalizedName: mention.restaurant?.normalized_name || 'unknown',
                originalText: mention.restaurant?.original_text || 'unknown',
                entityType: 'restaurant' as const,
                aliases: []
              })).filter(e => e.normalizedName !== 'unknown'); // Only process entities with names
              
              console.log(`Resolving ${entityInput.length} entities...`);
              
              const entityResult = await entityResolution.resolveBatch(entityInput);
              
              results.entityResolution.success = true;
              results.entityResolution.entitiesResolved = entityResult.resolutionResults.length;
              results.entityResolution.newEntitiesCreated = entityResult.newEntitiesCreated;
              results.entityResolution.processingTime = Date.now() - entityStartTime;
              
              console.log(`✅ Entity resolution successful:`);
              console.log(`   Entities resolved: ${results.entityResolution.entitiesResolved}`);
              console.log(`   New entities created: ${results.entityResolution.newEntitiesCreated}`);
              console.log(`   Processing time: ${results.entityResolution.processingTime}ms`);
              
            } catch (entityError) {
              const errorMessage = entityError instanceof Error ? entityError.message : String(entityError);
              results.entityResolution.error = errorMessage;
              console.log(`❌ Entity resolution failed: ${errorMessage}`);
            }
          } else {
            console.log('⚠️  No entities extracted from LLM, skipping entity resolution test');
          }
          
        } catch (llmError) {
          const errorMessage = llmError instanceof Error ? llmError.message : String(llmError);
          results.llmProcessing.error = errorMessage;
          console.log(`❌ LLM processing failed: ${errorMessage}`);
          if (llmError instanceof Error && llmError.stack) {
            console.log(`   Stack trace: ${llmError.stack}`);
          }
        }
      } else {
        console.log('⚠️  No Reddit data available, skipping LLM processing test');
      }
      
    } catch (redditError) {
      const errorMessage = redditError instanceof Error ? redditError.message : String(redditError);
      results.redditApi.error = errorMessage;
      console.log(`❌ Reddit API test failed: ${errorMessage}`);
    }
    
    // TEST 4: Database State Verification
    console.log('\\n💾 TEST 4: Database State Verification');
    console.log('-------------------------------------');
    
    try {
      const entityCount = await entityRepo.count();
      const connectionCount = await connectionRepo.count();
      const mentionCount = await mentionRepo.count();
      
      results.databaseOperations.success = true;
      results.databaseOperations.entitiesInDatabase = entityCount;
      results.databaseOperations.connectionsInDatabase = connectionCount;
      results.databaseOperations.mentionsInDatabase = mentionCount;
      
      console.log(`✅ Database verification successful:`);
      console.log(`   Entities in database: ${results.databaseOperations.entitiesInDatabase}`);
      console.log(`   Connections in database: ${results.databaseOperations.connectionsInDatabase}`);
      console.log(`   Mentions in database: ${results.databaseOperations.mentionsInDatabase}`);
      
    } catch (dbError) {
      const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
      results.databaseOperations.error = errorMessage;
      console.log(`❌ Database verification failed: ${errorMessage}`);
    }
    
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logger.error('Integration test failed', errorObj);
    console.log(`❌ Integration test crashed: ${errorObj.message}`);
  } finally {
    await app.close();
  }
  
  return results;
}

function generateIntegrationReport(results: IntegrationTestResults): void {
  console.log('\\n📊 INTEGRATION TEST RESULTS');
  console.log('============================');
  
  const totalSuccesses = [
    results.redditApi.success,
    results.llmProcessing.success,
    results.entityResolution.success,
    results.databaseOperations.success
  ].filter(Boolean).length;
  
  const totalTests = 4;
  const successRate = (totalSuccesses / totalTests) * 100;
  
  console.log(`\\n🎯 Overall Success Rate: ${totalSuccesses}/${totalTests} (${successRate.toFixed(1)}%)`);
  console.log('');
  
  // Individual test results
  console.log('📋 Individual Test Results:');
  console.log(`   🔗 Reddit API Collection: ${results.redditApi.success ? '✅ PASS' : '❌ FAIL'}`);
  if (results.redditApi.success) {
    console.log(`      Posts retrieved: ${results.redditApi.postsRetrieved}`);
    console.log(`      Time: ${results.redditApi.processingTime}ms`);
  } else if (results.redditApi.error) {
    console.log(`      Error: ${results.redditApi.error}`);
  }
  
  console.log(`   🧠 LLM Processing: ${results.llmProcessing.success ? '✅ PASS' : '❌ FAIL'}`);
  if (results.llmProcessing.success) {
    console.log(`      Content processed: ${results.llmProcessing.contentProcessed}`);
    console.log(`      Entities extracted: ${results.llmProcessing.entitiesExtracted}`);
    console.log(`      Time: ${results.llmProcessing.processingTime}ms`);
  } else if (results.llmProcessing.error) {
    console.log(`      Error: ${results.llmProcessing.error}`);
  }
  
  console.log(`   🎯 Entity Resolution: ${results.entityResolution.success ? '✅ PASS' : '❌ FAIL'}`);
  if (results.entityResolution.success) {
    console.log(`      Entities resolved: ${results.entityResolution.entitiesResolved}`);
    console.log(`      New entities created: ${results.entityResolution.newEntitiesCreated}`);
    console.log(`      Time: ${results.entityResolution.processingTime}ms`);
  } else if (results.entityResolution.error) {
    console.log(`      Error: ${results.entityResolution.error}`);
  }
  
  console.log(`   💾 Database Operations: ${results.databaseOperations.success ? '✅ PASS' : '❌ FAIL'}`);
  if (results.databaseOperations.success) {
    console.log(`      Entities: ${results.databaseOperations.entitiesInDatabase}`);
    console.log(`      Connections: ${results.databaseOperations.connectionsInDatabase}`);
    console.log(`      Mentions: ${results.databaseOperations.mentionsInDatabase}`);
  } else if (results.databaseOperations.error) {
    console.log(`      Error: ${results.databaseOperations.error}`);
  }
  
  console.log('');
  
  // Assessment
  if (successRate >= 75) {
    console.log('🎉 INTEGRATION SUCCESS: Core data pipeline is working!');
    console.log('   The real data flow from Reddit → LLM → Database is functional.');
  } else if (successRate >= 50) {
    console.log('⚠️  PARTIAL SUCCESS: Some integrations working, others need fixes.');
  } else {
    console.log('❌ INTEGRATION FAILURE: Major issues prevent real data processing.');
  }
  
  console.log('');
  console.log('🔍 Next Steps:');
  if (!results.redditApi.success) {
    console.log('   - Check Reddit API credentials and rate limits');
  }
  if (!results.llmProcessing.success) {
    console.log('   - Verify LLM API key and service configuration');
  }
  if (!results.entityResolution.success) {
    console.log('   - Check entity resolution service and database connectivity');
  }
  if (!results.databaseOperations.success) {
    console.log('   - Verify database connection and migrations');
  }
  
  if (successRate >= 75) {
    console.log('   - Ready to test larger data volumes');
    console.log('   - Consider implementing archive processing integration');
  }
}

// Run the integration tests
if (require.main === module) {
  testRealIntegrations()
    .then(results => {
      generateIntegrationReport(results);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Integration test crashed:', error);
      process.exit(1);
    });
}

export { testRealIntegrations, IntegrationTestResults };