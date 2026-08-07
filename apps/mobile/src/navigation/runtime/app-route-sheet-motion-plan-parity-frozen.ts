// GENERATED — DO NOT EDIT BY HAND.
// Regenerate with: scripts/bless-sheet-motion-parity.sh --bless
// (see app-route-sheet-motion-plan-parity-domain.ts for why this file exists)
//
// Editing these constants by hand to make a red spec go green is the exact failure the frozen
// digest was built to make visible. Bless deliberately, in its own diff, with the reason.

export const FROZEN_SHEET_MOTION_PARITY_ROW_COUNT = 24200;

export const FROZEN_SHEET_MOTION_PARITY_DIGEST = '6223306fddf98636f53d3aa1752e0779';

// One key per DISTINCT plan value over the parity domain, first key in canonical order.
export const FROZEN_SHEET_MOTION_PARITY_SAMPLE: Record<string, string> = {
  'search>search|bootstrap|remembered=null|explicit=null': '{"kind":"preserveLiveY"}',
  'search>search|bootstrap|remembered=null|explicit=collapsed':
    '{"kind":"snapTo","snap":"collapsed"}',
  'search>search|bootstrap|remembered=null|explicit=middle': '{"kind":"snapTo","snap":"middle"}',
  'search>search|bootstrap|remembered=null|explicit=expanded':
    '{"kind":"snapTo","snap":"expanded"}',
  'search>search|bootstrap|remembered=null|explicit=hidden': '{"kind":"hide"}',
  'search>restaurant|openChild|remembered=null|explicit=null':
    '{"kind":"promoteAtLeast","snap":"middle"}',
  'search>price|bootstrap|remembered=null|explicit=null': '{"kind":"none"}',
};
