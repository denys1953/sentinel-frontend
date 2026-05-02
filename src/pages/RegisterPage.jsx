import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { generateRegistrationData, deriveMasterKey, exportMasterKey } from '../services/crypto';
import { db } from '../services/db';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, login2fa, setPrivateKey } = useAuth();
  const navigate = useNavigate();

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [code2fa, setCode2fa] = useState('');
  
  // Registration data we need after 2FA
  const [pendingKeySetup, setPendingKeySetup] = useState(null);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);
    try {
      const { publicKey, encPrivateKey, salt, rawPrivateKey } = await generateRegistrationData(password);

      await api.post('/auth/register', {
        username: username.trim(),
        password,
        public_key: publicKey,
        enc_private_key: encPrivateKey,
        salt: salt
      });

      await db.keys.put({ username, encPrivateKey, salt });

      // Automatically login to trigger 2FA setup
      const result = await login(username, password);
      
      if (result && result.requires_2fa) {
          setPendingKeySetup({ rawPrivateKey, salt });
          setRequires2FA(true);
          setTempToken(result.temp_token);
          if (result.setup_required) {
              setSetupRequired(true);
              setQrCode(result.qr_code);
              setSecret(result.secret);
          }
          return;
      }
      
      // If 2FA is somehow not required (fallback)
      await finishKeySetup(rawPrivateKey, salt);
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

  const finishKeySetup = async (rawPrivateKey, salt) => {
      setPrivateKey(rawPrivateKey);
      const masterKey = await deriveMasterKey(password, salt);
      const exportedMasterKey = await exportMasterKey(masterKey);
      sessionStorage.setItem('master_key', exportedMasterKey);
      setSuccess(true);
      setTimeout(() => {
        navigate('/chat');
      }, 1000);
  };

  const handle2FASubmit = async (e) => {
      e.preventDefault();
      setError('');
      setLoading(true);
      try {
          await login2fa(tempToken, code2fa);
          await finishKeySetup(pendingKeySetup.rawPrivateKey, pendingKeySetup.salt);
      } catch (err) {
          setError(err.response?.data?.detail || "Невірний код 2FA");
      } finally {
          setLoading(false);
      }
  };

  if (requires2FA) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 font-sans p-4">
          <form onSubmit={handle2FASubmit} className="bg-slate-800 p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-700">
            <h2 className="text-3xl font-bold text-white mb-6 text-center text-blue-400">Налаштування 2FA</h2>
            
            {success && (
              <div className="bg-green-500/10 border border-green-500 text-green-500 p-3 rounded mb-4 text-sm font-medium animate-pulse text-center">
                Успішно! Входимо в систему...
              </div>
            )}

            {!success && setupRequired && (
              <div className="flex flex-col items-center mb-6">
                <div className="bg-blue-500/10 border border-blue-500/30 text-blue-400 p-3 rounded-lg text-sm text-center mb-4">
                  Для вашої безпеки, використання 2FA є обов'язковим. Відскануйте QR-код нижче у своєму додатку Authenticator (напр. Google Authenticator).
                </div>
                <div className="bg-white p-2 rounded-xl mb-4">
                  <img src={qrCode} alt="2FA QR Code" className="w-40 h-40" />
                </div>
                <code className="text-xs text-slate-400 bg-slate-900 p-2 rounded break-all text-center max-w-full mb-2">
                  {secret}
                </code>
                <p className="text-slate-400 text-center text-sm">Введіть 6-значний код для підтвердження</p>
              </div>
            )}
            
            {error && <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded mb-4 text-sm font-medium">{error}</div>}

            {!success && (
              <>
                <div className="mb-6">
                  <input
                    type="text"
                    maxLength="6"
                    placeholder="000000"
                    className="w-full p-3 rounded bg-slate-700 text-white border border-slate-600 focus:border-blue-500 outline-none transition text-center tracking-widest text-2xl"
                    value={code2fa}
                    onChange={(e) => setCode2fa(e.target.value.replace(/\D/g, ''))}
                    required
                  />
                </div>

                <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-bold p-3 rounded-lg transition active:scale-95 shadow-lg">
                  {loading ? 'Перевірка...' : 'Підтвердити та увійти'}
                </button>
              </>
            )}
          </form>
        </div>
      );
  }

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
