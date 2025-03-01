export interface Restaurant {
  id: string;
  name: string;
  location?: {
    address?: string;
    neighborhood?: string;
    coordinates?: [number, number];
  };
  hours?: Record<string, { open: string; close: string }>;
  tags: string[];
  dishes?: Dish[];
  mentions: number;
  score: number;
  createdAt: string;
  updatedAt: string;
}

export interface Dish {
  id: string;
  name: string;
  score: number;
  tags: string[];
  mentions: number;
  restaurantId: string;
  restaurant?: Restaurant;
  createdAt: string;
  updatedAt: string;
}

export interface Mention {
  id: string;
  source: string; // Reddit post/comment ID
  content: string;
  sentiment?: number;
  upvotes: number;
  threadContext?: string;
  timestamp: string;
  dishId?: string;
  dish?: Dish;
  restaurantId?: string;
  restaurant?: Restaurant;
  createdAt: string;
}
