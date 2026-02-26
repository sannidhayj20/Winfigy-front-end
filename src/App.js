// App.js - VWO Style Financial Analysis Platform
import React, { useState, useEffect } from 'react';
import {
  useAuthenticationStatus,
  useUserData,
  useUserId,
  useNhostClient,
  useFileUpload,
  useSignInEmailPassword,
  useSignUpEmailPassword,
  useResetPassword,
  useSignOut
} from '@nhost/react';
import { useMutation, useSubscription, gql } from '@apollo/client';
import {
  Upload, FileText, Lock, LogOut,
  ShieldCheck, Clock, AlertCircle,
  Trash2, Send, CheckCircle, BarChart3,
  TrendingUp, FileSearch, Zap, MessageSquare,
  Plus, ChevronRight, Eye, EyeOff
} from 'lucide-react';

// ============================================
// GRAPHQL DEFINITIONS
// ============================================
const INSERT_CHAT = gql`
  mutation InsertChat($file_id: uuid!, $file_name: String!, $query: String!) {
    insert_chats_one(object: {
      file_id: $file_id,
      file_name: $file_name,
      status: "pending",
      query: $query
    }) {
      id
    }
  }
`;

const GET_MY_HISTORY_SUB = gql`
  subscription GetMyHistory {
    chats(order_by: { created_at: desc }) {
      id
      file_name
      status
      analysis_result
      created_at
      file_id
      user_id
      query
    }
  }
`;

const RENDER_API_URL = "https://wingify-crewai-correct-code.onrender.com/analyze";

// ============================================
// HELPER FUNCTIONS
// ============================================
const validateFile = (file, options = {}) => {
  const { maxSizeMB = 10, allowedTypes = ['application/pdf'] } = options;
  if (!file) return { valid: false, error: "No file selected" };
  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > maxSizeMB) {
    return { valid: false, error: `File size exceeds ${maxSizeMB}MB limit (${fileSizeMB.toFixed(2)}MB)` };
  }
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: `File type not allowed. Accepted: ${allowedTypes.join(', ')}` };
  }
  return { valid: true, error: null };
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const PROGRESS_MESSAGES = {
  uploading: "Uploading file to secure storage...",
  queueing: "Creating analysis record...",
  processing: "Sending to AI agents...",
  completed: "Analysis queued successfully!",
  error: "Upload failed. Please try again.",
};

