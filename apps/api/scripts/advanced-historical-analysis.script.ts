import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { RedditService } from '../src/modules/external-integrations/reddit/reddit.service';

interface ExtendedHistoricalResults {
  timeDepth: '3m' | '1y';
  results: {
    totalPosts: number;
    totalComments: number;
    dataQualityScore: number;
    timeSpanCovered: number; // Days
    completenessRatio: number;
    averagePostAge: number; // Days
    apiPerformance: {
      totalApiCalls: number;
      totalResponseTime: number;
      averageResponseTime: number;
      rateLimitHit: boolean;
    };
    limitations: {
      hitHardLimit: boolean;
      maxItemsReturned: number;
      missingDataGaps: string[];
      dataGaps: string[];
    };
  };
  paginationAnalysis: {
    totalPages: number;
    commentsPerPage: number;
    oldestCommentAge: number; // Hours
    newestCommentAge: number; // Hours
    paginationGaps: string[];
  };
  comparison: {
    vsBaseline: {
      improvement: number; // Percentage
      additionalData: number;
      qualityDifference: number;
    };
  };
}

interface PushshiftAnalysisResults {
  availability: {
    isAccessible: boolean;
    accessMethod: string;
    limitations: string[];
    lastWorkingDate: string;
  };
  dataComparison: {
    redditApiCoverage: number;
    pushshiftCoverage: number; // Theoretical
    dataGapAnalysis: string[];
  };
  recommendations: {
    viability: 'viable' | 'limited' | 'not_viable';
    alternativeApproaches: string[];
    riskAssessment: string[];
  };
}

interface StrategicRecommendations {
  dataCollectionStrategy: {
    primaryMethod: string;
    fallbackMethods: string[];
    hybridApproach: boolean;
  };
  architecturalGuidance: {
    storageStrategy: string[];
    cachingStrategy: string[];
    updateFrequency: string;
    qualityAssurance: string[];
  };
  economicConsiderations: {
    costEfficiency: string;
    scalabilityFactors: string[];
    riskMitigation: string[];
  };
  implementation: {
    phaseOne: string[];
    phaseTwo: string[];
    futureConsiderations: string[];
  };
}

