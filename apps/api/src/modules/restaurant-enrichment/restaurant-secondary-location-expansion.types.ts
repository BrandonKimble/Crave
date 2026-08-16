export type PlaceSecondaryLocationExpansionJobData = {
  placeId: string;
  googlePlaceId: string;
  requestedAt: string;
  source?: string;
  /**
   * The campaign funding the work that ENQUEUED this expansion, if any
   * (F352-attribution, owner-ruled 2026-08-03).
   *
   * AsyncLocalStorage does not cross the BullMQ boundary, so the ambient
   * campaign is captured into the payload at enqueue time and re-established
   * by the worker — the same mechanism the primary-enrichment and
   * attribute-ontology lanes already use.
   *
   * This is ATTRIBUTION, NOT A GATE. Bulk events (city onboarding,
   * re-extraction) run under a campaign, so the Places money their expansion
   * spends lands on that campaign's bill instead of escaping every envelope.
   * ROUTINE collection triggers expansion with no campaign in context; the
   * field is then absent and the lane behaves exactly as before —
   * pool-governed and approval-free, forever (owner ruling 2026-08-03:
   * campaigns are for one-time bulk events only). Nothing anywhere refuses
   * expansion for want of a campaign.
   */
  campaignId?: string;
  /** P2.2 locations-follow-testimony: when set, this job is a METRO
   *  PROBE — the expansion's Places text search is biased to this
   *  community's anchor so a brand's LOCAL branches attach (the unbiased
   *  60-result cap makes mega-chain expansion geographically arbitrary;
   *  measured: Dunkin's 39 stored locations were all California). The
   *  worker records metro_location_probes for the cooldown. */
  metroCommunityHandle?: string;
};
