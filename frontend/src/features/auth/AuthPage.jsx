import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Globe,
  GitBranch,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import ArcMark from "../../components/ArcMark.jsx";
import ThemeToggle from "../../components/ThemeToggle.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  getAuthProviders,
  register,
  verifyEmailOtp,
  resendVerificationOtp,
  requestPasswordResetOtp,
  resetPasswordWithOtp,
  startGoogleLogin,
  startGitHubLogin
} from "../../services/authService.js";

const PENDING_EMAIL_KEY = "arcdraw:pending-verification-email";
const RESET_EMAIL_KEY = "arcdraw:password-reset-email";
const RESEND_AT_KEY = "arcdraw:otp-resend-at";

const VIEW_TITLES = {
  login: { eyebrow: "Welcome back", title: "Good to see you.", subtitle: "Pick up right where your ideas left off." },
  register: { eyebrow: "Make it yours", title: "Create your space.", subtitle: "One account for your rooms, notes and team." },
  verify: { eyebrow: "One last step", title: "Check your inbox.", subtitle: "Enter the 8 digit code we sent to verify your email." },
  forgot: { eyebrow: "Account recovery", title: "Let's get you back.", subtitle: "We'll send a one-time code to your email address." },
  reset: { eyebrow: "New credentials", title: "Set a new password.", subtitle: "Choose a strong password you haven't used before." }
};

function initialView(route) {
  const view = route.split("/").filter(Boolean).at(-1);
  return Object.hasOwn(VIEW_TITLES, view) ? view : "login";
}

function friendlyError(error) {
  if (!error) return "Something went wrong. Please try again.";
  if (error.status === 0 || error.name === "TypeError") {
    return "Arcdraw API couldn't be reached. Start the backend and try again.";
  }
  if (error.code === "EMAIL_NOT_VERIFIED") {
    return "Your email isn't verified yet. Enter the OTP we sent during registration.";
  }
  if (error.code === "OTP_INVALID_OR_EXPIRED" || error.code === "OTP_INCORRECT") {
    return "That code isn't valid anymore. Check it or request a new one.";
  }
  return error.message || "Something went wrong. Please try again.";
}


