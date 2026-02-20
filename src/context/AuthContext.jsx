import { createContext, useState, useContext, useEffect } from 'react';
import api from '../api/axios';
import { isTokenExpired } from '../api/auth';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (token && isTokenExpired(token)) {
        logout();
      } else if (token) {
        try {
          const res = await api.get('/users/me');
          setUser(res.data);
          localStorage.setItem('user', JSON.stringify(res.data));
        } catch (err) {
          console.error("Auth initialization failed:", err);
          logout();
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (username, password) => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    const formData = new URLSearchParams();
    formData.append('username', username.trim());
    formData.append('password', password);

    const response = await api.post('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, user } = response.data;
    
    localStorage.setItem('token', access_token);
    
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
      setUser(user);
    } else {
      const meRes = await api.get('/users/me');
      localStorage.setItem('user', JSON.stringify(meRes.data));
      setUser(meRes.data);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading: loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
