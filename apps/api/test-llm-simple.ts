/**
 * Simple LLM API Test - Diagnose Gemini API Issues
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.test file
dotenv.config({ path: path.join(__dirname, '.env.test') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { LLMService } from './src/modules/external-integrations/llm/llm.service';

async function testLLMSimple() {
  console.log('🧪 SIMPLE LLM API TEST - Diagnose Gemini Issues');
  console.log('================================================');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const llmService = app.get(LLMService);
    
    console.log('\n🔑 Testing LLM connection...');
    
    // Test the connection method first
    try {
      const connectionTest = await llmService.testConnection();
      console.log('✅ Connection test result:', connectionTest);
    } catch (error) {
      console.error('❌ Connection test failed:', error instanceof Error ? error.message : String(error));
      console.error('❌ Full error:', error);
    }
    
    console.log('\n🤖 Testing simple content processing...');
    
    // Test simple content processing
    const simpleInput = {
      posts: [{
        id: 'test_post',
        title: 'Test Austin Food Post: Franklin BBQ Review',
        extract_from_post: true,
        comments: [{
          id: 'test_comment',
          text: 'Franklin BBQ has the best brisket in Austin. Their burnt ends are amazing too!',
          ups: 25,
          depth: 0,
          created_at: new Date().toISOString(),
          url: 'https://reddit.com/r/austinfood/comments/test',
          replies: []
        }]
      }]
    };
    
    try {
      const result = await llmService.processContent(simpleInput);
      console.log('✅ Simple processing successful:', result.mentions.length, 'mentions extracted');
    } catch (error) {
      console.error('❌ Simple processing failed:', error instanceof Error ? error.message : String(error));
      console.error('❌ Full error details:', error);
      
      // Check if it's an axios error with response data
      if (error instanceof Error && 'response' in error) {
        const axiosError = error as any;
        console.error('❌ HTTP Status:', axiosError.response?.status);
        console.error('❌ Response Headers:', axiosError.response?.headers);
        console.error('❌ Response Data:', axiosError.response?.data);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : String(error));
  } finally {
    await app.close();
  }
}

// Run the test
testLLMSimple()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test error:', error);
    process.exit(1);
  });