async function testExtendedHistoricalAccess(
  redditService: RedditService,
  timeDepth: '3m' | '1y',
  logger: Logger,
): Promise<ExtendedHistoricalResults> {
  logger.log(
    `🔍 Testing extended historical access for ${timeDepth} time depth`,
  );

  try {
    // Step 1: Test basic historical data access
    logger.log(`📊 Step 1: Basic historical data retrieval for ${timeDepth}`);
    const startTime = Date.now();

    const basicResults = await redditService.getHistoricalPosts(timeDepth);

    logger.log(
      `✅ Basic historical retrieval completed: ${basicResults.metadata.totalRetrieved} posts`,
    );
    logger.log(
      `📈 Data quality score: ${basicResults.metadata.dataQualityScore}`,
    );
    logger.log(
      `⏱️  Performance: ${basicResults.performance.responseTime}ms, ${basicResults.performance.apiCallsUsed} API calls`,
    );

    // Step 2: Test pagination for comprehensive historical access
    logger.log(
      `📚 Step 2: Testing pagination for comprehensive historical coverage`,
    );

    const paginationResults =
      await redditService.testHistoricalDataPagination();

    logger.log(
      `✅ Pagination test completed: ${paginationResults.paginationTest.totalComments} comments across ${paginationResults.paginationTest.totalPages} pages`,
    );
    logger.log(
      `📅 Time span covered: ${paginationResults.paginationTest.timeSpanCovered.toFixed(
        1,
      )} hours`,
    );
    logger.log(
      `🎯 Data completeness score: ${paginationResults.dataQuality.completenessScore}%`,
    );

    // Step 3: Test comment depth for sample historical posts
    logger.log(`🗣️  Step 3: Testing historical comment access depth`);

    let totalComments = 0;
    const commentSamples = basicResults.posts.slice(0, 5); // Test first 5 posts

    for (const post of commentSamples) {
      try {
        const postId = post.data.id;
        const postAge =
          (Date.now() / 1000 - post.data.created_utc) / (24 * 60 * 60); // Days

        const commentResult = await redditService.getHistoricalComments(
          postId,
          timeDepth,
        );
        totalComments += commentResult.commentCount;

        logger.debug(
          `📝 Post ${postId} (${postAge.toFixed(1)} days old): ${
            commentResult.commentCount
          } comments, max depth: ${commentResult.threadDepth.maxDepth}`,
        );
      } catch (error) {
        logger.warn(`⚠️  Failed to get comments for post: ${error}`);
      }
    }

    // Calculate comprehensive analysis
    const totalResponseTime = Date.now() - startTime;
    const timeSpanDays = paginationResults.paginationTest.timeSpanCovered / 24;
    const averagePostAgeDays =
      basicResults.metadata.averagePostAge / (24 * 60 * 60);

    // Compare with baseline (1m results as baseline)
    let comparisonResults = {
      improvement: 0,
      additionalData: 0,
      qualityDifference: 0,
    };

    if (timeDepth === '3m' || timeDepth === '1y') {
      // For comparison, we can compare against expected baseline values
      const baselineExpected = timeDepth === '3m' ? 1000 : 2000; // Expected posts for baseline
      comparisonResults = {
        improvement:
          ((basicResults.metadata.totalRetrieved - baselineExpected) /
            baselineExpected) *
          100,
        additionalData: basicResults.metadata.totalRetrieved - baselineExpected,
        qualityDifference: basicResults.metadata.dataQualityScore - 70, // Assume 70% baseline
      };
    }

    const results: ExtendedHistoricalResults = {
      timeDepth,
      results: {
        totalPosts: basicResults.metadata.totalRetrieved,
        totalComments:
          totalComments + paginationResults.paginationTest.totalComments,
        dataQualityScore: basicResults.metadata.dataQualityScore,
        timeSpanCovered: timeSpanDays,
        completenessRatio: basicResults.metadata.completenessRatio,
        averagePostAge: averagePostAgeDays,
        apiPerformance: {
          totalApiCalls:
            basicResults.performance.apiCallsUsed +
            paginationResults.performance.apiCallsUsed +
            commentSamples.length,
          totalResponseTime: totalResponseTime,
          averageResponseTime: basicResults.performance.responseTime,
          rateLimitHit:
            basicResults.performance.rateLimitHit ||
            paginationResults.limitations.rateLimitEncountered,
        },
        limitations: {
          hitHardLimit:
            basicResults.limitations.hitHardLimit ||
            paginationResults.limitations.hitApiLimit,
          maxItemsReturned: basicResults.limitations.maxItemsReturned,
          missingDataGaps: basicResults.limitations.missingDataGaps,
          dataGaps: paginationResults.limitations.paginationGaps,
        },
      },
      paginationAnalysis: {
        totalPages: paginationResults.paginationTest.totalPages,
        commentsPerPage: paginationResults.paginationTest.avgCommentsPerPage,
        oldestCommentAge: paginationResults.paginationTest.oldestCommentAge,
        newestCommentAge: paginationResults.paginationTest.newestCommentAge,
        paginationGaps: paginationResults.limitations.paginationGaps,
      },
      comparison: {
        vsBaseline: comparisonResults,
      },
    };

    logger.log(`🎉 Extended historical analysis completed for ${timeDepth}`);
    logger.log(
      `📊 Summary: ${results.results.totalPosts} posts, ${results.results.totalComments} comments`,
    );
    logger.log(
      `⏰ Time span: ${results.results.timeSpanCovered.toFixed(1)} days`,
    );
    logger.log(`🎯 Quality score: ${results.results.dataQualityScore}%`);

    return results;
  } catch (error) {
    logger.error(
      `❌ Extended historical analysis failed for ${timeDepth}: ${error}`,
    );
    throw error;
  }
}

