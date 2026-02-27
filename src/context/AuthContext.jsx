import { createContext, useState, useContext, useEffect } from 'react';
import api from '../api/axios';
import { isTokenExpired } from '../api/auth';
import { db } from '../services/db';
import { decryptPrivateKey } from '../services/crypto';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [privateKey, setPrivateKey] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (token && isTokenExpired(token)) {
        logout();
      } else if (token) {
        try {
          const userData = storedUser ? JSON.parse(storedUser) : null;
          if (userData) {
            setUser(userData);
            
            const keyRecord = await db.keys.get(userData.username);
            const savedPwd = sessionStorage.getItem('last_pwd');
            if (keyRecord && savedPwd) {
              try {
                const privKey = await decryptPrivateKey(
                  keyRecord.encPrivateKey, 
                  savedPwd, 
                  keyRecord.salt
                );
                setPrivateKey(privKey);
              } catch (e) {
                console.warn("Failed to restore private key automatically");
              }
            }
          }
          
          const res = await api.get('/users/me');
          setUser(prev => {
            if (prev && prev.id === res.data.id && prev.fingerprint === res.data.fingerprint) {
              return prev;
            }
            return res.data;
          });
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
    sessionStorage.removeItem('last_pwd');

    const formData = new URLSearchParams();
    formData.append('username', username.trim());
    formData.append('password', password);

    const response = await api.post('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, user: loggedUser } = response.data;
    
    localStorage.setItem('token', access_token);
    sessionStorage.setItem('last_pwd', password); 
    
    if (loggedUser) {
      localStorage.setItem('user', JSON.stringify(loggedUser));
      setUser(loggedUser);
    } else {
      const meRes = await api.get('/users/me');
      localStorage.setItem('user', JSON.stringify(meRes.data));
      setUser(meRes.data);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('last_pwd');
    setUser(null);
    setPrivateKey(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading: loading, privateKey, setPrivateKey }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