// ============================================
// MAIN APP COMPONENT
// ============================================
function App() {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const user = useUserData();
  const userId = useUserId();
  const { signOut } = useSignOut();
  const { upload } = useFileUpload();

  // Detect if user arrived via a password-reset email link.
  // Nhost can redirect with:
  //   ?refreshToken=xxx&type=passwordReset  (Nhost v2)
  //   #type=recovery&...                    (Supabase-style fragment)
  const [isPasswordReset, setIsPasswordReset] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return (
      searchParams.get('type') === 'passwordReset' ||
      hashParams.get('type') === 'recovery' ||
      hashParams.get('type') === 'passwordReset'
    );
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [userQuery, setUserQuery] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  // Store only the ID — the live chat object is always derived from subscription data
  const [selectedChatId, setSelectedChatId] = useState(null);

  const [insertChat] = useMutation(INSERT_CHAT);

  const { data, loading: subLoading, error: subError } = useSubscription(GET_MY_HISTORY_SUB, {
    skip: !isAuthenticated,
    onError: (error) => {
      console.error("Subscription error:", error);
    }
  });

  const myChats = data?.chats?.filter(chat => chat.user_id === userId) || [];
  // Always derive from live subscription data so status updates instantly
  const selectedChat = myChats.find(c => c.id === selectedChatId) || null;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    const validation = validateFile(file, { maxSizeMB: 10, allowedTypes: ['application/pdf'] });
    if (!validation.valid) {
      alert(validation.error);
      e.target.value = null;
      return;
    }
    setSelectedFile(file);
    setUploadProgress(0);
    setProgressMessage('');
  };

  const handleUploadAndAnalyze = async () => {
    if (!selectedFile || !userId) {
      alert("Please select a file and ensure you're logged in.");
      return;
    }

    setIsProcessing(true);
    setProgressMessage(PROGRESS_MESSAGES.uploading);
    setUploadProgress(10);

    try {
      const uploadResult = await upload({ file: selectedFile });

      if (uploadResult.isError || uploadResult.error) {
        throw new Error(uploadResult.error?.message || "File upload failed");
      }

      const fileId = uploadResult.file?.id || uploadResult.id;
      if (!fileId) throw new Error("Failed to get file ID after upload");

      setUploadProgress(50);
      setProgressMessage(PROGRESS_MESSAGES.queueing);

      const finalQuery = userQuery.trim() || "Analyze financial trends and risks";

      const { data: mutationData, errors } = await insertChat({
        variables: {
          file_id: fileId,
          file_name: selectedFile.name,
          query: finalQuery,
        },
      });

      if (errors) throw new Error(`Database error: ${errors[0]?.message || "Unknown database error"}`);

      const chatId = mutationData?.insert_chats_one?.id;
      if (!chatId) throw new Error("Failed to create analysis record");

      setUploadProgress(75);
      setProgressMessage(PROGRESS_MESSAGES.processing);

      const response = await fetch(RENDER_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          file_id: fileId,
          user_id: userId,
          query: finalQuery,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Analysis service failed: ${response.status} - ${errorText}`);
      }

      setUploadProgress(100);
      setProgressMessage(PROGRESS_MESSAGES.completed);

      // Navigate to the new chat — subscription will stream live status updates
      setSelectedChatId(chatId);
      setSelectedFile(null);
      setUserQuery('');
      setUploadProgress(0);
      setProgressMessage('');

    } catch (err) {
      console.error("Upload/Analysis Error:", err);
      alert(`❌ Error: ${err.message}\n\nCheck browser console (F12) for details.`);
      setProgressMessage(PROGRESS_MESSAGES.error);
    } finally {
      setIsProcessing(false);
      const fileInput = document.getElementById('file-upload');
      if (fileInput) fileInput.value = null;
    }
  };

  const handleNewAnalysis = () => {
    setSelectedChatId(null);
    setSelectedFile(null);
    setUserQuery('');
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '3px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#64748b', fontSize: 14 }}>Loading your workspace...</p>
        </div>
      </div>
    );
  }

  // If the user arrived via a password-reset link, show the new-password form
  if (isPasswordReset) {
    return <ResetPasswordPage onDone={() => {
      setIsPasswordReset(false);
      // Clean the URL so a refresh doesn't re-trigger this
      window.history.replaceState({}, document.title, window.location.pathname);
    }} />;
  }

  return (
    <div style={{ minHeight: '100vh', fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; } 
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      `}</style>

      {!isAuthenticated ? (
        <LoginPage />
      ) : (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f8fafc' }}>
          <Sidebar
            myChats={myChats}
            selectedChat={selectedChat}
            onSelectChat={(chat) => setSelectedChatId(chat.id)}
            onNewAnalysis={handleNewAnalysis}
            subLoading={subLoading}
            subError={subError}
          />

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <header style={{
              height: 64, background: '#fff', borderBottom: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 24px', flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
                  padding: '8px', borderRadius: 10, display: 'flex'
                }}>
                  <BarChart3 size={20} color="#fff" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>Financial Analysis Platform</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Powered by Wingify AI</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{user?.email}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Premium Account</div>
                </div>
                <button
                  onClick={() => signOut()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', background: 'none', border: '1px solid #e2e8f0',
                    borderRadius: 8, cursor: 'pointer', color: '#64748b', fontSize: 13, fontWeight: 500,
                    transition: 'all 0.15s', fontFamily: 'inherit'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#0f172a'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#64748b'; }}
                >
                  <LogOut size={15} />
                  Sign Out
                </button>
              </div>
            </header>

            {/* Main Content */}
            <main style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
              {selectedChat ? (
                <ChatWorkspace chat={selectedChat} subLoading={subLoading} />
              ) : (
                <UploadWorkspace
                  selectedFile={selectedFile}
                  userQuery={userQuery}
                  setUserQuery={setUserQuery}
                  isProcessing={isProcessing}
                  uploadProgress={uploadProgress}
                  progressMessage={progressMessage}
                  handleFileChange={handleFileChange}
                  handleUploadAndAnalyze={handleUploadAndAnalyze}
                />
              )}
            </main>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// RESET PASSWORD PAGE
// Shown when user clicks the link in their reset email
// ============================================
const ResetPasswordPage = ({ onDone }) => {
  const nhost = useNhostClient();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) return setError('Password must be at least 6 characters.');
    if (newPassword !== confirmPassword) return setError('Passwords do not match.');

    setIsSubmitting(true);
    try {
      const { error: changeError } = await nhost.auth.changePassword({ newPassword });
      if (changeError) throw new Error(changeError.message);
      setSuccess(true);
      // Redirect to login after 2.5s
      setTimeout(() => onDone(), 2500);
    } catch (err) {
      setError(err.message || 'Failed to update password. The reset link may have expired — please request a new one.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)', fontFamily: "'DM Sans', -apple-system, sans-serif", padding: 24 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .rp-input { width: 100%; padding: 11px 12px 11px 40px; border-radius: 8px; background: #fff; border: 1.5px solid #e2e8f0; font-size: 14px; font-family: inherit; outline: none; transition: border-color 0.15s, box-shadow 0.15s; color: #0f172a; }
        .rp-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .rp-input.error { border-color: #ef4444; }
      `}</style>

      <div style={{ width: '100%', maxWidth: 420, animation: 'fadeIn 0.3s ease' }}>
        {/* Brand pill */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 20, background: '#fff', padding: '8px 16px', borderRadius: 100, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ background: '#1d4ed8', padding: '5px', borderRadius: 6, display: 'flex' }}>
              <BarChart3 size={16} color="#fff" />
            </div>
            <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>Wingify</span>
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 8, letterSpacing: '-0.3px' }}>Set a new password</h2>
          <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>
            Choose a strong password for your account.
          </p>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '32px 32px 24px' }}>
            {success ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ width: 56, height: 56, background: '#f0fdf4', border: '2px solid #bbf7d0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <CheckCircle size={28} color="#16a34a" />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Password updated!</h3>
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
                  Your password has been changed successfully. Redirecting you to sign in...
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {/* New Password */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                    New Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}>
                      <Lock size={15} />
                    </div>
                    <input
                      type={showNew ? 'text' : 'password'}
                      className={`rp-input${error ? ' error' : ''}`}
                      style={{ paddingRight: 40 }}
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowNew(!showNew)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}>
                      {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 5 }}>Minimum 6 characters</div>
                </div>

                {/* Confirm Password */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                    Confirm Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}>
                      <Lock size={15} />
                    </div>
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      className={`rp-input${error && confirmPassword ? ' error' : ''}`}
                      style={{ paddingRight: 40 }}
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                    />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}>
                      {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {/* Live match indicator */}
                  {confirmPassword.length > 0 && (
                    <div style={{ fontSize: 12, marginTop: 5, color: newPassword === confirmPassword ? '#16a34a' : '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {newPassword === confirmPassword
                        ? <><CheckCircle size={11} /> Passwords match</>
                        : <><AlertCircle size={11} /> Passwords don't match yet</>}
                    </div>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                    <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 13, color: '#b91c1c', lineHeight: 1.4 }}>{error}</span>
                  </div>
                )}

                {/* Spam note */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', marginBottom: 20 }}>
                  <span style={{ fontSize: 15, flexShrink: 0 }}>📬</span>
                  <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                    If you didn't receive the reset email, check your <strong>spam or junk folder</strong> — emails from Nhost may be filtered there.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    width: '100%', padding: '12px', background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                    color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                    fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 8, opacity: isSubmitting ? 0.65 : 1,
                    transition: 'all 0.15s'
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      Updating...
                    </>
                  ) : (
                    <><ShieldCheck size={16} /> Update Password</>
                  )}
                </button>
              </form>
            )}
          </div>

          <div style={{ padding: '16px 32px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
            <button
              onClick={onDone}
              style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 600, color: '#2563eb', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              ← Back to sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// LOGIN PAGE - VWO Split-Screen Style
// ============================================
const LoginPage = () => {
  const [view, setView] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const nhost = useNhostClient();

  const { signInEmailPassword, isLoading: isLoggingIn, isError: loginError, error: lErr } = useSignInEmailPassword();
  const { signUpEmailPassword, isLoading: isSigningUp, isError: signUpError, error: sErr } = useSignUpEmailPassword();
  const { resetPassword, isLoading: isResetting, isSent, error: resetError } = useResetPassword();

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!email.trim()) return alert("Please enter your email");
    if (view !== 'forgot' && password.length < 6) return alert("Password must be 6+ characters");
    try {
      if (view === 'login') await signInEmailPassword(email, password);
      else if (view === 'signup') await signUpEmailPassword(email, password);
      else if (view === 'forgot') await resetPassword(email);
    } catch (err) {
      console.error("Auth error:", err);
    }
  };

  const handleGlobalSignOut = async () => {
    if (window.confirm("⚠️ Terminate ALL sessions?")) {
      try {
        await nhost.auth.signOut({ all: true });
        localStorage.clear(); sessionStorage.clear();
        alert("✅ All sessions terminated");
        window.location.reload();
      } catch (err) {
        localStorage.clear(); sessionStorage.clear();
        window.location.reload();
      }
    }
  };

  const features = [
    { icon: <BarChart3 size={20} />, title: "A/B Testing", desc: "Run unlimited experiments with statistical confidence" },
    { icon: <TrendingUp size={20} />, title: "Heatmaps & Insights", desc: "Understand exactly how users interact with your data" },
    { icon: <Zap size={20} />, title: "Web Rollouts", desc: "Deploy changes instantly without engineering support" },
    { icon: <ShieldCheck size={20} />, title: "Personalization", desc: "Deliver tailored experiences that convert better" },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .login-input { width: 100%; padding: 11px 12px 11px 40px; border-radius: 8px; background: #fff; border: 1.5px solid #e2e8f0; font-size: 14px; font-family: inherit; outline: none; transition: border-color 0.15s, box-shadow 0.15s; color: #0f172a; }
        .login-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .login-input.error { border-color: #ef4444; }
        .login-input.error:focus { box-shadow: 0 0 0 3px rgba(239,68,68,0.1); }
        .error-msg { color: #dc2626; font-size: 12px; margin-top: 5px; display: flex; align-items: center; gap: 4px; }
        .feature-card { display: flex; align-items: flex-start; gap: 14px; padding: 16px; background: rgba(255,255,255,0.08); border-radius: 12px; border: 1px solid rgba(255,255,255,0.12); margin-bottom: 12px; transition: background 0.15s; }
        .feature-card:hover { background: rgba(255,255,255,0.13); }
        .btn-primary { width: 100%; padding: 12px; background: #1d4ed8; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background 0.15s; }
        .btn-primary:hover:not(:disabled) { background: #1e40af; }
        .btn-primary:disabled { opacity: 0.65; cursor: not-allowed; }
        .link-btn { background: none; border: none; cursor: pointer; font-family: inherit; transition: color 0.15s; }
      `}</style>

      {/* Left Panel */}
      <div style={{
        width: '45%', background: 'linear-gradient(160deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%)',
        padding: '48px 52px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        position: 'relative', overflow: 'hidden'
      }}>
        {/* Grid pattern */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.15,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: '8px', borderRadius: 10, display: 'flex', border: '1px solid rgba(255,255,255,0.2)' }}>
              <BarChart3 size={24} color="#fff" />
            </div>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>VWO</span>
          </div>

          <h1 style={{ fontSize: 36, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 20, letterSpacing: '-0.5px' }}>
            Build extraordinary digital experiences that convert better
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 1.7, marginBottom: 40 }}>
            Join thousands of businesses using VWO to analyze, optimize, and personalize their digital experiences.
          </p>

          {features.map((f, i) => (
            <div key={i} className="feature-card">
              <div style={{ color: 'rgba(255,255,255,0.9)', flexShrink: 0, marginTop: 2 }}>{f.icon}</div>
              <div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{f.title}</div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div style={{ position: 'relative', zIndex: 1, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 32 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
            {[['2M+', 'Experiments run'], ['110B+', 'Experiences optimized'], ['170+', 'Countries']].map(([num, label]) => (
              <div key={label}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{num}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div style={{
        flex: 1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 48px', overflowY: 'auto'
      }}>
        <div style={{ width: '100%', maxWidth: 420, animation: 'fadeIn 0.3s ease' }}>

          {/* Brand */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 20, background: '#fff', padding: '8px 16px', borderRadius: 100, border: '1px solid #e2e8f0' }}>
              <div style={{ background: '#1d4ed8', padding: '5px', borderRadius: 6, display: 'flex' }}>
                <BarChart3 size={16} color="#fff" />
              </div>
              <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>Wingify</span>
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 8, letterSpacing: '-0.3px' }}>
              {view === 'forgot' ? 'Reset your password' : view === 'signup' ? 'Create your account' : 'Sign in to VWO platform'}
            </h2>
            <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>
              {view === 'login' ? 'Enter your credentials to access your optimization dashboard' :
               view === 'signup' ? 'Start your free trial today, no credit card required' :
               'Enter your email and we\'ll send you a reset link'}
            </p>
          </div>

          {/* Card */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>
            <div style={{ padding: '32px 32px 24px' }}>
              <form onSubmit={handleAuth}>
                {/* Email */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                    Email address
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}>
                      <MessageSquare size={15} />
                    </div>
                    <input
                      type="email"
                      className={`login-input${loginError || signUpError ? ' error' : ''}`}
                      placeholder="you@company.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  {(loginError || signUpError) && !password && (
                    <div className="error-msg"><AlertCircle size={12} /> Email is required</div>
                  )}
                </div>

                {/* Password */}
                {view !== 'forgot' && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Password</label>
                      {view === 'login' && (
                        <button type="button" className="link-btn" onClick={() => setView('forgot')}
                          style={{ fontSize: 13, color: '#2563eb', fontWeight: 500 }}>
                          Forgot Password?
                        </button>
                      )}
                    </div>
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}>
                        <Lock size={15} />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className={`login-input${loginError || signUpError ? ' error' : ''}`}
                        style={{ paddingRight: 40 }}
                        placeholder="Enter your password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}>
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {view === 'signup' && (
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 5 }}>Minimum 6 characters</div>
                    )}
                    {(loginError || signUpError) && password && (
                      <div className="error-msg"><AlertCircle size={12} /> Password is required</div>
                    )}
                  </div>
                )}

                {/* Remember me */}
                {view === 'login' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                    <input type="checkbox" id="remember" style={{ width: 15, height: 15, accentColor: '#2563eb', cursor: 'pointer' }} />
                    <label htmlFor="remember" style={{ fontSize: 13, color: '#64748b', cursor: 'pointer' }}>Remember me</label>
                  </div>
                )}

                {/* Error Banner */}
                {(loginError || signUpError || resetError) && (
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                    padding: '12px 14px', marginBottom: 16
                  }}>
                    <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 13, color: '#b91c1c', lineHeight: 1.4 }}>
                      {lErr?.message || sErr?.message || resetError?.message || "Authentication failed. Please check your credentials."}
                    </span>
                  </div>
                )}

                {/* Success Message */}
                {isSent && (
                  <>
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
                      padding: '12px 14px', marginBottom: 10
                    }}>
                      <CheckCircle size={15} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 13, color: '#15803d', lineHeight: 1.4 }}>
                        Reset link sent! Check your inbox.
                      </span>
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
                      padding: '10px 12px', marginBottom: 16
                    }}>
                      <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1 }}>📬</span>
                      <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                        <strong>Don't see it?</strong> The password reset email may have landed in your <strong>spam or junk folder</strong>. Please check there and mark it as safe.
                      </span>
                    </div>
                  </>
                )}

                {/* Spam notice for forgot view before sending */}
                {view === 'forgot' && !isSent && (
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
                    padding: '10px 12px', marginBottom: 16
                  }}>
                    <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1 }}>⚠️</span>
                    <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                      The reset email is sent via Nhost and may sometimes arrive in your <strong>spam or junk folder</strong>. Please check there if you don't see it within a minute.
                    </span>
                  </div>
                )}

                {/* Submit */}
                <button type="submit" className="btn-primary" disabled={isLoggingIn || isSigningUp || isResetting}>
                  {(isLoggingIn || isSigningUp || isResetting) ? (
                    <>
                      <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      Processing...
                    </>
                  ) : (
                    <>
                      {view === 'forgot' ? 'Send Reset Link' : view === 'signup' ? 'Create Account' : 'Sign in'}
                      <ChevronRight size={16} />
                    </>
                  )}
                </button>

                {/* Spam notice for signup */}
                {view === 'signup' && (
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
                    padding: '10px 12px', marginTop: 12
                  }}>
                    <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1 }}>📬</span>
                    <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                      After signing up, you'll receive a <strong>verification email</strong>. It may land in your <strong>spam or junk folder</strong> — please check there and mark it as safe if needed.
                    </span>
                  </div>
                )}
              </form>
            </div>

            {/* Footer */}
            <div style={{ padding: '18px 32px 24px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
              {view === 'login' ? (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>
                    Don't have an account?{' '}
                    <button className="link-btn" onClick={() => setView('signup')}
                      style={{ color: '#2563eb', fontWeight: 600, fontSize: 13 }}>
                      Start a free trial
                    </button>
                  </p>
                  <div style={{ paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                    <button className="link-btn" onClick={handleGlobalSignOut}
                      style={{ fontSize: 11, color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
                      <Trash2 size={10} /> Terminate all sessions
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <button className="link-btn" onClick={() => setView('login')}
                    style={{ fontSize: 13, color: '#2563eb', fontWeight: 600 }}>
                    ← Back to sign in
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bottom links */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 24 }}>
            {['Privacy Policy', 'Terms of Service', 'Support'].map((link, i) => (
              <React.Fragment key={link}>
                {i > 0 && <span style={{ color: '#cbd5e1', fontSize: 12 }}>•</span>}
                <button
                  onClick={() => {}}
                  style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = '#475569'}
                  onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                >{link}</button>
              </React.Fragment>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 12, color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ShieldCheck size={12} /> Secured with enterprise-grade encryption
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// SIDEBAR
// ============================================
const Sidebar = ({ myChats, selectedChat, onSelectChat, onNewAnalysis, subLoading, subError }) => {
  return (
    <div style={{
      width: 280, background: '#fff', borderRight: '1px solid #e2e8f0',
      display: 'flex', flexDirection: 'column', flexShrink: 0
    }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9' }}>
        <button
          onClick={onNewAnalysis}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 10,
            padding: '11px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'background 0.15s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#1e40af'}
          onMouseLeave={e => e.currentTarget.style.background = '#1d4ed8'}
        >
          <Plus size={16} /> New Analysis
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, padding: '0 8px' }}>
          Recent Analyses
        </div>

        {myChats.length === 0 && !subLoading && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8' }}>
            <FileText size={28} style={{ margin: '0 auto 8px', opacity: 0.4, display: 'block' }} />
            <p style={{ fontSize: 13 }}>No analyses yet</p>
          </div>
        )}

        {myChats.map(chat => {
          const isSelected = selectedChat?.id === chat.id;
          return (
            <button key={chat.id} onClick={() => onSelectChat(chat)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
                background: isSelected ? '#eff6ff' : 'none', cursor: 'pointer', display: 'block',
                marginBottom: 2, fontFamily: 'inherit', transition: 'all 0.12s'
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'none'; }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {chat.file_name || 'Untitled Document'}
              </div>
              {chat.query && (
                <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
                  {chat.query}
                </div>
              )}
              <div style={{ fontSize: 10, color: '#94a3b8' }}>
                {new Date(chat.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </button>
          );
        })}

        {subLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', padding: 16, color: '#2563eb', fontSize: 12 }}>
            <div style={{ width: 12, height: 12, border: '2px solid #bfdbfe', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            Syncing...
          </div>
        )}
        {subError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', padding: 16, color: '#dc2626', fontSize: 12 }}>
            <AlertCircle size={12} /> Error loading
          </div>
        )}
      </div>

      <div style={{ padding: '14px 16px', borderTop: '1px solid #f1f5f9', background: '#fafafa' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0
          }}>U</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>User</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Premium Plan</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// UPLOAD WORKSPACE
// ============================================
const UploadWorkspace = ({ selectedFile, userQuery, setUserQuery, isProcessing, uploadProgress, progressMessage, handleFileChange, handleUploadAndAnalyze }) => {
  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', marginBottom: 12, letterSpacing: '-0.5px', lineHeight: 1.2 }}>
          Build extraordinary financial insights
        </h2>
        <p style={{ color: '#64748b', fontSize: 16, lineHeight: 1.6, maxWidth: 540, margin: '0 auto' }}>
          Upload documents, analyze trends, and make data-driven decisions with AI-powered intelligence
        </p>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28 }}>
        {[
          { icon: <FileSearch size={22} color="#2563eb" />, title: 'Smart Analysis', desc: 'AI-powered document insights', bg: '#eff6ff' },
          { icon: <TrendingUp size={22} color="#059669" />, title: 'Real-time Updates', desc: 'Live status tracking', bg: '#f0fdf4' },
          { icon: <Zap size={22} color="#d97706" />, title: 'Fast Processing', desc: 'Results in minutes', bg: '#fffbeb' },
        ].map(({ icon, title, desc, bg }) => (
          <div key={title} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px', transition: 'box-shadow 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div style={{ width: 44, height: 44, background: bg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              {icon}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* Upload Card */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ padding: '28px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
            <div style={{ background: '#eff6ff', padding: '8px', borderRadius: 10, display: 'flex' }}>
              <Upload size={18} color="#2563eb" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Upload Document</h3>
          </div>

          <input type="file" id="file-upload" style={{ display: 'none' }} accept=".pdf" onChange={handleFileChange} disabled={isProcessing} />

          <label htmlFor="file-upload" style={{
            display: 'block', border: `2px dashed ${isProcessing ? '#e2e8f0' : '#bfdbfe'}`,
            borderRadius: 12, padding: '36px 24px', textAlign: 'center',
            cursor: isProcessing ? 'default' : 'pointer',
            background: isProcessing ? '#f8fafc' : '#f0f7ff',
            transition: 'all 0.15s'
          }}
            onMouseEnter={e => { if (!isProcessing) { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.background = '#eff6ff'; }}}
            onMouseLeave={e => { if (!isProcessing) { e.currentTarget.style.borderColor = '#bfdbfe'; e.currentTarget.style.background = '#f0f7ff'; }}}
          >
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: isProcessing ? '#e2e8f0' : '#dbeafe',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              {isProcessing
                ? <div style={{ width: 24, height: 24, border: '3px solid #94a3b8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                : <FileText size={26} color="#2563eb" />}
            </div>
            {selectedFile ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{selectedFile.name}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>{formatFileSize(selectedFile.size)}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Drop your PDF here</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>or click to browse · Max 10MB</div>
              </>
            )}
          </label>

          {selectedFile && (
            <div style={{ marginTop: 22 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Custom Analysis Prompt
                </label>
                <textarea
                  placeholder="e.g., Analyze revenue growth, risks, and key financial insights"
                  value={userQuery}
                  onChange={e => setUserQuery(e.target.value)}
                  disabled={isProcessing}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 10,
                    border: '1.5px solid #e2e8f0', fontSize: 14, lineHeight: 1.6,
                    fontFamily: 'inherit', resize: 'none', outline: 'none',
                    background: '#f8fafc', color: '#0f172a', transition: 'border-color 0.15s'
                  }}
                  onFocus={e => e.target.style.borderColor = '#2563eb'}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  rows={3}
                />
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 5 }}>Leave empty for default analysis</div>
              </div>

              {isProcessing && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569', marginBottom: 8 }}>
                    <span style={{ fontWeight: 500 }}>{progressMessage}</span>
                    <span style={{ fontWeight: 700, color: '#2563eb' }}>{uploadProgress}%</span>
                  </div>
                  <div style={{ height: 6, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', background: 'linear-gradient(90deg, #1d4ed8, #3b82f6)',
                      borderRadius: 99, width: `${uploadProgress}%`, transition: 'width 0.5s ease'
                    }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => { const i = document.getElementById('file-upload'); if (i) i.value = null; }}
                  disabled={isProcessing}
                  style={{
                    flex: 1, padding: '12px', background: '#fff', border: '1.5px solid #e2e8f0',
                    borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#475569',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => { if (!isProcessing) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadAndAnalyze}
                  disabled={isProcessing}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '12px', background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                    border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                    opacity: isProcessing ? 0.6 : 1, transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => { if (!isProcessing) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                  onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                >
                  {isProcessing ? (
                    <>
                      <div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      Processing...
                    </>
                  ) : (
                    <><Send size={15} /> Start Analysis</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* How it works */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderRadius: 16, padding: '28px 32px', color: '#fff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <ShieldCheck size={20} color="#60a5fa" />
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>How It Works</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          {[
            { n: '1', t: 'Upload Document', d: 'Select and upload your financial PDF securely' },
            { n: '2', t: 'Ask Your Question', d: 'Add a custom prompt or use our smart defaults' },
            { n: '3', t: 'Get Insights', d: 'View detailed analysis and actionable recommendations' },
          ].map(({ n, t, d }) => (
            <div key={n} style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{t}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: '#64748b' }}>
          🔒 Your data is encrypted and secure. We comply with industry standards for data protection.
        </div>
      </div>
    </div>
  );
};

// ============================================
// CHAT WORKSPACE
// ============================================
const ChatWorkspace = ({ chat, subLoading }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ background: 'linear-gradient(135deg, #dbeafe, #ede9fe)', padding: '12px', borderRadius: 12, display: 'flex', flexShrink: 0 }}>
            <FileText size={22} color="#2563eb" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 10, lineHeight: 1.3, wordBreak: 'break-word' }}>
              {chat.file_name || 'Untitled Document'}
            </h2>
            {chat.query && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                <MessageSquare size={14} color="#2563eb" style={{ flexShrink: 0, marginTop: 3 }} />
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px' }}>
                  <p style={{ fontSize: 13, color: '#1e40af', fontStyle: 'italic', lineHeight: 1.5, wordBreak: 'break-word' }}>"{chat.query}"</p>
                </div>
              </div>
            )}
            <p style={{ fontSize: 12, color: '#94a3b8' }}>
              {new Date(chat.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <StatusBadge status={chat.status} />
        </div>
      </div>

      {/* Completed */}
      {chat.status === 'completed' && chat.analysis_result && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={16} color="#059669" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Analysis Results</span>
            </div>
            <button onClick={() => setIsExpanded(!isExpanded)}
              style={{ fontSize: 13, fontWeight: 500, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              {isExpanded ? '↑ Show less' : '↓ Read full analysis'}
            </button>
          </div>
          <div style={{ padding: '24px', maxHeight: isExpanded ? 'none' : 420, overflowY: isExpanded ? 'visible' : 'auto' }}>
            <pre style={{
              fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', fontFamily: "'Fira Code', 'Courier New', monospace",
              lineHeight: 1.7, background: '#f8fafc', padding: '20px', borderRadius: 10,
              border: '1px solid #e2e8f0', wordBreak: 'break-word', overflowWrap: 'break-word'
            }}>
              {chat.analysis_result}
            </pre>
          </div>
        </div>
      )}

      {/* Processing */}
      {(chat.status === 'processing' || chat.status === 'pending') && (
        <div style={{
          background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 14,
          padding: '56px 32px', textAlign: 'center'
        }}>
          <div style={{ width: 52, height: 52, border: '3px solid #bfdbfe', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
            {chat.status === 'processing' ? 'Analysis in Progress' : 'Queued for Processing'}
          </h3>
          <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.6 }}>
            This usually takes 2–3 minutes. Results will appear here automatically.
          </p>
        </div>
      )}

      {/* Failed */}
      {chat.status === 'failed' && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: '56px 32px', textAlign: 'center' }}>
          <AlertCircle size={48} color="#dc2626" style={{ margin: '0 auto 20px', display: 'block' }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Analysis Failed</h3>
          <p style={{ color: '#475569', fontSize: 14, marginBottom: 20 }}>Something went wrong while analyzing your document.</p>
          <button style={{ padding: '10px 22px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================
// STATUS BADGE
// ============================================
const StatusBadge = ({ status }) => {
  const configs = {
    pending: { bg: '#fffbeb', color: '#92400e', border: '#fde68a', icon: <Clock size={12} />, label: 'Pending' },
    processing: { bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe', icon: <div style={{ width: 12, height: 12, border: '2px solid #bfdbfe', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />, label: 'Processing' },
    completed: { bg: '#f0fdf4', color: '#14532d', border: '#bbf7d0', icon: <CheckCircle size={12} />, label: 'Completed' },
    failed: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca', icon: <AlertCircle size={12} />, label: 'Failed' },
  };
  const c = configs[status] || configs.pending;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: 100,
      color: c.color, fontSize: 12, fontWeight: 700, flexShrink: 0
    }}>
      {c.icon} {c.label}
    </div>
  );
};

export default App;
