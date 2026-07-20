import api from './api';

export interface RegisterDeviceRequest {
  token: string;
  userId?: string | null;
  platform?: string;
  appVersion?: string;
  locale?: string;
  city?: string;
  /**
   * §4 home-place registration — GROUND TRUTH home coordinate; the server
   * judges placeAt. {lat,lng} = set/refresh; explicit null = location revoked,
   * clear the stored home place; absent = no signal, server keeps its value.
   */
  homeLocation?: { lat: number; lng: number } | null;
}

export const notificationsService = {
  async registerDevice(body: RegisterDeviceRequest): Promise<void> {
    await api.post('/notifications/devices/register', body);
  },
  async unregisterDevice(token: string): Promise<void> {
    await api.post('/notifications/devices/unregister', { token });
  },
  async getFeed(options?: { offset?: number; limit?: number }): Promise<NotificationFeedResponse> {
    const response = await api.get<NotificationFeedResponse>('/notifications/feed', {
      params: options,
    });
    return response.data;
  },
  async markFeedRead(): Promise<void> {
    await api.post('/notifications/feed/read');
  },
};

/** The in-app feed (the notifications page). */
export interface NotificationFeedActor {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface NotificationFeedItem {
  userNotificationId: string;
  type: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  actor: NotificationFeedActor | null;
}

export interface NotificationFeedResponse {
  items: NotificationFeedItem[];
  unreadCount: number;
}
