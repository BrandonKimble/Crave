/**
 * Quick Optimization Logic Test
 * 
 * Tests the optimization algorithms without requiring full NestJS setup
 */

async function testOptimizationLogic() {
  console.log('🧮 TESTING OPTIMIZATION LOGIC');
  console.log('=============================');
  console.log('');

  // Test delay strategy calculations
  console.log('📊 DELAY STRATEGY CALCULATIONS:');
  console.log('');

  const workerCount = 16;
  const baseDelay = 50; // ms

  // Test different strategies
  const strategies = [
    { name: 'none', delayMs: 0 },
    { name: 'linear', delayMs: baseDelay },
    { name: 'exponential', delayMs: baseDelay },
    { name: 'jittered', delayMs: baseDelay },
  ];

  for (const strategy of strategies) {
    console.log(`🔧 Strategy: ${strategy.name.toUpperCase()}`);
    console.log(`   Base delay: ${strategy.delayMs}ms`);
    
    // Calculate delays for first 8 workers
    const delays: number[] = [];
    for (let i = 0; i < Math.min(8, workerCount); i++) {
      let delay: number = 0;
      
      switch (strategy.name) {
        case 'none':
          delay = 0;
          break;
        case 'linear':
          delay = i * strategy.delayMs;
          break;
        case 'exponential':
          delay = strategy.delayMs * Math.pow(1.5, i);
          break;
        case 'jittered':
          const jitter = Math.random() * strategy.delayMs;
          delay = (i * strategy.delayMs) + jitter;
          break;
      }
      delays.push(delay);
    }
    
    console.log(`   Worker delays: [${delays.map(d => d.toFixed(0) + 'ms').join(', ')}...]`);
    
    // Calculate burst rate
    let totalSpreadMs = 0;
    if (strategy.name !== 'none' && strategy.delayMs > 0) {
      switch (strategy.name) {
        case 'linear':
          totalSpreadMs = (workerCount - 1) * strategy.delayMs;
          break;
        case 'exponential':
          totalSpreadMs = strategy.delayMs * Math.pow(1.5, workerCount - 1);
          break;
        case 'jittered':
          totalSpreadMs = (workerCount - 1) * strategy.delayMs + strategy.delayMs;
          break;
      }
    }
    
    const totalSpreadSeconds = Math.max(totalSpreadMs / 1000, 0.01);
    const burstRate = workerCount / totalSpreadSeconds;
    
    console.log(`   Total spread: ${totalSpreadMs.toFixed(0)}ms`);
    console.log(`   Burst rate: ${burstRate.toFixed(1)} req/sec`);
    
    // Check if within limits
    const withinVertexLimits = burstRate <= 100; // 50-100 req/sec tolerance
    console.log(`   Within Vertex AI limits (≤100 req/sec): ${withinVertexLimits ? '✅' : '❌'}`);
    console.log('');
  }

  // Test configuration ranking
  console.log('🏆 CONFIGURATION RANKING TEST:');
  console.log('');

  // Mock test results
  const mockResults = [
    { workerCount: 4, delayStrategy: 'none', delayMs: 0, successRate: 100, throughput: 8.5, rateLimit429Count: 0, errorCount: 0, burstRate: 400 },
    { workerCount: 8, delayStrategy: 'none', delayMs: 0, successRate: 100, throughput: 15.2, rateLimit429Count: 0, errorCount: 0, burstRate: 800 },
    { workerCount: 12, delayStrategy: 'none', delayMs: 0, successRate: 85, throughput: 18.1, rateLimit429Count: 2, errorCount: 3, burstRate: 1200 },
    { workerCount: 16, delayStrategy: 'none', delayMs: 0, successRate: 70, throughput: 20.3, rateLimit429Count: 5, errorCount: 8, burstRate: 1600 },
    { workerCount: 12, delayStrategy: 'linear', delayMs: 50, successRate: 100, throughput: 17.8, rateLimit429Count: 0, errorCount: 0, burstRate: 21.8 },
    { workerCount: 16, delayStrategy: 'linear', delayMs: 50, successRate: 100, throughput: 22.1, rateLimit429Count: 0, errorCount: 0, burstRate: 21.3 },
  ];

  console.log('📋 Mock test results:');
  mockResults.forEach((result, i) => {
    console.log(`   ${i + 1}. ${result.workerCount}w/${result.delayStrategy}/${result.delayMs}ms: ${result.successRate}% success, ${result.throughput} req/s, ${result.rateLimit429Count} rate limits`);
  });
  console.log('');

  // Filter viable configurations
  const viableConfigs = mockResults.filter(r => 
    r.successRate >= 95 && 
    r.rateLimit429Count === 0 &&
    r.errorCount <= 1
  );

  console.log('✅ Viable configurations (≥95% success, no rate limits):');
  viableConfigs.forEach((config, i) => {
    console.log(`   ${i + 1}. ${config.workerCount} workers, ${config.delayStrategy} strategy, ${config.delayMs}ms delay`);
    console.log(`      Throughput: ${config.throughput} req/s, Burst: ${config.burstRate.toFixed(1)} req/s`);
  });
  console.log('');

  // Find optimal (highest throughput among viable)
  if (viableConfigs.length > 0) {
    const optimal = viableConfigs.sort((a, b) => b.throughput - a.throughput)[0];
    console.log('🏆 OPTIMAL CONFIGURATION:');
    console.log(`   Workers: ${optimal.workerCount}`);
    console.log(`   Strategy: ${optimal.delayStrategy}`);
    console.log(`   Delay: ${optimal.delayMs}ms`);
    console.log(`   Expected throughput: ${optimal.throughput} req/s`);
    console.log(`   Expected burst rate: ${optimal.burstRate.toFixed(1)} req/s`);
    console.log(`   Success rate: ${optimal.successRate}%`);
  } else {
    console.log('❌ No viable configurations found in test data');
  }

  console.log('');
  console.log('🎯 OPTIMIZATION INSIGHTS:');
  console.log('   • Linear delay strategy maintains high throughput while reducing burst rate');
  console.log('   • 16 workers with 50ms linear delay ≈ 21 req/s burst (within limits)');
  console.log('   • Higher worker counts need delays to avoid rate limiting');
  console.log('   • Exponential delays spread requests too much, reducing efficiency');
  console.log('   • Jittered delays help avoid thundering herd but add unpredictability');
  console.log('');
  console.log('✅ Optimization logic test completed');
}

// Run the test
if (require.main === module) {
  testOptimizationLogic()
    .then(() => {
      console.log('✅ Logic test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Logic test failed:', error);
      process.exit(1);
    });
}