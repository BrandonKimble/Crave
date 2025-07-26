/**
 * Jest global teardown for integration tests
 * Handles cleanup after all tests complete
 */

import { PrismaClient } from '@prisma/client';

export default async function globalTeardown() {
  console.log('🧹 Starting global test cleanup...');

  // Initialize Prisma client for teardown
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
      },
    },
  });

  try {
    await prisma.$connect();

    // Final cleanup of any remaining test data
    console.log('🗑️ Cleaning up remaining test data...');

    // Use raw SQL for comprehensive cleanup
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
           OR r.name LIKE '%Transactional%'
           OR r.name LIKE '%Dual Purpose%'
           OR d.name LIKE '%Integration%' 
           OR d.name LIKE '%Test%' 
           OR d.name LIKE '%Concurrent%'
           OR d.name LIKE '%Cross-Service%'
           OR d.name LIKE '%Transactional%'
           OR d.name LIKE '%Dual Purpose%'
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
           OR name LIKE '%Transactional%'
           OR name LIKE '%Dual Purpose%'
      ) OR dish_or_category_id IN (
        SELECT entity_id FROM entities 
        WHERE name LIKE '%Integration%' 
           OR name LIKE '%Test%' 
           OR name LIKE '%Concurrent%'
           OR name LIKE '%Cross-Service%'
           OR name LIKE '%Transactional%'
           OR name LIKE '%Dual Purpose%'
      );
    `;

    await prisma.$executeRaw`
      DELETE FROM entities 
      WHERE name LIKE '%Integration%' 
         OR name LIKE '%Test%' 
         OR name LIKE '%Concurrent%'
         OR name LIKE '%Cross-Service%'
         OR name LIKE '%Transactional%'
         OR name LIKE '%Dual Purpose%'
         OR name LIKE '%Updated%'
         OR name LIKE '%Invalid%'
         OR name LIKE '%Restaurant 1%'
         OR name LIKE '%Restaurant 2%'
         OR name LIKE '%Entity To Delete%'
         OR name LIKE '%Duplicate%'
         OR name LIKE '%Far Away%'
         OR name LIKE '%Other%'
         OR name LIKE '%Simple%'
         OR name LIKE '%Spicy%'
         OR name LIKE '%Patio%'
         OR name LIKE '%Vegan%'
         OR google_place_id LIKE '%test-place%'
         OR google_place_id LIKE '%duplicate-google%'
         OR google_place_id LIKE '%unique-place%'
         OR google_place_id LIKE '%far-away%'
         OR google_place_id LIKE '%other-place%';
    `;

    console.log('✅ Global cleanup completed');
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw to avoid failing the entire test suite
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Database connection closed');
  }

  console.log('🏁 Global test cleanup complete');
}