async function analyzePushshiftCapabilities(
  redditService: RedditService,
  logger: Logger,
): Promise<PushshiftAnalysisResults> {
  logger.log(`🔬 Analyzing Pushshift API capabilities and alternatives`);

  try {
    // Step 1: Test Pushshift API access (will likely fail due to deprecation)
    logger.log(`📡 Step 1: Testing Pushshift API accessibility`);

    const pushshiftResults = await redditService.getPushshiftHistoricalData(
      '1m',
    );

    logger.log(`📊 Pushshift test results:`);
    logger.log(`  - Posts retrieved: ${pushshiftResults.posts.length}`);
    logger.log(`  - Limitations: ${pushshiftResults.limitations.length}`);
    logger.log(
      `  - Recommendations: ${pushshiftResults.recommendations.length}`,
    );

    // Step 2: Compare with Reddit API baseline
    logger.log(`⚖️  Step 2: Comparing Reddit API vs Pushshift coverage`);

    const redditBaseline = await redditService.getHistoricalPosts('1m');

    // Analysis of availability and limitations
    const isAccessible = pushshiftResults.posts.length > 0;
    const accessMethod = isAccessible ? 'direct_api' : 'deprecated';

    const dataComparison = {
      redditApiCoverage: redditBaseline.metadata.totalRetrieved,
      pushshiftCoverage: pushshiftResults.posts.length,
      dataGapAnalysis: [
        `Reddit API provides ${redditBaseline.metadata.totalRetrieved} posts for 1-month period`,
        `Pushshift API provides ${pushshiftResults.posts.length} posts (deprecated)`,
        'Reddit API limited to 1000 items per time period',
        'Pushshift API no longer publicly accessible as of May 2023',
        'Data completeness gap exists for comprehensive historical analysis',
      ],
    };

    // Generate viability assessment
    let viability: 'viable' | 'limited' | 'not_viable' = 'not_viable';
    if (isAccessible) {
      viability =
        redditBaseline.metadata.totalRetrieved > 500 ? 'viable' : 'limited';
    }

    const alternativeApproaches = [
      'Reddit Data Request API for bulk historical access',
      'Commercial Reddit data providers (Social Media APIs)',
      'Web scraping with respect to ToS and rate limits',
      'Hybrid approach: Recent data via Reddit API + Historical cache',
      'Focus on real-time collection for future historical analysis',
      'Partner with academic institutions for research data access',
    ];

    const riskAssessment = [
      'Reddit API limitations constrain historical data completeness',
      'Pushshift deprecation eliminates comprehensive historical access',
      'Alternative data sources may have different ToS constraints',
      'Web scraping approaches carry legal and technical risks',
      'Commercial providers may have cost and access limitations',
      'Data quality and consistency may vary across sources',
    ];

    const results: PushshiftAnalysisResults = {
      availability: {
        isAccessible,
        accessMethod,
        limitations: pushshiftResults.limitations,
        lastWorkingDate: '2023-05-01', // When Pushshift went restricted
      },
      dataComparison,
      recommendations: {
        viability,
        alternativeApproaches,
        riskAssessment,
      },
    };

    logger.log(`🎯 Pushshift analysis completed:`);
    logger.log(`  - Accessibility: ${isAccessible ? 'YES' : 'NO'}`);
    logger.log(`  - Viability: ${viability.toUpperCase()}`);
    logger.log(
      `  - Alternative approaches identified: ${alternativeApproaches.length}`,
    );

    return results;
  } catch (error) {
    logger.error(`❌ Pushshift analysis failed: ${error}`);
    throw error;
  }
}

