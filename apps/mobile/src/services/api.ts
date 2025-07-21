import axios from 'axios';

// Get the API URL from environment variables
// In a real app, we would use react-native-dotenv or similar
const API_URL = process.env.API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding token
api.interceptors.request.use(
  (config) => {
    const token = getToken(); // You'd implement this function to get token from secure storage
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Helper function to get token (placeholder)
const getToken = () => {
  // In a real app, you'd retrieve from secure storage
  return null;
};

export default api;
