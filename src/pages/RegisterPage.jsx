import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { generateRegistrationData } from '../services/crypto';
import { db } from '../services/db';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);
    try {
      const { publicKey, encPrivateKey, salt, rawPrivateKey } = await generateRegistrationData(password);

      await api.post('/auth/register', {
        username,
        password,
        public_key: publicKey,
        enc_private_key: encPrivateKey,
        salt: salt
      });

      await db.keys.put({ username, rawPrivateKey, salt });

      setSuccess(true);
      
      await login(username, password);

      setTimeout(() => {
        navigate('/chat');
      }, 3000);
    } catch (err) {
      console.error(err);
      
      const detail = err.response?.data?.detail;
      let errorMessage = "Помилка реєстрації. Спробуйте інше ім'я або пароль.";
      
      if (typeof detail === 'string') {
        errorMessage = detail;
      } else if (Array.isArray(detail)) {
        errorMessage = detail.map(d => d.msg).join(", ");
      } else if (detail && typeof detail === 'object') {
        errorMessage = detail.msg || JSON.stringify(detail);
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 font-sans">
      <form onSubmit={handleRegister} className="bg-slate-800 p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-700">
        <h2 className="text-3xl font-bold text-white mb-6 text-center text-blue-400">Join Sentinel</h2>
        <p className="text-slate-400 text-center mb-8 italic">Start secure conversations today</p>
        
        {success && (
          <div className="bg-green-500/10 border border-green-500 text-green-500 p-3 rounded mb-4 text-sm font-medium animate-pulse">
            Реєстрація успішна! Входимо в систему...
          </div>
        )}

        {error && <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded mb-4 text-sm font-medium">{error}</div>}

        <div className="mb-4">
          <label className="block text-slate-400 text-sm font-medium mb-1">Username</label>
          <input
            type="text"
            className="w-full p-3 rounded bg-slate-700 text-white border border-slate-600 focus:border-blue-500 outline-none transition"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        
        <div className="mb-6">
          <label className="block text-slate-400 text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            className="w-full p-3 rounded bg-slate-700 text-white border border-slate-600 focus:border-blue-500 outline-none transition"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-bold p-3 rounded-lg transition active:scale-95 shadow-lg"
        >
          {loading ? 'Створення акаунту...' : 'Зареєструватися'}
        </button>

        <p className="mt-6 text-center text-slate-400 text-sm">
          Вже є акаунт? <Link to="/login" className="text-blue-500 hover:underline">Увійти</Link>
        </p>
      </form>
    </div>
  );
}
