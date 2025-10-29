# Local Food Discovery App - User Experience Specification

**⚠️ IMPORTANT: This document is outdated and will need extensive updates to align with current system architecture and implementation approach. For current development information, refer to:**

- **PRD.md** - Complete system architecture, data model, and implementation roadmap
- **collection-prompt.md** - LLM processing guidelines and entity extraction rules

**This BRD will be updated at a later time to reflect the current system design and user experience strategy.**

---

## 1. Core Value Proposition

Evidence-based food discovery powered by community knowledge, emphasizing social proof and transparent ranking criteria to help users make informed decisions about specific dishes.

## 2. User Experience Framework

- **Result Quick Actions:**
  - Order link (via Google/direct)
  - Google Maps link
  - Save dish to list
  - Share recommendation
  - "Also worth trying" alternatives

### 2.1 Search

#### Search Results

##### Example:

- Ramen Tatsu-Ya's Tonkotsu Ramen

  - Mentioned 47 times in the community
  - 312 total upvotes
  - Discussed in 18 different threads
  - 5 mentions in the past month

  - "Their tonkotsu broth is unmatched in richness and depth" - u/ramenLover23 (53 upvotes)
  - "The perfect balance of pork and garlic" - u/foodieFan (37 upvotes)

### 2.2 Discovery Feed

#### Basic Categories ($3.99)

_No Discovery Feed for Basic Tier_

#### Premium Categories ($9.99 Tier)

- Trending Deep Dives: "Why everyone's talking about this new ramen spot"
- Neighborhood Insights: "South Austin's rising stars"
- Time-Based Trends: "What's hot for breakfast lately"
- Category Deep-Dives: "Austin's top-discussed pizza this month"
- Rising Stars: "New dishes gaining serious praise"

#### Search Interface

- Smart Prompt: "What are you craving?"
- Recent Searches
- Trending Searches
- Popular Categories

### 2.3 Bookmarking System

- **Dish-Centric Lists:**
  - Save specific dishes with restaurant context
  - Add personal notes
  - Share curated dish lists
  - Examples:
    - "My Austin Taco Journey"
    - "Best Business Lunch Spots"
    - "Date Night Winners"

### 2.4 Feature Tiers

#### Basic Tier ($3.99/month)

- Full search functionality
- Basic result display
- Dish bookmarking/lists
- List sharing capability
- Google Maps/ordering links

#### Premium Tier ($9.99/month)

**Core Value Props:**

- "Never miss a trending dish"
- "Build your personal food map"
- "Be the first to know about rising stars"

**Features:**

- Full discovery feed access
- Smart Alerts:
  - "That ramen you bookmarked? It's trending again with winter weather"
  - "Your favorite type of dish was spotted at a new location"
  - Custom alerts: "Notify me when anyone raves about new pizza spots"
- Personal Recommendations:
  - "Based on your love of Little Deli's wrap..."
  - "Similar to dishes you've saved..."
- Advanced Search History
- Personal Food Maps
- Early Trend Access

## 3. Restaurant Partnership Program

### 3.1 Data-Driven Outreach/Onboarding Triggers

- highActivity:
  - condition: monthly mentions > 50
  - action: Generate insight preview
