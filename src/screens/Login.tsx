import React, { useState } from 'react';
import { auth, db } from '../services/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail, 
  GoogleAuthProvider, 
  signInWithPopup 
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

interface LoginProps {
  onShowReleaseNotes: () => void;
}

export const Login: React.FC<LoginProps> = ({ onShowReleaseNotes }) => {
  const [view, setView] = useState<'login' | 'signup' | 'forgot'>('login');
  
  // Login form states
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Signup form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPass, setSignupPass] = useState('');
  const [signupConfirmPass, setSignupConfirmPass] = useState('');

  // Forgot password form states
  const [forgotEmail, setForgotEmail] = useState('');

  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      alert('Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
    } catch (err: any) {
      console.error('Login error:', err);
      alert(err.message || 'Failed to authenticate.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      alert(err.message || 'Google authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !signupEmail || !signupPass || !signupConfirmPass) {
      alert('Please fill in all fields.');
      return;
    }
    if (signupPass !== signupConfirmPass) {
      alert('Passwords do not match!');
      return;
    }
    if (signupPass.length < 6) {
      alert('Password should be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, signupEmail.trim(), signupPass);
      
      const userDocRef = doc(db, 'players', cred.user.uid);
      await setDoc(userDocRef, {
        fullName: `${firstName} ${lastName}`.toUpperCase().trim(),
        isOnline: true,
        photoURL: '',
        createdAt: new Date()
      }, { merge: true });

    } catch (err: any) {
      console.error('Registration error:', err);
      alert(err.message || 'Failed to register account.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      alert('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, forgotEmail.trim());
      alert(`A password reset email has been sent to ${forgotEmail}. Please check your inbox / spam folder.`);
      setView('login');
    } catch (err: any) {
      console.error('Password reset error:', err);
      alert(err.message || 'Failed to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

  const inputType = showPassword ? 'text' : 'password';

  return (
    <div id="authScreen" className="flex items-center justify-center min-h-screen bg-[#0d131a] p-4 font-sans text-white">
      <div className="modal-card bg-[#1a252f] w-full max-w-[400px] p-[30px] rounded-2xl shadow-2xl border border-white/5 text-center">
        <h1 className="text-2xl font-black text-[var(--accent)] tracking-tight mb-6">Elite Rummy Circle</h1>
        
        {/* LOGIN VIEW */}
        {view === 'login' && (
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input 
              type="email" 
              className="std-input w-full p-3 rounded bg-slate-800 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-[var(--accent)]" 
              placeholder="Email Address"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              disabled={loading}
              autoComplete="email"
            />
            <input 
              type={inputType} 
              className="std-input w-full p-3 rounded bg-slate-800 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-[var(--accent)]" 
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
            />
            
            <div className="flex justify-between items-center text-xs opacity-80 select-none pb-2">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="showPassToggle" 
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-800 border-white/10 text-[var(--accent)] focus:ring-0 cursor-pointer"
                />
                <label htmlFor="showPassToggle" className="cursor-pointer">Show Password</label>
              </div>
              <button 
                type="button"
                onClick={() => {
                  if (loginEmail.trim()) {
                    setForgotEmail(loginEmail.trim());
                  }
                  setView('forgot');
                }} 
                className="text-[var(--accent)] hover:underline font-bold cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="actionBtn w-full py-3 bg-[var(--accent)] hover:opacity-90 active:scale-[0.98] rounded font-bold text-white transition duration-200 cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Log In'}
            </button>
            
            <div className="my-3 flex items-center justify-between gap-3 text-xs opacity-50">
              <div className="flex-1 h-[1px] bg-white/10"></div>
              <span>OR</span>
              <div className="flex-1 h-[1px] bg-white/10"></div>
            </div>

            <button 
              type="button" 
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="actionBtn w-full py-3 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded flex items-center justify-center gap-2 transition active:scale-[0.98] duration-200 cursor-pointer disabled:opacity-50"
            >
              <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" width="18" alt="Google logo" /> 
              Continue with Google
            </button>
            
            <p className="mt-4 text-xs text-slate-400">
              New here?{' '}
              <button 
                type="button"
                onClick={() => setView('signup')} 
                className="text-[var(--accent)] hover:underline font-bold ml-1 cursor-pointer"
              >
                Create Account
              </button>
            </p>
          </form>
        )}

        {/* SIGNUP VIEW */}
        {view === 'signup' && (
          <form onSubmit={handleSignup} className="flex flex-col gap-3">
            <input 
              type="text" 
              className="std-input w-full p-2.5 rounded bg-slate-800 border border-white/10 text-white placeholder-white/40 focus:outline-none" 
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={loading}
            />
            <input 
              type="text" 
              className="std-input w-full p-2.5 rounded bg-slate-800 border border-white/10 text-white placeholder-white/40 focus:outline-none" 
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={loading}
            />
            <input 
              type="email" 
              className="std-input w-full p-2.5 rounded bg-slate-800 border border-white/10 text-white placeholder-white/40 focus:outline-none" 
              placeholder="Email Address"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              disabled={loading}
              autoComplete="email"
            />
            <input 
              type={inputType} 
              className="std-input w-full p-2.5 rounded bg-slate-800 border border-white/10 text-white placeholder-white/40 focus:outline-none" 
              placeholder="Password"
              value={signupPass}
              onChange={(e) => setSignupPass(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
            />
            <input 
              type={inputType} 
              className="std-input w-full p-2.5 rounded bg-slate-800 border border-white/10 text-white placeholder-white/40 focus:outline-none" 
              placeholder="Confirm Password"
              value={signupConfirmPass}
              onChange={(e) => setSignupConfirmPass(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
            />
            
            <div className="flex items-center gap-2 text-xs opacity-80 select-none pb-2">
              <input 
                type="checkbox" 
                id="showPassToggleSignup" 
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-800 border-white/10 text-[var(--accent)] focus:ring-0 cursor-pointer"
              />
              <label htmlFor="showPassToggleSignup" className="cursor-pointer">Show Password</label>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="actionBtn w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-extrabold rounded active:scale-[0.98] transition duration-200 cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Registering...' : 'Register Now'}
            </button>
            <p className="mt-4 text-xs text-slate-400">
              Already have an account?{' '}
              <button 
                type="button"
                onClick={() => setView('login')} 
                className="text-[var(--accent)] hover:underline font-bold ml-1 cursor-pointer"
              >
                Back to Login
              </button>
            </p>
          </form>
        )}

        {/* FORGOT PASSWORD VIEW */}
        {view === 'forgot' && (
          <form onSubmit={handleResetPassword} className="flex flex-col gap-3">
            <h3 className="text-[var(--accent)] font-bold text-lg mb-1">Reset Password</h3>
            <p className="text-xs text-slate-400 leading-normal text-left mb-3">
              Enter your email address below, and we will send you a secure link to reset your password.
            </p>
            
            <input 
              type="email" 
              className="std-input w-full p-3 rounded bg-slate-800 border border-white/10 text-white placeholder-white/40 focus:outline-none" 
              placeholder="Email Address"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              disabled={loading}
              autoComplete="email"
            />
            
            <button 
              type="submit" 
              disabled={loading}
              className="actionBtn w-full py-3 bg-[#e74c3c] hover:bg-red-500 text-white font-bold rounded active:scale-[0.98] transition duration-200 cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            
            <p className="mt-4 text-xs text-slate-300">
              Remembered password?{' '}
              <button 
                type="button"
                onClick={() => setView('login')} 
                className="text-[var(--accent)] hover:underline font-bold ml-1 cursor-pointer"
              >
                Back to Login
              </button>
            </p>
          </form>
        )}

        {/* FOOTER */}
        <div className="mt-8 border-t border-white/10 pt-4 flex flex-col items-center">
          <button 
            onClick={onShowReleaseNotes}
            className="text-xs font-black text-[var(--accent)] hover:underline cursor-pointer"
          >
            v102.1
          </button>
          <div className="text-[10px] opacity-40 mt-1">Developer: Elite IT</div>
        </div>
      </div>
    </div>
  );
};
