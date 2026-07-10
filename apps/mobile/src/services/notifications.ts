import api from './api';

export interface RegisterDeviceRequest {
  token: string;
  userId?: string | null;
  platform?: string;
  appVersion?: string;
  locale?: string;
  city?: string;
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
