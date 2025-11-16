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
};
