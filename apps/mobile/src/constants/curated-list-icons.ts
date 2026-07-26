import type { LucideIcon } from 'lucide-react-native';
import {
  Briefcase,
  Gem,
  Heart,
  List,
  Sparkles,
  TrendingUp,
  Users,
  Utensils,
  UtensilsCrossed,
} from 'lucide-react-native';

/**
 * HOME curated-list icon vocabulary (home-surface-charter): the server's
 * `iconKey` strings (apps/api curated-lists.constants.ts — ICON_* + the
 * context-recipe keys) mapped to existing lucide glyphs. Open vocabulary on
 * the wire — an unknown key renders the sensible default, never breaks.
 */
export const CURATED_LIST_ICON_BY_KEY: Record<string, LucideIcon> = {
  trending: TrendingUp,
  hidden_gems: Gem,
  cuisine: UtensilsCrossed,
  dish: Utensils,
  weekly_tasting: Sparkles,
  date_night: Heart,
  family_group: Users,
  business_lunch: Briefcase,
};

export const CURATED_LIST_DEFAULT_ICON: LucideIcon = List;

export const resolveCuratedListIcon = (iconKey: string | null | undefined): LucideIcon =>
  (iconKey != null ? CURATED_LIST_ICON_BY_KEY[iconKey] : undefined) ?? CURATED_LIST_DEFAULT_ICON;
