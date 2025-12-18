import axios from 'axios';
import { logger } from '../utils';
import { useSystemStatusStore } from '../store/systemStatusStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
export const API_BASE_URL = API_URL;

type TokenResolver = () => Promise<string | null>;

let tokenResolver: TokenResolver | null = null;

export const setAuthTokenResolver = (resolver: TokenResolver | null) => {
  tokenResolver = resolver;
};

const getAuthToken = async (): Promise<string | null> => {
  if (!tokenResolver) {
    return null;
  }
  try {
    return await tokenResolver();
  } catch (error) {
    logger.warn('Failed to resolve auth token', error);
    return null;
  }
};

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding token
api.interceptors.request.use(
  async (config) => {
    const token = await getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    const systemStatus = useSystemStatusStore.getState();
    systemStatus.clearServiceIssue('global');
    return response;
  },
  (error) => {
    if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }

    const systemStatus = useSystemStatusStore.getState();
    const status: number | undefined =
      typeof error?.response?.status === 'number' ? error.response.status : undefined;
    const responseData: unknown = error?.response?.data;
    const responseRecord: Record<string, unknown> | null =
      responseData && typeof responseData === 'object' && !Array.isArray(responseData)
        ? (responseData as Record<string, unknown>)
        : null;
    const errorCode =
      responseRecord && typeof responseRecord.errorCode === 'string'
        ? responseRecord.errorCode
        : undefined;
    const responseMessage =
      responseRecord && typeof responseRecord.message === 'string'
        ? responseRecord.message
        : undefined;

    if (typeof status === 'number' && status >= 500 && !systemStatus.isOffline) {
      const scope = errorCode === 'LLM_UNAVAILABLE' ? 'search' : 'global';
      systemStatus.reportServiceIssue({
        scope,
        message: responseMessage || 'Service temporarily unavailable.',
      });
    }

    logger.error('API request failed', {
      message: error.message,
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
    });
    return Promise.reject(error);
  }
);

export default api;
