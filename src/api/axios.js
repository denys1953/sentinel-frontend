import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_URL 
  ? import.meta.env.VITE_API_URL 
  : `${window.location.protocol}//${window.location.host.replace(':5173', ':8000')}`;

const api = axios.create({
  baseURL: apiBaseUrl,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response, 
  (error) => {
    if (error.response && error.response.status === 401) {
      console.warn("Token expired or invalid. Logging out...");
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login?message=session_expired';
      }
    }
    return Promise.reject(error);
  }
);

export default api;