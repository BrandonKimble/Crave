/**
 * Jest global setup for integration tests
 * Handles database initialization and cleanup before tests run
 */

import { PrismaClient } from '@prisma/client';

export default async function globalSetup() {
  console.log('🔧 Setting up global test environment...');

  // Initialize Prisma client for setup
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
      },
    },
  });

  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connection established');

    // Clean up any existing test data from previous runs
    console.log('🧹 Cleaning up existing test data...');

    // Use raw SQL for faster cleanup of all test data
    await prisma.$executeRaw`
      DELETE FROM mentions 
      WHERE connection_id IN (
        SELECT c.connection_id 
        FROM connections c 
        JOIN entities r ON c.restaurant_id = r.entity_id 
        JOIN entities d ON c.dish_or_category_id = d.entity_id 
        WHERE r.name LIKE '%Integration%' 
           OR r.name LIKE '%Test%' 
           OR r.name LIKE '%Concurrent%'
           OR r.name LIKE '%Cross-Service%'
           OR d.name LIKE '%Integration%' 
           OR d.name LIKE '%Test%' 
           OR d.name LIKE '%Concurrent%'
           OR d.name LIKE '%Cross-Service%'
      );
    `;

    await prisma.$executeRaw`
      DELETE FROM connections 
      WHERE restaurant_id IN (
        SELECT entity_id FROM entities 
        WHERE name LIKE '%Integration%' 
           OR name LIKE '%Test%' 
           OR name LIKE '%Concurrent%'
           OR name LIKE '%Cross-Service%'
      ) OR dish_or_category_id IN (
        SELECT entity_id FROM entities 
        WHERE name LIKE '%Integration%' 
           OR name LIKE '%Test%' 
           OR name LIKE '%Concurrent%'
           OR name LIKE '%Cross-Service%'
      );
    `;

    await prisma.$executeRaw`
      DELETE FROM entities 
      WHERE name LIKE '%Integration%' 
         OR name LIKE '%Test%' 
         OR name LIKE '%Concurrent%'
         OR name LIKE '%Cross-Service%'
         OR google_place_id LIKE '%test-place%'
         OR google_place_id LIKE '%duplicate-google%'
         OR google_place_id LIKE '%unique-place%';
    `;

    console.log('✅ Test data cleanup completed');

    // Verify database schema is up to date
    const tableCount = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    `;

    console.log(`📊 Database has ${tableCount[0].count} tables`);
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }

  console.log('🚀 Global test environment setup complete');
}
