import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

export default function ProfileModal({ onClose }) {
  const { user, updateUser } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  // 2FA state is view-only now as it's mandatory

  const handleAvatarClick = () => {
    if (!uploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    setError('');

    try {
      await api.post('/users/me/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      await updateUser();
    } catch (err) {
      console.error("Failed to upload avatar:", err);
      setError('Failed to upload avatar. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const copyFingerprint = () => {
    if (user?.fingerprint) {
      navigator.clipboard.writeText(user.fingerprint);
    }
  };



  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative h-24 bg-gradient-to-r from-blue-600 to-indigo-600">
          <button 
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 bg-black/20 hover:bg-black/40 rounded-full text-white/80 hover:text-white transition-colors z-10"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 pb-6 pt-0 relative flex flex-col items-center">
          <div className="relative group cursor-pointer w-24 h-24 rounded-full border-4 border-slate-900 bg-slate-800 -mt-12 mb-3 shadow-lg z-0" onClick={handleAvatarClick}>
            <div className="w-full h-full rounded-full flex items-center justify-center text-4xl font-bold text-white overflow-hidden bg-blue-600">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                user?.username?.[0]?.toUpperCase()
              )}
            </div>
            
            <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-slate-900 bg-green-500 z-10`} />

            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full backdrop-blur-[2px] z-20">
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleAvatarChange}
                disabled={uploading}
                ref={fileInputRef}
              />
              {uploading ? (
                <div className="w-8 h-8 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
              ) : (
                <svg className="w-6 h-6 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </div>
            
            <div className="absolute bottom-0 right-0 max-w-[20px] max-h-[20px] bg-slate-800 rounded-full p-1 border border-slate-600 group-hover:opacity-0 transition-opacity z-30 shadow-lg translate-x-1/4 translate-y-1/4">
               <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
               </svg>
            </div>
          </div>
          
          <div className="text-center w-full mb-6">
            <h3 className="text-2xl font-bold text-white mb-1 tracking-tight">{user?.username}</h3>
            <p className="text-sm text-green-500">
              В мережі
            </p>
          </div>

          <div className="w-full space-y-3">
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 hover:border-slate-600/50 transition-colors group">
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Fingerprint ID</label>
                <div className="text-[10px] text-slate-600 italic group-hover:text-blue-400/50 transition-colors">Унікальний ідентифікатор</div>
              </div>
              <div className="flex items-center gap-2 bg-slate-950/50 rounded-lg p-2 border border-slate-800/50 group-hover:border-slate-700 transition-colors">
                <code className="flex-1 text-xs font-mono text-slate-300 break-all line-clamp-2" title={user?.fingerprint}>
                  {user?.fingerprint}
                </code>
                <button 
                  onClick={copyFingerprint}
                  className="p-1.5 text-slate-500 hover:text-white hover:bg-blue-600 rounded-md transition-all active:scale-95 shrink-0"
                  title="Копіювати"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>

            
            {error && (
              <p className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 p-3 rounded-xl animate-in fade-in slide-in-from-top-1">{error}</p>
            )}
            {success && (
              <p className="text-green-400 text-xs text-center bg-green-500/10 border border-green-500/20 p-3 rounded-xl animate-in fade-in slide-in-from-top-1">{success}</p>
            )}
            
            <button 
                onClick={onClose}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl transition-all duration-200 mt-2 border border-slate-700"
            >
                Закрити
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}