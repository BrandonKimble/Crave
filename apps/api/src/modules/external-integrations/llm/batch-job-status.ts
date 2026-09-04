/**
 * THE ONE LIST of batch-job statuses that still owe work (red team
 * 2026-08-19 docket D10, landed 2026-09-04 with G-3). GeminiBatchService
 * reads it to poll and to alarm; SpendCampaignService reads it to refuse
 * completing a campaign that still carries paid, uncollected output. Two
 * lists would be two answers to "is this job done".
 */
export const NON_TERMINAL_BATCH_STATUSES = [
  'pending',
  'persisting',
  'submitting',
  'submitted',
  'succeeded',
  'ingesting',
] as const;