function generateStrategicRecommendations(
  threeMonthResults: ExtendedHistoricalResults,
  oneYearResults: ExtendedHistoricalResults,
  pushshiftAnalysis: PushshiftAnalysisResults,
  logger: Logger,
): StrategicRecommendations {
  logger.log(
    `🧠 Generating strategic recommendations for data collection architecture`,
  );

  // Analyze results to determine primary strategy
  const redditApiViable =
    threeMonthResults.results.dataQualityScore >= 70 &&
    oneYearResults.results.dataQualityScore >= 60;

  const totalHistoricalCoverage =
    threeMonthResults.results.totalPosts + oneYearResults.results.totalPosts;
  const averageQuality =
    (threeMonthResults.results.dataQualityScore +
      oneYearResults.results.dataQualityScore) /
    2;

  // Determine primary method
  let primaryMethod = 'reddit_api_with_limitations';
  if (!redditApiViable) {
    primaryMethod = 'hybrid_approach_required';
  }
  if (averageQuality < 50) {
    primaryMethod = 'alternative_sources_required';
  }

  // Generate recommendations based on analysis
  const recommendations: StrategicRecommendations = {
    dataCollectionStrategy: {
      primaryMethod,
      fallbackMethods: [
        'Real-time collection for future historical data',
        'Incremental Reddit API collection with pagination',
        'Community-driven data contribution',
        'Focus on high-quality recent data over comprehensive historical coverage',
      ],
      hybridApproach: true,
    },
    architecturalGuidance: {
      storageStrategy: [
        'Implement incremental data collection and storage',
        'Build comprehensive local historical cache',
        'Use graph database for entity relationship storage',
        'Implement data deduplication and quality scoring',
        'Design for data source flexibility',
      ],
      cachingStrategy: [
        'Multi-tier caching: hot data (1w), warm data (1m), cold data (1y+)',
        'Pre-compute quality scores and entity relationships',
        'Cache Reddit API pagination cursors for efficient updates',
        'Implement cache invalidation based on data freshness requirements',
      ],
      updateFrequency:
        totalHistoricalCoverage > 2000 ? 'daily_incremental' : 'weekly_batch',
      qualityAssurance: [
        'Implement data quality scoring algorithms',
        'Monitor for deleted/removed content',
        'Track data completeness metrics',
        'Build data validation pipelines',
        'Implement anomaly detection for data quality issues',
      ],
    },
    economicConsiderations: {
      costEfficiency: redditApiViable ? 'cost_effective' : 'cost_constrained',
      scalabilityFactors: [
        'Reddit API rate limits (60-100 RPM) constrain data collection speed',
        'Historical data limitations require creative architectural solutions',
        'Storage costs increase with comprehensive historical data collection',
        'Processing costs for data quality assessment and entity resolution',
      ],
      riskMitigation: [
        'Diversify data sources to reduce dependency on Reddit API',
        'Build robust error handling and retry mechanisms',
        'Implement data quality monitoring and alerting',
        'Plan for API changes and deprecations',
        'Consider legal and ToS compliance for all data sources',
      ],
    },
    implementation: {
      phaseOne: [
        'Implement robust Reddit API integration with comprehensive error handling',
        'Build incremental data collection pipeline',
        'Create data quality assessment framework',
        'Implement basic entity resolution and storage',
        'Focus on recent high-quality data collection (last 3 months)',
      ],
      phaseTwo: [
        'Enhance historical data collection with advanced pagination strategies',
        'Implement alternative data source integrations',
        'Build comprehensive data quality and completeness monitoring',
        'Optimize storage and caching strategies',
        'Develop data analytics and insights generation',
      ],
      futureConsiderations: [
        'Monitor for new Reddit API features or access methods',
        'Evaluate emerging social media data providers',
        'Consider academic partnerships for research data access',
        'Plan for potential API cost changes or access restrictions',
        'Build community-driven data contribution mechanisms',
      ],
    },
  };

  logger.log(`✅ Strategic recommendations generated:`);
  logger.log(`  - Primary method: ${primaryMethod}`);
  logger.log(
    `  - Hybrid approach: ${
      recommendations.dataCollectionStrategy.hybridApproach ? 'YES' : 'NO'
    }`,
  );
  logger.log(
    `  - Update frequency: ${recommendations.architecturalGuidance.updateFrequency}`,
  );
  logger.log(
    `  - Cost efficiency: ${recommendations.economicConsiderations.costEfficiency}`,
  );

  return recommendations;
}

