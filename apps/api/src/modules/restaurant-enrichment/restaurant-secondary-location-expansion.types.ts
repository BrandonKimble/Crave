export type RestaurantSecondaryLocationExpansionJobData = {
  restaurantId: string;
  placeId: string;
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
};