- trendingDish: {
  - condition: weekly growth rate > 200%
  - action: Share trend report
- consistentPraise: {
  - condition: positive reviews > 25 and unique threads > 3
  - action: Highlight community impact

### 3.2 Partnership Tiers

#### Basic Tier ($99/month)

Triggered when restaurant reaches consistent mention threshold:

- Community Monitoring:
  - "Your chicken caesar wrap was mentioned 12 times this week"
  - "New Reddit thread discussing your happy hour deals"
  - "Your most talked-about dishes this week"
- Basic Profile Management:
  - Highlight verified community favorites
  - Share select customer praise
  - Basic performance metrics
- Simple analytics dashboard

#### Pro Tier ($249/month)

Offered to highly-discussed restaurants:

- Enhanced Insights:
  - Real-time mention alerts
  - Detailed sentiment analysis
  - "Here's how your burger ranks in local discussions"
  - Menu item performance tracking
- Custom Highlights:
  - Choose top community quotes to feature
  - Spotlight trending dishes
  - Highlight time-sensitive promotions
- Competitor Insights:
  - Relative dish rankings
  - Category performance
  - Trend analysis

#### Enterprise Tier ($399/month)

For market-leading establishments:

- Advanced Analytics:
  - Dish-by-dish popularity tracking
  - Trend forecasting and predictions
  - Customer sentiment deep-dives
  - Market position analysis
- Premium Features:
  - Boost existing positive mentions
  - Feature in "Trending Now" (based on real data)
  - Advanced community engagement tools
- Custom Solutions:
  - API access for data integration
  - Custom reporting
  - Dedicated support team

## 4. Implementation Phases

### 4.1 Phase 1: Core Search (Months 1-2)

- Natural language query processing
- Reddit data integration
- Basic result display
- Essential dish bookmarking

### 4.2 Phase 2: Enhanced Features (Months 3-4)

- Premium user features
- Discovery feed
- Improved ranking algorithms
- Sharing capabilities

### 4.3 Phase 3: Growth (Months 5+)

- Restaurant partnership rollout
- Advanced analytics
- Additional data sources
- Regional expansion prep

## 5. Platform Integration Strategy

### 5.1 Initial Integrations

- Google Maps (location/basic info)
- Popular delivery platforms
- Social sharing (native OS)

### 5.2 Future Integrations

- Direct ordering systems
- POS systems for real-time data
- Reservation platforms
- Additional review platforms

## 6. User Interface & Features

_**Note**: This is pasted from the PRD.md file and will need to be updated._

### 6.1 Launch Features (99¢/month Tier)

#### Core Search Experience

- **Smart search bar**: Natural language input with query suggestions
- **Map-based location**: Interactive map for area selection
- **"Open Now" toggle**: Filter for currently operating restaurants
- **Evidence-based results**: Each recommendation shows community quotes and metrics

#### Basic Discovery Feed

- **Recently Discussed**: Dishes trending in past week (23 mentions this week)
- **Quick Bites**: Most mentioned casual spots for immediate decisions
- **Hidden Gems**: Dishes gaining traction but not yet mainstream
- **Community Highlights**: Recent mentions that caught algorithmic attention

#### Result Display

- **List view**: Scrollable results with dish-restaurant pairs, quality indicators, evidence preview
- **Evidence cards**: Top community quote, upvote count, recency indicator, "Join conversation" link
- **Quick actions**: Order/reservation links, Google Maps, save to list, share

#### Bookmarking System

- **Dish-centric lists**: Save specific dishes with restaurant context
- **Personal notes**: Add own thoughts and experiences
- **List sharing**: Share curated dish collections with others
- **Examples**: "My Austin Taco Journey", "Date Night Winners", "Business Lunch Spots"

### 6.2 Premium Features ($7.99/month Tier)

#### Advanced Discovery Feed

- **Trending Deep Dives**: Analysis of why spots are gaining attention
- **Neighborhood Insights**: Area-specific recommendations with context
- **Time-Based Trends**: What's popular for breakfast, late night, etc.
- **Category Deep-Dives**: Monthly reports on pizza scene, coffee culture, etc.
- **Rising Stars**: New dishes gaining serious community praise

#### Smart Alerts & Personalization

- **Craving notifications**: "That ramen you bookmarked is trending again with winter weather"
- **New spot alerts**: "Your favorite type of dish was spotted at a new location"
- **Custom alerts**: "Notify me when anyone raves about new pizza spots"
- **Personal recommendations**: "Based on your love of Little Deli's wrap..."

#### Advanced Search & History

- **Complex attribute queries**: "best vegan brunch with patio seating"
- **Search history with context**: Remember why you searched and what you found
- **Personal food maps**: Visual representation of your discovered spots
- **Early trend access**: See emerging discussions before they hit mainstream

## 6. Social Sharing & Community Contribution Features

### 6.1 Bookmark Page Share Extension

**Implementation as Extension to Existing Bookmark System:**

The share feature extends the existing bookmark functionality to encourage user-generated content and community contribution.

**UI Flow:**

```
[Existing saved dishes/restaurants list]

[Share/Contribute Your Discovery] (prominent button)
↓ Opens modal with:
- Text area with optional template:
  "Just tried [dish] at [restaurant] - found through community
   recommendations. [Your experience here]. Thanks r/austinfood!"
- "Post to r/austinfood" button OR share to other social media platforms → create post with pre-filled content

OR

[Share your Bookmarks] (prominent button)
↓ Opens modal with:
- Info graphic of top 10 bookmarked dish-restaurant pairs with subtle branding:
  [top 5-10 bookmarked dish-restaurant pairs] + "found through reddit community
   recommendations using the Crave app. Thanks r/austinfood!"
- "Post to r/austinfood" button OR share to other social media platforms → create post with pre-filled content
```

**Business Value:**

- **User-Generated Marketing**: Organic content creation that drives acquisition
- **Community Appreciation**: Shows gratitude to Reddit communities that power recommendations
- **Viral Loop Creation**: Shared content creates discovery opportunities for new users
- **Content Quality**: Pre-filled templates ensure consistent, high-quality social posts

### 6.2 Content Generation Strategy

**Smart Templates:**

- **Dynamic dish/restaurant insertion**: Pull from user's recently saved items
- **Community context**: Reference specific subreddit communities
- **Gratitude expression**: Built-in thanks to community for recommendations
- **Customization**: User can modify template before posting

**Engagement Optimization:**

- **Subreddit targeting**: Auto-select appropriate food subreddit based on location
- **Timing suggestions**: Recommend optimal posting times for engagement
- **Follow-up prompts**: Encourage users to engage with responses to their posts

## 7. Growth Metrics & Viral Strategy

### 7.1 Trackable Success Metrics

**User Engagement Metrics:**

- **Click-through rate**: Quote clicks vs. CTA button clicks to Reddit
- **Community discovery**: Subreddit visits from attribution links
- **Share completion rate**: Bookmark share feature usage and completion
- **Attribution engagement**: Users clicking through to join Reddit discussions

**Growth & Acquisition Metrics:**

- **Reddit referral traffic**: Inbound traffic from Reddit communities via shared content
- **Geographic expansion**: User requests for new city coverage
- **Community growth**: New subreddit communities engaged through user shares
- **Content virality**: User-generated posts that gain traction and drive signups

**Business Impact Metrics:**

- **Viral coefficient**: New users acquired per active user (target >0.2)
- **Referral system performance**: Share-driven signups and conversions
- **Attribution value**: Revenue attributed to Reddit community engagement
- **Premium conversion**: Users upgrading after community discovery features

### 7.2 Viral Loop Strategy

**Content Creation Incentives:**

- **Discovery Recognition**: Highlight users who discover trending dishes first
- **Community Contribution**: Reward active sharers with premium features
- **Quality Content**: Promote well-received shares in app discovery feed

**Acquisition Optimization:**

- **Shareable Moments**: Identify high-shareability dish discoveries
- **Social Proof**: Use community engagement metrics in marketing
- **Platform Cross-Pollination**: Reddit content drives app usage, app users contribute to Reddit

**Retention Through Community:**

- **Attribution Connection**: Keep users engaged through Reddit discussion links
- **Community Investment**: Users who contribute content show higher retention
- **Social Identity**: Users develop identity as local food discoverers

### 7.3 Partnership Expansion Strategy

**Reddit Community Relationships:**

- **Moderator Partnerships**: Collaborate with food subreddit moderators
- **Community Events**: Sponsor local food meetups organized through Reddit
- **Content Appreciation**: Regular thanks to contributing communities

**Cross-Platform Growth:**

- **Instagram Integration**: Food photo sharing with attribution
- **TikTok Potential**: Short-form content about trending dishes
- **Food Blogger Network**: Connect with local food influencers

**Geographic Scaling:**

- **City-by-City Rollout**: Target cities with active food subreddits first
- **Local Community Champions**: Identify and support local food discovery leaders
- **Regional Partnerships**: Collaborate with local food media and bloggers

## 8. Revenue Optimization Through Community Features

### 8.1 Premium Feature Positioning

**Community-Powered Discovery:**

- **Trending Alerts**: "Be the first to know when dishes start gaining buzz"
- **Attribution History**: "See the community discussions that led to your favorites"
- **Contribution Recognition**: "Track your impact on the food discovery community"

**Social Status Features:**

- **Discoverer Badges**: Recognition for finding trending dishes early
- **Community Leaderboards**: Top contributors to local food discussions
- **Insider Access**: Early access to community trends and insights

### 8.2 Restaurant Partnership Value Props

**Community Engagement Metrics:**

- **Real-Time Buzz Tracking**: "See when your dishes start trending on Reddit"
- **Attribution Analytics**: "Track which dishes drive the most discussion"
- **Community Sentiment**: "Understand what diners love most about your menu"

**Marketing Amplification:**

- **User-Generated Content**: "Your customers are already sharing - see how to amplify"
- **Community Relationships**: "Connect with local food communities authentically"
- **Viral Moment Identification**: "Capitalize when your dishes go viral"

### 8.3 Long-Term Business Model Evolution

**Data-Driven Insights:**

- **Trend Prediction**: Premium analytics for early trend identification
- **Community Intelligence**: Deep insights into local food culture
- **Market Research**: Food preference data for restaurant industry

**Platform Expansion:**

- **Recipe Attribution**: Connect home cooking to restaurant inspiration
- **Event Discovery**: Community-recommended food events and pop-ups
- **Travel Integration**: Food discovery for travel destinations
