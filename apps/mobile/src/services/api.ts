import axios from 'axios';
import { logger } from '../utils';

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
  (response) => response,
  (error) => {
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
