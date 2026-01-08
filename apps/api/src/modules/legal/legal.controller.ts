import { Controller, Get, Header } from '@nestjs/common';

/**
 * Legal/Compliance Controller
 *
 * Provides endpoints for legal documents required by app stores:
 * - Privacy Policy (required by Apple App Store)
 * - Terms of Service (required by Google Play Store and Apple App Store)
 *
 * These endpoints must be accessible without authentication and
 * should return HTML or plain text that can be displayed in web views.
 */
@Controller()
export class LegalController {
  /**
   * Privacy Policy endpoint
   *
   * Required by Apple App Store submission guidelines.
   * Must be publicly accessible URL.
   *
   * @returns HTML page with privacy policy
   */
  @Get('privacy')
  @Header('Content-Type', 'text/html')
  getPrivacyPolicy(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Crave - Privacy Policy</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        h1 { color: #2c3e50; margin-top: 0; }
        h2 { color: #34495e; margin-top: 30px; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h3 { color: #7f8c8d; margin-top: 20px; }
        .last-updated { color: #95a5a6; font-style: italic; margin-bottom: 30px; }
        .section { margin-bottom: 30px; }
        ul { padding-left: 20px; }
        li { margin-bottom: 8px; }
        .contact { background: #ecf0f1; padding: 15px; border-radius: 5px; margin-top: 30px; }
    </style>
</head>
<body>
    <h1>Crave Privacy Policy</h1>
    <p class="last-updated">Last Updated: January 6, 2026</p>

    <div class="section">
        <h2>1. Introduction</h2>
        <p>
            Welcome to Crave ("we," "our," or "us"). We are committed to protecting your privacy and being transparent 
            about how we collect, use, and share your information. This Privacy Policy explains our practices regarding 
            your personal information when you use our mobile application and related services (collectively, the "Service").
        </p>
        <p>
            By using Crave, you agree to the collection and use of information in accordance with this policy. 
            If you do not agree with our policies and practices, please do not use the Service.
        </p>
    </div>

    <div class="section">
        <h2>2. Information We Collect</h2>
        
        <h3>2.1 Information You Provide</h3>
        <p>When you use Crave, we collect information that you voluntarily provide, including:</p>
        <ul>
            <li><strong>Account Information:</strong> Name, email address, and profile photo when you create an account</li>
            <li><strong>User Content:</strong> Poll responses, votes, restaurant/dish options you add to polls, photos, comments, and favorites you share on the Service</li>
            <li><strong>Search Queries:</strong> Information about restaurants, cuisines, and locations you search for</li>
            <li><strong>Preferences:</strong> Dietary preferences, cuisine preferences, and notification settings</li>
        </ul>

        <h3>2.2 Information Collected Automatically</h3>
        <p>When you use the Service, we automatically collect:</p>
        <ul>
            <li><strong>Location Data:</strong> With your permission, we collect precise location data to show you nearby restaurants 
                and provide personalized recommendations. You can control location permissions through your device settings.</li>
            <li><strong>Device Information:</strong> Device type, operating system, unique device identifiers, mobile network information, 
                and advertising identifiers (IDFA on iOS, Advertising ID on Android)</li>
            <li><strong>Usage Information:</strong> How you interact with the Service, including restaurants viewed, search history, 
                features used, and time spent in the app</li>
            <li><strong>Log Data:</strong> IP address, browser type, pages visited, time and date of visits, and crash reports</li>
        </ul>

        <h3>2.3 Information From Third Parties</h3>
        <p>We receive information from third-party services you connect to Crave:</p>
        <ul>
            <li><strong>Authentication Services:</strong> When you sign in using Apple, Google, or other OAuth providers, 
                we receive basic profile information (name, email, profile photo)</li>
            <li><strong>Social Media:</strong> If you share content to social media platforms, we may receive information 
                about those interactions</li>
            <li><strong>Restaurant Data:</strong> We obtain restaurant information, menus, photos, and reviews from public 
                sources and third-party data providers</li>
        </ul>
    </div>

    <div class="section">
        <h2>3. How We Use Your Information</h2>
        <p>We use the information we collect for the following purposes:</p>
        
        <h3>3.1 Provide and Improve the Service</h3>
        <ul>
            <li>Show you personalized restaurant recommendations based on your location and preferences</li>
            <li>Process and display your poll votes, poll contributions, and photos</li>
            <li>Enable search functionality and save your search history</li>
            <li>Provide customer support and respond to your inquiries</li>
            <li>Analyze usage patterns to improve features and user experience</li>
            <li>Develop new features and services</li>
        </ul>

        <h3>3.2 Communication</h3>
        <ul>
            <li>Send you notifications about new restaurants, trending places, and personalized recommendations</li>
            <li>Respond to your comments, questions, and support requests</li>
            <li>Send important updates about the Service, including changes to our policies</li>
        </ul>

        <h3>3.3 Safety and Security</h3>
        <ul>
            <li>Detect, prevent, and address fraud, security issues, and technical problems</li>
            <li>Enforce our Terms of Service and other policies</li>
            <li>Protect the rights, property, and safety of Crave, our users, and the public</li>
        </ul>

        <h3>3.4 Analytics and Research</h3>
        <ul>
            <li>Understand how users interact with the Service using analytics tools</li>
            <li>Conduct research to improve restaurant recommendations and user experience</li>
            <li>Generate aggregated, anonymized insights about usage trends</li>
        </ul>
    </div>

    <div class="section">
        <h2>4. How We Share Your Information</h2>
        
        <h3>4.1 Public Information</h3>
        <p>
            Your profile information, poll votes, poll contributions (restaurants/dishes you add to polls), and photos are publicly visible to other Crave users 
            and may be indexed by search engines. You control what you share publicly.
        </p>

        <h3>4.2 Service Providers</h3>
        <p>We share information with third-party service providers who help us operate the Service:</p>
        <ul>
            <li><strong>Cloud Hosting:</strong> Railway (infrastructure hosting)</li>
            <li><strong>Authentication:</strong> Clerk (user authentication and identity management)</li>
            <li><strong>Analytics:</strong> Sentry (error tracking and performance monitoring)</li>
            <li><strong>AI Services:</strong> Google Gemini (AI-powered natural language search and recommendations)</li>
            <li><strong>Location Data:</strong> Google Places API (restaurant information and location services)</li>
            <li><strong>Payments:</strong> Stripe and RevenueCat (subscription and payment processing)</li>
        </ul>
        <p>
            These service providers are contractually required to use your information only to provide services 
            to us and must protect your information in accordance with this Privacy Policy.
        </p>

        <h3>4.3 Legal Requirements</h3>
        <p>We may disclose your information if required by law or if we believe in good faith that such disclosure is necessary to:</p>
        <ul>
            <li>Comply with legal obligations, court orders, or government requests</li>
            <li>Protect and defend our rights or property</li>
            <li>Prevent fraud or security issues</li>
            <li>Protect the safety of our users or the public</li>
        </ul>

        <h3>4.4 Business Transfers</h3>
        <p>
            If Crave is involved in a merger, acquisition, or sale of assets, your information may be transferred. 
            We will notify you before your information is transferred and becomes subject to a different privacy policy.
        </p>

        <h3>4.5 Aggregated Data</h3>
        <p>
            We may share aggregated, anonymized data that does not identify you personally with partners 
            for research, analytics, or business purposes.
        </p>
    </div>

    <div class="section">
        <h2>5. Your Rights and Choices</h2>
        
        <h3>5.1 Account Information</h3>
        <p>You can update your account information, profile, and preferences at any time through the app settings.</p>

        <h3>5.2 Location Data</h3>
        <p>
            You can control location permissions through your device settings. Disabling location services may 
            limit some features, such as finding restaurants near you.
        </p>

        <h3>5.3 Notifications</h3>
        <p>You can manage notification preferences in the app settings or through your device settings.</p>

        <h3>5.4 Access and Deletion</h3>
        <p>You have the right to:</p>
        <ul>
            <li>Access the personal information we hold about you</li>
            <li>Request correction of inaccurate information</li>
            <li>Request deletion of your account and associated data</li>
            <li>Export your data in a portable format</li>
        </ul>
        <p>To exercise these rights, please contact us using the information in the "Contact Us" section below.</p>

        <h3>5.5 Do Not Sell My Personal Information</h3>
        <p>
            We do not sell your personal information. We do not share your information with third parties for 
            their own marketing purposes.
        </p>
    </div>

    <div class="section">
        <h2>6. Data Retention</h2>
        <p>
            We retain your information for as long as your account is active or as needed to provide the Service. 
            When you delete your account, we will delete or anonymize your personal information within 30 days, 
            except where we are required to retain it for legal, security, or fraud prevention purposes.
        </p>
        <p>
            Public content you shared (poll votes, poll contributions) may be retained in an anonymized form after account deletion 
            to maintain the integrity of the Service.
        </p>
    </div>

    <div class="section">
        <h2>7. Children's Privacy</h2>
        <p>
            Crave is not intended for children under 13 years of age (or under 16 in the European Economic Area). 
            We do not knowingly collect personal information from children under these ages. If you believe we have 
            collected information from a child, please contact us immediately and we will delete it.
        </p>
    </div>

    <div class="section">
        <h2>8. International Data Transfers</h2>
        <p>
            Your information may be transferred to and processed in the United States and other countries where our 
            service providers operate. These countries may have different data protection laws than your country of residence. 
            We take steps to ensure your information receives adequate protection wherever it is processed.
        </p>
    </div>

    <div class="section">
        <h2>9. Security</h2>
        <p>
            We implement industry-standard security measures to protect your information, including encryption of data 
            in transit and at rest, access controls, and regular security audits. However, no method of transmission 
            over the internet or electronic storage is 100% secure. While we strive to protect your information, 
            we cannot guarantee absolute security.
        </p>
    </div>

    <div class="section">
        <h2>10. Changes to This Privacy Policy</h2>
        <p>
            We may update this Privacy Policy from time to time. We will notify you of material changes by posting 
            the new Privacy Policy in the app and updating the "Last Updated" date. Your continued use of the Service 
            after changes become effective constitutes your acceptance of the revised policy.
        </p>
    </div>

    <div class="section contact">
        <h2>11. Contact Us</h2>
        <p>If you have questions or concerns about this Privacy Policy or our data practices, please contact us at:</p>
        <p>
            <strong>Email:</strong> cravesearch.app@gmail.com<br>
            <strong>Support:</strong> Via the in-app "Help & Support" section
        </p>
    </div>

    <div class="section">
        <h2>12. California Privacy Rights</h2>
        <p>
            If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):
        </p>
        <ul>
            <li>Right to know what personal information we collect, use, and share</li>
            <li>Right to request deletion of your personal information</li>
            <li>Right to opt-out of the sale of personal information (we do not sell your information)</li>
            <li>Right to non-discrimination for exercising your privacy rights</li>
        </ul>
        <p>To exercise these rights, contact us at cravesearch.app@gmail.com</p>
    </div>
</body>
</html>
    `.trim();
  }

  /**
   * Terms of Service endpoint
   *
   * Required by both Apple App Store and Google Play Store.
   * Must be publicly accessible URL.
   *
   * @returns HTML page with terms of service
   */
  @Get('terms')
  @Header('Content-Type', 'text/html')
  getTermsOfService(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Crave - Terms of Service</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        h1 { color: #2c3e50; margin-top: 0; }
        h2 { color: #34495e; margin-top: 30px; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h3 { color: #7f8c8d; margin-top: 20px; }
        .last-updated { color: #95a5a6; font-style: italic; margin-bottom: 30px; }
        .section { margin-bottom: 30px; }
        ul { padding-left: 20px; }
        li { margin-bottom: 8px; }
        .contact { background: #ecf0f1; padding: 15px; border-radius: 5px; margin-top: 30px; }
        .important { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
    </style>
</head>
<body>
    <h1>Crave Terms of Service</h1>
    <p class="last-updated">Last Updated: January 6, 2026</p>

    <div class="important">
        <strong>Important:</strong> Please read these Terms of Service carefully before using Crave. 
        By accessing or using the Service, you agree to be bound by these Terms.
    </div>

    <div class="section">
        <h2>1. Acceptance of Terms</h2>
        <p>
            Welcome to Crave! These Terms of Service ("Terms") govern your access to and use of the Crave mobile 
            application and related services (collectively, the "Service"), operated by Crave ("we," "us," or "our").
        </p>
        <p>
            By creating an account, downloading, accessing, or using the Service, you agree to these Terms and our 
            Privacy Policy. If you do not agree, please do not use the Service.
        </p>
    </div>

    <div class="section">
        <h2>2. Eligibility</h2>
        <p>You must be at least 13 years old to use Crave. By using the Service, you represent and warrant that:</p>
        <ul>
            <li>You are at least 13 years of age (or 16 if you reside in the European Economic Area)</li>
            <li>You have the legal capacity to enter into these Terms</li>
            <li>You will comply with all applicable laws and regulations</li>
            <li>All information you provide is accurate and truthful</li>
        </ul>
    </div>

    <div class="section">
        <h2>3. Account Registration</h2>
        <p>To access certain features, you must create an account. You agree to:</p>
        <ul>
            <li>Provide accurate, current, and complete information</li>
            <li>Maintain the security of your account credentials</li>
            <li>Promptly update your account information if it changes</li>
            <li>Notify us immediately of any unauthorized use of your account</li>
            <li>Accept responsibility for all activities that occur under your account</li>
        </ul>
        <p>
            We reserve the right to suspend or terminate accounts that violate these Terms or are inactive 
            for extended periods.
        </p>
    </div>

    <div class="section">
        <h2>4. Use of the Service</h2>
        
        <h3>4.1 Permitted Use</h3>
        <p>You may use Crave to:</p>
        <ul>
            <li>Discover and search for restaurants</li>
            <li>Participate in community polls by voting and adding restaurant/dish options</li>
            <li>Share photos and experiences</li>
            <li>Save favorite restaurants and create collections</li>
            <li>Receive personalized recommendations</li>
        </ul>

        <h3>4.2 Prohibited Conduct</h3>
        <p>You agree NOT to:</p>
        <ul>
            <li>Post false, misleading, defamatory, or fraudulent content</li>
            <li>Vote in polls or add options for businesses you own or have a financial interest in</li>
            <li>Manipulate poll results through fake votes or automated voting</li>
            <li>Harass, threaten, or abuse other users or businesses</li>
            <li>Violate any applicable laws or regulations</li>
            <li>Infringe on intellectual property rights of others</li>
            <li>Transmit viruses, malware, or harmful code</li>
            <li>Scrape, crawl, or use automated tools to access the Service</li>
            <li>Reverse engineer or attempt to extract source code</li>
            <li>Use the Service for commercial purposes without our permission</li>
            <li>Impersonate others or misrepresent your affiliation</li>
        </ul>
    </div>

    <div class="section">
        <h2>5. User Content</h2>
        
        <h3>5.1 Your Content</h3>
        <p>
            You retain ownership of content you post to Crave ("User Content"), including poll votes, poll contributions 
            (restaurants and dishes you add to polls), photos, and comments. By posting User Content, you grant us a worldwide, non-exclusive, royalty-free, 
            transferable license to use, reproduce, modify, adapt, publish, display, and distribute your User Content 
            in connection with the Service.
        </p>

        <h3>5.2 Content Standards</h3>
        <p>All User Content must:</p>
        <ul>
            <li>Be based on genuine personal experiences and preferences</li>
            <li>Be relevant to the poll topic and restaurant/dish being discussed</li>
            <li>Comply with applicable laws and regulations</li>
            <li>Not contain personal information of others without consent</li>
            <li>Not be offensive, discriminatory, or harassing</li>
            <li>Not promote violence, illegal activities, or harmful behavior</li>
        </ul>

        <h3>5.3 Content Moderation</h3>
        <p>
            We reserve the right (but have no obligation) to review, monitor, edit, or remove User Content that 
            violates these Terms or is otherwise objectionable. We may remove content and suspend or terminate 
            accounts for violations.
        </p>
    </div>

    <div class="section">
        <h2>6. Intellectual Property</h2>
        <p>
            The Service, including its design, features, text, graphics, logos, and software, is owned by Crave 
            and is protected by copyright, trademark, and other intellectual property laws. You may not copy, 
            modify, distribute, or create derivative works without our express written permission.
        </p>
        <p>
            "Crave" and our logos are trademarks of Crave. You may not use our trademarks without prior written consent.
        </p>
    </div>

    <div class="section">
        <h2>7. Subscription and Payments</h2>
        <p>
            Certain features may require a paid subscription. By purchasing a subscription, you agree to pay the 
            applicable fees and authorize us to charge your payment method.
        </p>
        <ul>
            <li>Subscriptions automatically renew unless canceled before the renewal date</li>
            <li>You can manage or cancel subscriptions through your device's app store settings</li>
            <li>Fees are non-refundable except as required by law</li>
            <li>We may change subscription prices with notice</li>
        </ul>
        <p>
            Payments are processed through Apple App Store or Google Play Store, and are subject to their terms 
            and conditions.
        </p>
    </div>

    <div class="section">
        <h2>8. Third-Party Services</h2>
        <p>
            The Service may integrate with or link to third-party services (e.g., Apple Sign-In, Google Sign-In, 
            social media platforms). Your use of third-party services is subject to their own terms and privacy policies. 
            We are not responsible for third-party services or content.
        </p>
    </div>

    <div class="section">
        <h2>9. Disclaimers</h2>
        <p>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, 
            INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, 
            OR NON-INFRINGEMENT.
        </p>
        <p>We do not warrant that:</p>
        <ul>
            <li>The Service will be uninterrupted, secure, or error-free</li>
            <li>Information provided through the Service is accurate or reliable</li>
            <li>Any defects will be corrected</li>
            <li>Poll results and votes reflect the current state of any restaurant</li>
        </ul>
    </div>

    <div class="section">
        <h2>10. Limitation of Liability</h2>
        <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, CRAVE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, 
            CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR USE, WHETHER IN AN ACTION 
            IN CONTRACT, TORT, OR OTHERWISE, ARISING FROM YOUR USE OF THE SERVICE.
        </p>
        <p>
            OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING FROM OR RELATED TO THE SERVICE SHALL NOT EXCEED 
            THE AMOUNT YOU PAID US IN THE PAST 12 MONTHS, OR $100, WHICHEVER IS GREATER.
        </p>
    </div>

    <div class="section">
        <h2>11. Indemnification</h2>
        <p>
            You agree to indemnify, defend, and hold harmless Crave and its officers, directors, employees, and agents 
            from any claims, damages, losses, liabilities, and expenses (including legal fees) arising from:
        </p>
        <ul>
            <li>Your use of the Service</li>
            <li>Your User Content</li>
            <li>Your violation of these Terms</li>
            <li>Your violation of any third-party rights</li>
        </ul>
    </div>

    <div class="section">
        <h2>12. Termination</h2>
        <p>
            We may suspend or terminate your access to the Service at any time, with or without notice, for any reason, 
            including violation of these Terms. You may delete your account at any time through the app settings.
        </p>
        <p>
            Upon termination, your right to use the Service ceases immediately. Provisions that by their nature should 
            survive termination (including indemnification, disclaimers, and limitations of liability) will continue 
            to apply.
        </p>
    </div>

    <div class="section">
        <h2>13. Changes to Terms</h2>
        <p>
            We reserve the right to modify these Terms at any time. We will notify you of material changes by posting 
            the updated Terms in the app and updating the "Last Updated" date. Your continued use of the Service after 
            changes become effective constitutes your acceptance of the revised Terms.
        </p>
    </div>

    <div class="section">
        <h2>14. Dispute Resolution</h2>
        <p>
            Any disputes arising from these Terms or the Service shall be governed by the laws of Texas, United States, 
            without regard to conflict of law principles. You agree to submit to the exclusive jurisdiction of courts 
            located in Travis County, Texas.
        </p>
        <p>
            Before filing a lawsuit, you agree to try to resolve disputes informally by contacting us at 
            cravesearch.app@gmail.com. We'll try to resolve the dispute informally within 30 days.
        </p>
    </div>

    <div class="section">
        <h2>15. Miscellaneous</h2>
        <ul>
            <li><strong>Entire Agreement:</strong> These Terms and our Privacy Policy constitute the entire agreement 
                between you and Crave</li>
            <li><strong>Severability:</strong> If any provision is found unenforceable, the remaining provisions will 
                remain in effect</li>
            <li><strong>Waiver:</strong> Our failure to enforce any provision does not constitute a waiver</li>
            <li><strong>Assignment:</strong> You may not assign these Terms; we may assign them without restriction</li>
            <li><strong>No Agency:</strong> These Terms do not create any agency, partnership, or employment relationship</li>
        </ul>
    </div>

    <div class="section contact">
        <h2>16. Contact Us</h2>
        <p>If you have questions about these Terms, please contact us at:</p>
        <p>
            <strong>Email:</strong> cravesearch.app@gmail.com<br>
            <strong>Support:</strong> Via the in-app "Help & Support" section
        </p>
    </div>
</body>
</html>
    `.trim();
  }
}
