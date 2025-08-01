#!/usr/bin/env ts-node

/**
 * Direct Gemini API Test
 * 
 * Tests the Gemini API directly to diagnose authentication/configuration issues
 */

import axios from 'axios';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testGeminiDirectly() {
  console.log('🔧 Testing Gemini API Directly');
  console.log('==============================');
  
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'gemini-2.5-flash-exp';
  const baseUrl = process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
  
  console.log(`API Key present: ${apiKey ? 'Yes (***' + apiKey.slice(-4) + ')' : 'No'}`);
  console.log(`Model: ${model}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log('');
  
  if (!apiKey) {
    console.log('❌ No GEMINI_API_KEY found in environment');
    return;
  }
  
  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
  console.log(`Request URL: ${url.replace(apiKey, '***')}`);
  
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'Say hello'
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 100
    }
  };
  
  console.log('Payload:', JSON.stringify(payload, null, 2));
  console.log('');
  
  try {
    console.log('🚀 Making request...');
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('✅ Success!');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log('❌ Axios Error:');
      console.log('Status:', error.response?.status);
      console.log('Status Text:', error.response?.statusText);
      console.log('Headers:', error.response?.headers);
      console.log('Data:', JSON.stringify(error.response?.data, null, 2));
      console.log('Message:', error.message);
      console.log('Code:', error.code);
    } else {
      console.log('❌ Unknown Error:', error);
    }
  }
}

testGeminiDirectly()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Test crashed:', error);
    process.exit(1);
  });