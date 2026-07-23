export enum PollListState {
  active = 'active',
  closed = 'closed',
}

export enum PollListSort {
  // chronological (default) — newest launched first
  new = 'new',
  // total engagement — distinct users who voted or commented
  top = 'top',
  // decayed engagement velocity (heat) — recent momentum dominates
  trending = 'trending',
}

export enum PollListType {
  // everything (default)
  all = 'all',
  // ranked polls only (voting axis + bars) → PollMode.ranked
  polls = 'polls',
  // free-form discussions only (no bars) → PollMode.discussion
  discussions = 'discussions',
}

export enum PollListTime {
  // no time filter (default)
  all_time = 'all_time',
  // launched within the last 24 hours (wave-2 §3: Top's period set)
  today = 'today',
  // launched within the last 7 days
  this_week = 'this_week',
  // launched within the last 30 days (wave-2 §3)
  this_month = 'this_month',
}

// The legacy market-keyed ListPollsQueryDto died with the §22 item-5 feed
// cut — the feed request is QueryPollsDto (viewport bounds + cursor).
