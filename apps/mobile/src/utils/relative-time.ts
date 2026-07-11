// THE compact relative timestamp (W2 consolidation — superset of the former
// MessagingPanels.relativeTime + PollDetailPanel.formatRelativeTime copies):
// null/invalid-safe, now/m/h/d buckets, and past-a-week falls back to a short date.
export const formatRelativeTime = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = (Date.now() - date.getTime()) / 1000;
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
