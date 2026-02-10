import React, { useState } from 'react';

interface AuthPageProps {
  onLogin: (username: string) => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    if (isLogin) {
      // Login Logic
      const storedUser = localStorage.getItem(`user_${username}`);
      if (!storedUser) {
        setError('User not found. Please register first.');
        return;
      }

      const userData = JSON.parse(storedUser);
      if (userData.password === password) {
        onLogin(username);
      } else {
        setError('Invalid password.');
      }
    } else {
      // Registration Logic
      const storedUser = localStorage.getItem(`user_${username}`);
      if (storedUser) {
        setError('Username already exists.');
        return;
      }

      const newUser = { username, password };
      localStorage.setItem(`user_${username}`, JSON.stringify(newUser));
      setSuccess('Registration successful! Please login.');
      setIsLogin(true);
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row border border-gray-100">
        
        {/* Left Side: Brand */}
        <div className="md:w-1/2 bg-indigo-600 p-12 text-white flex flex-col justify-between relative overflow-hidden">
             <div className="relative z-10">
                 <div className="w-12 h-12 rounded bg-white/20 backdrop-blur-sm flex items-center justify-center mb-6">
                     <span className="font-bold text-2xl">A</span>
                 </div>
                 <h1 className="text-3xl font-bold mb-2">XJTLU AI Lab</h1>
                 <p className="text-indigo-100 font-medium">Research Intelligence Platform</p>
             </div>
             <div className="relative z-10">
                 <p className="text-sm text-indigo-200">
                    "Accelerate your literature review process with AI-driven insights."
                 </p>
             </div>

             {/* Decoration */}
             <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
             <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-indigo-900/20 rounded-full blur-3xl"></div>
        </div>

        {/* Right Side: Form */}
        <div className="md:w-1/2 p-12 flex flex-col justify-center">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">
              {isLogin ? 'Welcome back' : 'Create an account'}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {isLogin
                ? 'Please enter your details to sign in.'
                : 'Enter your details to get started.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-gray-900"
                placeholder="jdoe"
              />
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-gray-900"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-xs font-medium rounded-lg border border-red-100 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}
            
            {success && (
              <div className="p-3 bg-green-50 text-green-600 text-xs font-medium rounded-lg border border-green-100 flex items-center gap-2">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                {success}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-gray-900 hover:bg-black text-white font-medium rounded-lg shadow-sm transition-all duration-200 text-sm"
            >
              {isLogin ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button
                onClick={() => {
                    setIsLogin(!isLogin);
                    setError('');
                    setSuccess('');
                }}
                className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
              >
                {isLogin ? 'Sign up' : 'Log in'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;