export default function AuthPage({ route, navigate, onGuest, redirectTo = null, allowGuest = true }) {
  const { signIn, isAuthenticated, isLoading } = useAuth();
  const [view, setView] = useState(() => initialView(route));
  const [providers, setProviders] = useState({ google: false, github: false });
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(() => sessionStorage.getItem(PENDING_EMAIL_KEY) || sessionStorage.getItem(RESET_EMAIL_KEY) || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [developmentOtp, setDevelopmentOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendSeconds, setResendSeconds] = useState(() => {
    const deadline = Number(sessionStorage.getItem(RESEND_AT_KEY) || 0);
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  });

  const copy = VIEW_TITLES[view] || VIEW_TITLES.login;
  const hasSocialProviders = providers.google || providers.github;
  const pendingEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  useEffect(() => {
    setView(initialView(route));
    setError("");
  }, [route]);

  useEffect(() => {
    let active = true;
    getAuthProviders()
      .then((result) => {
        if (!active) return;
        setProviders(result.providers || { google: false, github: false });
      })
      .catch(() => {
        if (active) setProviders({ google: false, github: false });
      })
      .finally(() => {
        if (active) setProvidersLoaded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("authError");
    if (authError) {
      setError(authError === "google" || authError === "github"
        ? `${authError === "google" ? "Google" : "GitHub"} sign-in didn't complete. Please try again.`
        : "That sign-in provider isn't configured yet.");
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
    }
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendSeconds((seconds) => {
        const next = Math.max(0, seconds - 1);
        if (next === 0) sessionStorage.removeItem(RESEND_AT_KEY);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      const target = redirectTo || sessionStorage.getItem("arcdraw:post-auth-route") || "/workspace";
      sessionStorage.removeItem("arcdraw:post-auth-route");
      navigate(target);
    }
  }, [isAuthenticated, isLoading, navigate, redirectTo]);

  const go = (nextView) => {
    setError("");
    setNotice("");
    navigate(`/auth/${nextView}`);
  };

  const startResendCooldown = () => {
    const deadline = Date.now() + 60_000;
    sessionStorage.setItem(RESEND_AT_KEY, String(deadline));
    setResendSeconds(60);
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (password !== confirmPassword) {
      setError("Your passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const result = await register({ name: name.trim(), email: pendingEmail, password });
      sessionStorage.setItem(PENDING_EMAIL_KEY, pendingEmail);
      setDevelopmentOtp(result.developmentOtp || "");
      setOtp(result.developmentOtp || "");
      startResendCooldown();
      go("verify");
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await signIn({ email: pendingEmail, password });
    } catch (cause) {
      if (cause.code === "EMAIL_NOT_VERIFIED") {
        sessionStorage.setItem(PENDING_EMAIL_KEY, pendingEmail);
        go("verify");
      } else {
        setError(friendlyError(cause));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await verifyEmailOtp({ email: pendingEmail, otp });
      sessionStorage.removeItem(PENDING_EMAIL_KEY);
      sessionStorage.removeItem(RESEND_AT_KEY);
      setDevelopmentOtp("");
      setPassword("");
      setNotice("Email verified. You can now sign in with your password.");
      go("login");
      setNotice("Email verified. You can now sign in with your password.");
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await resendVerificationOtp(pendingEmail);
      setDevelopmentOtp(result.developmentOtp || "");
      setOtp(result.developmentOtp || "");
      startResendCooldown();
      setNotice(result.developmentOtp
        ? "A fresh code is ready below."
        : "If the account is eligible, a fresh code has been sent. Check your inbox.");
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await requestPasswordResetOtp(pendingEmail);
      sessionStorage.setItem(RESET_EMAIL_KEY, pendingEmail);
      setDevelopmentOtp(result.developmentOtp || "");
      setOtp(result.developmentOtp || "");
      go("reset");
      setNotice("If that account exists, a reset code has been sent.");
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (password !== confirmPassword) {
      setError("Your passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await resetPasswordWithOtp({ email: pendingEmail, otp, password });
      sessionStorage.removeItem(RESET_EMAIL_KEY);
      setPassword("");
      setConfirmPassword("");
      setOtp("");
      setDevelopmentOtp("");
      go("login");
      setNotice("Password updated. Sign in with your new password.");
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  };

  const renderPassword = (label = "Password", autoComplete = "current-password") => (
    <label className="auth-field">
      <span>{label}</span>
      <div className="auth-input-wrap">
        <LockKeyhole size={16} aria-hidden="true" />
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={label === "Password" ? "Enter your password" : "At least 8 characters"}
          autoComplete={autoComplete}
          minLength={8}
          maxLength={72}
          required
        />
        <button className="auth-visibility" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  );

  return (
    <main className="auth-shell">
      <header className="auth-topbar">
        <div className="auth-topbar-inner">
          <a className="brand-lockup" href="#/" aria-label="Arcdraw home"><ArcMark /><span>arcdraw</span></a>
          <div className="auth-topbar-actions">
            <button className="auth-back-link" type="button" onClick={() => navigate("/")}><ArrowLeft size={14} /> Back to home</button>
            <ThemeToggle compact />
          </div>
        </div>
      </header>

      <div className="auth-body">
        <section className="auth-aside">
          <span className="auth-badge"><span className="auth-badge-dot" /> Local first whiteboard</span>
          <h1>Ideas don't wait for <em>internet.</em></h1>
          <p className="auth-aside-copy">Sketch, map and connect your thinking. Start on this device, then bring your team in whenever you are ready.</p>
          <div className="auth-points">
            <div className="auth-point"><span><ShieldCheck size={16} /></span><div><strong>Private by default</strong><small>Guest rooms stay on this device.</small></div></div>
            <div className="auth-point"><span><Sparkles size={16} /></span><div><strong>Live or commit mode</strong><small>Owners choose how the team works.</small></div></div>
            <div className="auth-point"><span><LockKeyhole size={16} /></span><div><strong>Cloud when you need it</strong><small>An account unlocks shared rooms.</small></div></div>
          </div>
        </section>

        <section className="auth-form-panel">
          <div className="auth-card-wrap">
            {(view === "login" || view === "register") && (
              <div className="auth-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={view === "login"} className={view === "login" ? "auth-tab auth-tab-active" : "auth-tab"} onClick={() => go("login")}>Sign in</button>
                <button type="button" role="tab" aria-selected={view === "register"} className={view === "register" ? "auth-tab auth-tab-active" : "auth-tab"} onClick={() => go("register")}>Create account</button>
              </div>
            )}
            <div className="auth-card-heading">
              <p className="auth-eyebrow">{copy.eyebrow}</p>
              <h2>{copy.title}</h2>
              <p className="auth-subtitle">{copy.subtitle}</p>
            </div>

          {error && <div className="auth-alert auth-alert-error" role="alert">{error}</div>}
          {notice && <div className="auth-alert auth-alert-success" role="status"><Check size={15} />{notice}</div>}

          {view === "login" && (
            <>
              {hasSocialProviders && <div className="auth-social-grid">
                {providers.google && <button className="auth-social-button" type="button" onClick={() => { sessionStorage.setItem("arcdraw:post-auth-route", redirectTo || sessionStorage.getItem("arcdraw:post-auth-route") || "/workspace"); startGoogleLogin(); }}><Globe size={17} /> Continue with Google</button>}
                {providers.github && <button className="auth-social-button" type="button" onClick={() => { sessionStorage.setItem("arcdraw:post-auth-route", redirectTo || sessionStorage.getItem("arcdraw:post-auth-route") || "/workspace"); startGitHubLogin(); }}><GitBranch size={17} /> Continue with GitHub</button>}
              </div>}
              {hasSocialProviders && <div className="auth-divider"><span />Or continue with email<span /></div>}
              <form className="auth-form" onSubmit={handleLogin}>
                <label className="auth-field"><span>Email address</span><div className="auth-input-wrap"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></div></label>
                {renderPassword()}
                <div className="auth-inline-row"><span /> <button type="button" className="auth-inline-link" onClick={() => go("forgot")}>Forgot password?</button></div>
                <button className="auth-submit-button" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<ArrowRight size={16} /></button>
              </form>
              <p className="auth-switch-copy">New to Arcdraw? <button type="button" onClick={() => go("register")}>Create an account</button></p>
            </>
          )}

          {view === "register" && (
            <>
              {hasSocialProviders && <div className="auth-social-grid">
                {providers.google && <button className="auth-social-button" type="button" onClick={() => { sessionStorage.setItem("arcdraw:post-auth-route", redirectTo || sessionStorage.getItem("arcdraw:post-auth-route") || "/workspace"); startGoogleLogin(); }}><Globe size={17} /> Sign up with Google</button>}
                {providers.github && <button className="auth-social-button" type="button" onClick={() => { sessionStorage.setItem("arcdraw:post-auth-route", redirectTo || sessionStorage.getItem("arcdraw:post-auth-route") || "/workspace"); startGitHubLogin(); }}><GitBranch size={17} /> Sign up with GitHub</button>}
              </div>}
              {hasSocialProviders && <div className="auth-divider"><span />Or create with email<span /></div>}
              <form className="auth-form" onSubmit={handleRegister}>
                <label className="auth-field"><span>Your name</span><div className="auth-input-wrap"><Sparkles size={16} /><input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="What should we call you?" autoComplete="name" minLength={2} maxLength={60} required /></div></label>
                <label className="auth-field"><span>Email address</span><div className="auth-input-wrap"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></div></label>
                {renderPassword("Password", "new-password")}
                <label className="auth-field"><span>Confirm password</span><div className="auth-input-wrap"><LockKeyhole size={16} /><input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it once more" autoComplete="new-password" minLength={8} maxLength={72} required /></div></label>
                <button className="auth-submit-button" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}<ArrowRight size={16} /></button>
              </form>
              <p className="auth-legal-copy">By creating an account, you agree to use Arcdraw responsibly. Your local rooms remain on this device until cloud sync is enabled.</p>
              <p className="auth-switch-copy">Already have an account? <button type="button" onClick={() => go("login")}>Sign in</button></p>
            </>
          )}

          {view === "verify" && (
            <form className="auth-form" onSubmit={handleVerify}>
              <label className="auth-field"><span>Email address</span><div className="auth-input-wrap"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></div></label>
              <label className="auth-field"><span>8 digit verification code</span><div className="auth-input-wrap auth-otp-wrap"><KeyRound size={16} /><input className="auth-otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="00000000" required /></div></label>
              {developmentOtp && <div className="auth-dev-otp"><span>Local development OTP</span><strong>{developmentOtp}</strong><small>Visible only because the backend is running in development mode without email delivery.</small></div>}
              <button className="auth-submit-button" type="submit" disabled={busy || otp.length !== 8}>{busy ? "Verifying…" : "Verify email"}<ArrowRight size={16} /></button>
              <div className="auth-resend-row"><span>Didn't receive a code?</span><button type="button" disabled={busy || resendSeconds > 0} onClick={handleResend}>{resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend code"}</button></div>
            </form>
          )}

          {view === "forgot" && (
            <form className="auth-form" onSubmit={handleForgot}>
              <label className="auth-field"><span>Email address</span><div className="auth-input-wrap"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></div></label>
              <button className="auth-submit-button" type="submit" disabled={busy}>{busy ? "Sending code…" : "Send reset code"}<ArrowRight size={16} /></button>
              <button className="auth-back-secondary" type="button" onClick={() => go("login")}><ArrowLeft size={14} /> Back to sign in</button>
            </form>
          )}

          {view === "reset" && (
            <form className="auth-form" onSubmit={handleReset}>
              <label className="auth-field"><span>Email address</span><div className="auth-input-wrap"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></div></label>
              <label className="auth-field"><span>8 digit reset code</span><div className="auth-input-wrap auth-otp-wrap"><KeyRound size={16} /><input className="auth-otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="00000000" required /></div></label>
              {developmentOtp && <div className="auth-dev-otp"><span>Local development OTP</span><strong>{developmentOtp}</strong><small>Development only code returned by the API.</small></div>}
              {renderPassword("New password", "new-password")}
              <label className="auth-field"><span>Confirm new password</span><div className="auth-input-wrap"><LockKeyhole size={16} /><input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it once more" minLength={8} maxLength={72} required /></div></label>
              <button className="auth-submit-button" type="submit" disabled={busy || otp.length !== 8}>{busy ? "Updating password…" : "Update password"}<ArrowRight size={16} /></button>
            </form>
          )}

          {!providersLoaded && <p className="auth-provider-loading">Checking sign in options…</p>}
          {providersLoaded && !hasSocialProviders && (view === "login" || view === "register") && <p className="auth-provider-note">Google and GitHub sign in appear here once their credentials are configured on the Arcdraw API.</p>}

          <div className="auth-bottom-divider"><span />Your work can start locally<span /></div>
          {allowGuest && <button className="auth-guest-button" type="button" onClick={onGuest}>Continue as guest <ArrowRight size={15} /></button>}
          <p className="auth-local-footnote"><LockKeyhole size={12} /> {allowGuest ? "No account needed to create and keep rooms on this device." : "Sign in is required to access this shared room."}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
