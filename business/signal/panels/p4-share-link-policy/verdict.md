# Verdict: The shared artifact renders fully and freely; nothing beyond the artifact renders at all

## The call

**Rich-open wins. The rule is one sentence: a shared slug renders its artifact completely — no wall, no blur, no login — and renders _nothing that is not the artifact_.** No teaser mechanics anywhere on the public surface. The gate-everything paywall is untouched: the app still has exactly two states (onboarding, entitled), and no slug ever grants app access. Per object type:

- **Ranked restaurant list** — full render: names, ranks, restaurant-level Crave Scores, one evidence snippet per row. This is the dinner-table loop's core artifact and the strongest-evidenced case.
- **Single restaurant** — full card: score, "why this is ranked here" transparency, basics. The dish section shows top dish **names only** (max 3, no scores, no ranked list, **no blur** — it simply isn't rendered, because the dish layer is not the shared artifact).
- **Single dish** — full render: dish, restaurant, score, 1–2 evidence quotes, and the citywide ordinal ("#3 of 47 birria dishes ranked in Austin"). The ordinal is the hook; withholding the score of the one dish a friend just endorsed guts the endorsement.
- **Dish list / dish-ranking share** — the crown-jewel case: render the artifact exactly as the sender shared it (ranks + scores + one snippet per item), but the artifact is a **static snapshot** — no pagination beyond it, no fresh queries, no live re-ranking.
- **Poll** — full results, view-only; voting requires the app (and therefore payment).

**Slug-arrival funnel:** standard, at launch. Recipient taps the CTA → App Store → the full 17-step onboarding → the standard $7.99/$39.99 paywall, identical to every other arrival — no slug-specific offer, discount, or urgency (business-model.md Apple-proofing applies unchanged). Non-live-city recipients hit the existing city-pick waitlist branch; the web page itself renders for anyone anywhere (it's a page about Austin food, not a geo-gated product). The quiz-skip short path is **not** built at launch — it's a conditional earned by data (below).

**Launch-blocking: yes, minimally.** One shared public web template covering all four object types + a watermarked share card (OG image) + day-one instrumentation (share events, slug views, slug→store taps, and a "a friend sent me a link" option in the existing onboarding attribution step) joins the launch checklist. Polish (per-format card studio, SEO page network) does not.

**Anti-freemium drafting:** this verdict is the policy. monetization-and-gating.md is marked superseded wholesale and is **not** revived, verbatim or scoped. Enforcement rules: (1) slugs are **terminal pages** — no search box, no outbound links to other Crave entities, only the CTA; (2) **no blur anywhere on the public web** (blur implies a web reveal exists and invites web-paywall creep); (3) any interlinked public page network (SEO play) is a separate future owner decision, never a drift path. Freemium reopens through _navigation_, not rendering — so the boundary is navigational, and it is absolute.

## Why

The evidentiary asymmetry is not close. Zero of 64 transcripts show a walled shared artifact working; even the hardest-paywall operators gate usage, never the artifact (ledger/07). The artifact-loop vs. reciprocal-loop distinction is the corpus's cleanest structural finding, and Crave's dinner-table loop is an artifact loop by construction — the recipient needs the answer, not the app. Darcy (the corpus's one paid-upfront app with a working share loop, ~$20k month one, claimed) is the only paid-app precedent, and it is watermarked-rich, not teased. Discord's super-node economics carried the conversion worry: the organizer pays; the other five are audience, and the slug's job is recruiting the _next_ group's organizer.

The teaser brief died on its own citations. Its only share-surface precedent, Glam Up, is discarded by ledger/07 itself (first-session dopamine app bundled with forced-rating dark patterns and weekly pricing — ledger/02's best-supported rejection), and the brief concedes this, retreating to "plausible, not proven." Its strongest remaining argument — internal consistency with the in-app blurred dish teaser — misfires under gate-everything: that teaser belongs to the shelved freemium architecture; in the live model there is no in-app free tier for the web visitor to be "more generous than." Its taste-vs-crutch argument overstated: a static slug of tonight's birria answer does not answer next week's ramen craving; the crutch only materializes if recipients can navigate off the artifact into fresh queries — which this verdict gates absolutely. And blurring an answer a friend explicitly endorsed is bait-and-switch at the moment of maximum trust, a direct hit on the no-pay-to-rank integrity moat.

What survived from the teaser side, and shaped the boundary: the dish layer is genuinely the paid hero, and "rich artifact, gated navigation" is the correct synthesis — the rich brief itself conceded this carve-out. The rich brief's implementation item 5 (re-adopt monetization-and-gating.md's free/paid map "verbatim" for the web) was **rejected**: importing a whole freemium architecture as governing policy is exactly the quiet reopening this panel exists to prevent.

Quiz-skip died on solo-founder feasibility plus sequencing: deferred deep-link attribution through the App Store is real infrastructure, the launch checklist already carries five blockers (fact sheet), and ledger/07 itself frames the short path as conditional on proven conversion — "if it proves strong."

## Discarded as noise

- Glam Up's blurred-scan revenue numbers — packaged with dark patterns and weekly pricing; not a share-surface precedent at all (both briefs ultimately agree).
- NGL detonation math — friend-graph physics of a free social app; keep the mechanics, discard the curve.
- Invite-to-unlock (Nicole/Wink) — contaminates the pay-now message and creates a second offer path Apple-proofing forbids; no place in a hard-gate model.
- "The slug is Crave's only paid channel" (rich brief overreach) — the fact sheet verifies geo-targeted Spark ads exist; the slug is the _primary organic_ channel, which is sufficient to make it launch-blocking without exaggeration.
- Stronger's "nobody sends a paid app to their friends" as a law — they never built the artifact and never measured K-factor; a choice, not evidence.

## Reversal triggers

- **Dish-share substitution proven:** dish-ranking slugs show high repeat-view rates with near-zero store taps relative to restaurant-list slugs (same instrumentation, ≥3 months of data) → tighten dish shares to names + ranks (drop scores). Never to blur.
- **Slug→install proves strong** (shared-link attribution becomes a top-2 acquisition channel in the onboarding survey) → build the quiz-skip short path for slug arrivals.
- **Slug→install ≈ 0 at 6 months** with real view volume → the rich view stays (zero-cost brand + SEO surface per ledger/07), but launch-blocking status for future share polish is revoked and effort reallocates.
- **Apple review objects** to the web CTA/paywall interplay → adapt the CTA copy/path, never the rendering policy.

## Owner-conditional items

- **Launch-date tolerance:** the minimal web template + share card is ruled launch-blocking, but if it alone slips the date, ship-without vs. slip is Brandon's call (the loop can't be retrofit-instrumented, so slipping is the default recommendation).
- **SEO page network** ("best birria austin" programmatic pages): real latent-demand upside, real freemium-drift risk; requires a deliberate future decision with its own boundary rules — parked until Brandon opens it.
- **Web hosting scope:** the public slugs live on the same web property as the already-blocking legal URLs (cravesearch.com) — one hosting decision, Brandon's infrastructure budget.

## Implementation notes

1. Build one public web template (Next-or-static, `@AllowUnentitled` controllers already exist per the fact sheet) rendering all four artifact types; terminal pages, no nav, no search.
2. Watermark every render: Crave logo, city, "ranked by Crave — no pay to rank."
3. CTA sells the recipient their own generative version — "See every dish in Austin, ranked" — never "Download Crave."
4. OG/share card per artifact type (one layout, four data bindings).
5. Instrumentation before launch: share event, slug view, slug→store tap; add "a friend sent me a link" to the onboarding attribution step.
6. Amend business docs: mark monetization-and-gating.md superseded in full; this verdict is the public-surface policy of record.
7. Sequence after the existing five launch blockers (Apple enrollment → ASC products → RC key → paywall re-skin → legal URLs), sharing the web-property work with item 5 of that list.