async function runAdvancedHistoricalAnalysis(): Promise<void> {
  const logger = new Logger('AdvancedHistoricalAnalysis');

  logger.log('🚀 Starting Advanced Historical Data Analysis (T04_S02)');
  logger.log('📅 Testing extended time periods: 3 months and 1 year');
  logger.log('🔍 Researching alternative data collection methods');
  logger.log('📊 Generating strategic architectural recommendations');

  try {
    // Initialize the application
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    const redditService = app.get(RedditService);

    // Ensure authentication is working
    logger.log('🔐 Validating Reddit API authentication...');
    const authValid = await redditService.validateAuthentication();
    if (!authValid) {
      throw new Error('Reddit API authentication failed');
    }
    logger.log('✅ Reddit API authentication validated');

    // === PHASE 1: TEST 3-MONTH HISTORICAL ACCESS ===
    logger.log('\n📊 PHASE 1: Testing 3-month historical data access patterns');
    const threeMonthResults = await testExtendedHistoricalAccess(
      redditService,
      '3m',
      logger,
    );

    // === PHASE 2: TEST 1-YEAR HISTORICAL ACCESS ===
    logger.log('\n📅 PHASE 2: Testing 1-year historical data access patterns');
    const oneYearResults = await testExtendedHistoricalAccess(
      redditService,
      '1y',
      logger,
    );

    // === PHASE 3: ANALYZE PUSHSHIFT CAPABILITIES ===
    logger.log('\n🔬 PHASE 3: Analyzing Pushshift API and alternative methods');
    const pushshiftAnalysis = await analyzePushshiftCapabilities(
      redditService,
      logger,
    );

    // === PHASE 4: GENERATE STRATEGIC RECOMMENDATIONS ===
    logger.log('\n🧠 PHASE 4: Generating strategic recommendations');
    const strategicRecommendations = generateStrategicRecommendations(
      threeMonthResults,
      oneYearResults,
      pushshiftAnalysis,
      logger,
    );

    // === COMPREHENSIVE RESULTS SUMMARY ===
    logger.log(
      '\n🎯 ============== COMPREHENSIVE ANALYSIS RESULTS ==============',
    );

    logger.log('\n📊 3-MONTH HISTORICAL ACCESS RESULTS:');
    logger.log(`  ✓ Posts retrieved: ${threeMonthResults.results.totalPosts}`);
    logger.log(
      `  ✓ Comments retrieved: ${threeMonthResults.results.totalComments}`,
    );
    logger.log(
      `  ✓ Data quality score: ${threeMonthResults.results.dataQualityScore}%`,
    );
    logger.log(
      `  ✓ Time span covered: ${threeMonthResults.results.timeSpanCovered.toFixed(
        1,
      )} days`,
    );
    logger.log(
      `  ✓ API calls used: ${threeMonthResults.results.apiPerformance.totalApiCalls}`,
    );
    logger.log(
      `  ✓ Rate limits hit: ${
        threeMonthResults.results.apiPerformance.rateLimitHit ? 'YES' : 'NO'
      }`,
    );
    logger.log(
      `  ✓ Hard limits hit: ${
        threeMonthResults.results.limitations.hitHardLimit ? 'YES' : 'NO'
      }`,
    );

    logger.log('\n📅 1-YEAR HISTORICAL ACCESS RESULTS:');
    logger.log(`  ✓ Posts retrieved: ${oneYearResults.results.totalPosts}`);
    logger.log(
      `  ✓ Comments retrieved: ${oneYearResults.results.totalComments}`,
    );
    logger.log(
      `  ✓ Data quality score: ${oneYearResults.results.dataQualityScore}%`,
    );
    logger.log(
      `  ✓ Time span covered: ${oneYearResults.results.timeSpanCovered.toFixed(
        1,
      )} days`,
    );
    logger.log(
      `  ✓ API calls used: ${oneYearResults.results.apiPerformance.totalApiCalls}`,
    );
    logger.log(
      `  ✓ Rate limits hit: ${
        oneYearResults.results.apiPerformance.rateLimitHit ? 'YES' : 'NO'
      }`,
    );
    logger.log(
      `  ✓ Hard limits hit: ${
        oneYearResults.results.limitations.hitHardLimit ? 'YES' : 'NO'
      }`,
    );

    logger.log('\n🔬 PUSHSHIFT & ALTERNATIVES ANALYSIS:');
    logger.log(
      `  ✓ Pushshift accessible: ${
        pushshiftAnalysis.availability.isAccessible ? 'YES' : 'NO'
      }`,
    );
    logger.log(
      `  ✓ Access method: ${pushshiftAnalysis.availability.accessMethod}`,
    );
    logger.log(
      `  ✓ Viability: ${pushshiftAnalysis.recommendations.viability.toUpperCase()}`,
    );
    logger.log(
      `  ✓ Alternative approaches: ${pushshiftAnalysis.recommendations.alternativeApproaches.length} identified`,
    );

    logger.log('\n🧠 STRATEGIC RECOMMENDATIONS:');
    logger.log(
      `  ✓ Primary method: ${strategicRecommendations.dataCollectionStrategy.primaryMethod}`,
    );
    logger.log(
      `  ✓ Hybrid approach: ${
        strategicRecommendations.dataCollectionStrategy.hybridApproach
          ? 'RECOMMENDED'
          : 'NOT NEEDED'
      }`,
    );
    logger.log(
      `  ✓ Update frequency: ${strategicRecommendations.architecturalGuidance.updateFrequency}`,
    );
    logger.log(
      `  ✓ Cost efficiency: ${strategicRecommendations.economicConsiderations.costEfficiency}`,
    );

    logger.log('\n🎯 KEY FINDINGS:');
    const totalPosts =
      threeMonthResults.results.totalPosts + oneYearResults.results.totalPosts;
    const averageQuality =
      (threeMonthResults.results.dataQualityScore +
        oneYearResults.results.dataQualityScore) /
      2;

    logger.log(`  → Total historical posts accessible: ${totalPosts}`);
    logger.log(`  → Average data quality: ${averageQuality.toFixed(1)}%`);
    logger.log(
      `  → Reddit API viable for historical data: ${
        averageQuality >= 70 ? 'YES' : 'PARTIALLY'
      }`,
    );
    logger.log(
      `  → Pushshift alternative viable: ${
        pushshiftAnalysis.recommendations.viability !== 'not_viable'
          ? 'YES'
          : 'NO'
      }`,
    );
    logger.log(
      `  → Recommended architecture: ${strategicRecommendations.dataCollectionStrategy.primaryMethod}`,
    );

    logger.log('\n🏁 ============== ANALYSIS COMPLETE ==============');
    logger.log('✅ Advanced historical data analysis completed successfully');
    logger.log(
      '📝 Results provide comprehensive guidance for data collection architecture',
    );
    logger.log(
      '🚀 Ready for strategic decision making and implementation planning',
    );

    await app.close();
  } catch (error) {
    logger.error(`❌ Advanced historical analysis failed: ${error}`);
    process.exit(1);
  }
}

// Run the analysis if this script is executed directly
if (require.main === module) {
  runAdvancedHistoricalAnalysis().catch((error) => {
    console.error('❌ Script execution failed:', error);
    process.exit(1);
  });
}

export { runAdvancedHistoricalAnalysis };
