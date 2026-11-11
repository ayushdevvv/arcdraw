import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, MailCheck, User } from "lucide-react";
import ArcMark from "../../components/ArcMark.jsx";
import ThemeToggle from "../../components/ThemeToggle.jsx";
import OtpInput from "../../components/OtpInput.jsx";
import { GitHubIcon, GoogleIcon } from "../../components/BrandIcons.jsx";
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
const POST_AUTH_KEY = "arcdraw:post-auth-route";

const VIEW_COPY = {
  login: { title: "Welcome back", subtitle: "Sign in to continue to Arcdraw." },
  register: { title: "Create your account", subtitle: "Start free in under a minute." },
  verify: { title: "Verify your email", subtitle: "Enter the 8 digit code we sent you." },
  forgot: { title: "Reset your password", subtitle: "We will email you a code." },
  reset: { title: "Choose a new password", subtitle: "Enter the code and your new password." }
};

function initialView(route) {
  const view = route.split("/").filter(Boolean).at(-1);
  return Object.hasOwn(VIEW_COPY, view) ? view : "login";
}

function friendlyError(error) {
  if (!error) return "Something went wrong. Please try again.";
  if (error.status === 0 || error.name === "TypeError") {
    return "Arcdraw API couldn't be reached. Start the backend and try again.";
  }
  if (error.code === "EMAIL_NOT_VERIFIED") return "Your email isn't verified yet. Enter the code we sent you.";
  if (error.code === "OTP_INVALID_OR_EXPIRED" || error.code === "OTP_INCORRECT") {
    return "That code isn't valid anymore. Check it or request a new one.";
  }
  return error.message || "Something went wrong. Please try again.";
}

export default function AuthPage({ route, navigate, onGuest, redirectTo = null, allowGuest = true }) {
  const { signIn, completeSignIn, isAuthenticated, isLoading } = useAuth();
  const [view, setView] = useState(function () { return initialView(route); });
  const [providers, setProviders] = useState({ google: false, github: false });
  const [name, setName] = useState("");
  const [email, setEmail] = useState(function () {
    return sessionStorage.getItem(PENDING_EMAIL_KEY) || sessionStorage.getItem(RESET_EMAIL_KEY) || "";
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [developmentOtp, setDevelopmentOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendSeconds, setResendSeconds] = useState(function () {
    const deadline = Number(sessionStorage.getItem(RESEND_AT_KEY) || 0);
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  });

  const copy = VIEW_COPY[view] || VIEW_COPY.login;
  const pendingEmail = useMemo(function () { return email.trim().toLowerCase(); }, [email]);
  const showTabs = view === "login" || view === "register";
  const showSocial = view === "login" || view === "register";

  useEffect(function () {
    setView(initialView(route));
    setError("");
  }, [route]);

  useEffect(function () {
    let active = true;
    getAuthProviders()
      .then(function (result) { if (active) setProviders(result.providers || { google: false, github: false }); })
      .catch(function () { if (active) setProviders({ google: false, github: false }); });
    return function () { active = false; };
  }, []);

  useEffect(function () {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("authError");
    if (authError) {
      setError(authError === "google" || authError === "github"
        ? (authError === "google" ? "Google" : "GitHub") + " sign in didn't complete. Please try again."
        : "That sign in provider isn't configured yet.");
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    }
  }, []);

  useEffect(function () {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setInterval(function () {
      setResendSeconds(function (seconds) {
        const next = Math.max(0, seconds - 1);
        if (next === 0) sessionStorage.removeItem(RESEND_AT_KEY);
        return next;
      });
    }, 1000);
    return function () { window.clearInterval(timer); };
  }, [resendSeconds]);

  useEffect(function () {
    if (isAuthenticated && !isLoading) {
      const target = redirectTo || sessionStorage.getItem(POST_AUTH_KEY) || "/workspace";
      sessionStorage.removeItem(POST_AUTH_KEY);
      navigate(target);
    }
  }, [isAuthenticated, isLoading, navigate, redirectTo]);

  function go(nextView) {
    setError("");
    setNotice("");
    navigate("/auth/" + nextView);
  }

  function startResendCooldown() {
    sessionStorage.setItem(RESEND_AT_KEY, String(Date.now() + 60000));
    setResendSeconds(60);
  }

  function rememberReturnRoute() {
    sessionStorage.setItem(POST_AUTH_KEY, redirectTo || sessionStorage.getItem(POST_AUTH_KEY) || "/workspace");
  }

  function handleGoogle() {
    if (!providers.google) {
      setError("Google sign in isn't set up on this server yet.");
      return;
    }
    rememberReturnRoute();
    startGoogleLogin();
  }

  function handleGitHub() {
    if (!providers.github) {
      setError("GitHub sign in isn't set up on this server yet.");
      return;
    }
    rememberReturnRoute();
    startGitHubLogin();
  }

  async function handleRegister(event) {
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
  }

  async function handleLogin(event) {
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
  }

  async function handleVerify(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await verifyEmailOtp({ email: pendingEmail, otp });
      sessionStorage.removeItem(PENDING_EMAIL_KEY);
      sessionStorage.removeItem(RESEND_AT_KEY);
      setDevelopmentOtp("");
      setPassword("");
      setOtp("");
      if (result.signedIn && result.user) {
        // Verified and signed in by the server: the redirect effect above sends them to the dashboard.
        completeSignIn(result.user);
        return;
      }
      go("login");
      setNotice("Email verified. You can sign in now.");
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await resendVerificationOtp(pendingEmail);
      setDevelopmentOtp(result.developmentOtp || "");
      setOtp(result.developmentOtp || "");
      startResendCooldown();
      setNotice(result.developmentOtp ? "A fresh code is ready." : "A fresh code is on its way. Check your inbox.");
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(event) {
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
      setNotice("If that account exists, a code is on its way.");
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(event) {
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
  }

  function onName(event) { setName(event.target.value); }
  function onEmail(event) { setEmail(event.target.value); }
  function onPassword(event) { setPassword(event.target.value); }
  function onConfirm(event) { setConfirmPassword(event.target.value); }
  function toggleVisibility() { setShowPassword(function (value) { return !value; }); }
  function goLogin() { go("login"); }
  function goRegister() { go("register"); }
  function goForgot() { go("forgot"); }
  function goHome() { navigate("/"); }

  function renderEmailField() {
    return (
      <label className="ax-field">
        <span>Email</span>
        <div className="ax-input">
          <Mail size={16} aria-hidden="true" />
          <input type="email" value={email} onChange={onEmail} placeholder="you@example.com" autoComplete="email" required />
        </div>
      </label>
    );
  }

  function renderPasswordField(label, autoComplete, value, onValue, placeholder, withToggle) {
    return (
      <label className="ax-field">
        <span>{label}</span>
        <div className="ax-input">
          <LockKeyhole size={16} aria-hidden="true" />
          <input type={showPassword ? "text" : "password"} value={value} onChange={onValue} placeholder={placeholder} autoComplete={autoComplete} minLength={8} maxLength={72} required />
          {withToggle && (
            <button className="ax-eye" type="button" onClick={toggleVisibility} aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
        </div>
      </label>
    );
  }

  function renderSubmit(label, busyLabel, disabled) {
    return (
      <button className="ax-submit" type="submit" disabled={busy || disabled}>
        {busy ? <LoaderCircle size={16} className="ax-spin" /> : null}
        <span>{busy ? busyLabel : label}</span>
        {busy ? null : <ArrowRight size={16} />}
      </button>
    );
  }

  function renderDevOtp() {
    if (!developmentOtp) return null;
    return <div className="ax-devotp"><span>Development code</span><strong>{developmentOtp}</strong></div>;
  }

  return (
    <main className="ax-shell">
      <div className="ax-glow" aria-hidden="true" />
      <header className="ax-top">
        <a className="brand-lockup" href="#/" aria-label="Arcdraw home"><ArcMark /><span>arcdraw</span></a>
        <div className="ax-top-right">
          <button className="ax-home" type="button" onClick={goHome}><ArrowLeft size={14} /> Home</button>
          <ThemeToggle compact />
        </div>
      </header>

      <div className="ax-center">
        <section className="ax-card" key={view} aria-live="polite">
          <div className="ax-head">
            {view === "verify" ? <span className="ax-badge"><MailCheck size={22} /></span> : <span className="ax-badge"><ArcMark /></span>}
            <h1>{copy.title}</h1>
            <p>{copy.subtitle}</p>
          </div>

          {showTabs && (
            <div className="ax-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={view === "login"} className={view === "login" ? "is-active" : ""} onClick={goLogin}>Sign in</button>
              <button type="button" role="tab" aria-selected={view === "register"} className={view === "register" ? "is-active" : ""} onClick={goRegister}>Sign up</button>
            </div>
          )}

          {error && <div className="ax-alert is-error" role="alert">{error}</div>}
          {notice && <div className="ax-alert is-ok" role="status"><Check size={15} />{notice}</div>}

          {showSocial && (
            <>
              <div className="ax-social">
                <button type="button" onClick={handleGoogle}><GoogleIcon /> Google</button>
                <button type="button" onClick={handleGitHub}><GitHubIcon /> GitHub</button>
              </div>
              <div className="ax-or"><span />or with email<span /></div>
            </>
          )}

          {view === "login" && (
            <form className="ax-form" onSubmit={handleLogin}>
              {renderEmailField()}
              {renderPasswordField("Password", "current-password", password, onPassword, "Your password", true)}
              <div className="ax-row"><button type="button" className="ax-link" onClick={goForgot}>Forgot password?</button></div>
              {renderSubmit("Sign in", "Signing in", false)}
            </form>
          )}

          {view === "register" && (
            <form className="ax-form" onSubmit={handleRegister}>
              <label className="ax-field">
                <span>Name</span>
                <div className="ax-input">
                  <User size={16} aria-hidden="true" />
                  <input type="text" value={name} onChange={onName} placeholder="Your name" autoComplete="name" minLength={2} maxLength={60} required />
                </div>
              </label>
              {renderEmailField()}
              {renderPasswordField("Password", "new-password", password, onPassword, "At least 8 characters", true)}
              {renderPasswordField("Confirm password", "new-password", confirmPassword, onConfirm, "Repeat password", false)}
              {renderSubmit("Create account", "Creating", false)}
            </form>
          )}

          {view === "verify" && (
            <form className="ax-form" onSubmit={handleVerify}>
              <div className="ax-sent">
                <span>{pendingEmail || "your email"}</span>
                <button type="button" className="ax-link" onClick={goRegister}>Change</button>
              </div>
              <OtpInput value={otp} onChange={setOtp} disabled={busy} />
              {renderDevOtp()}
              {renderSubmit("Verify email", "Verifying", otp.length !== 8)}
              <div className="ax-resend">
                <span>No code?</span>
                <button type="button" className="ax-link" disabled={busy || resendSeconds > 0} onClick={handleResend}>{resendSeconds > 0 ? "Resend in " + resendSeconds + "s" : "Resend code"}</button>
              </div>
            </form>
          )}

          {view === "forgot" && (
            <form className="ax-form" onSubmit={handleForgot}>
              {renderEmailField()}
              {renderSubmit("Send code", "Sending", false)}
              <button className="ax-ghost" type="button" onClick={goLogin}><ArrowLeft size={14} /> Back to sign in</button>
            </form>
          )}

          {view === "reset" && (
            <form className="ax-form" onSubmit={handleReset}>
              {renderEmailField()}
              <OtpInput value={otp} onChange={setOtp} disabled={busy} autoFocus={false} />
              {renderDevOtp()}
              {renderPasswordField("New password", "new-password", password, onPassword, "At least 8 characters", true)}
              {renderPasswordField("Confirm password", "new-password", confirmPassword, onConfirm, "Repeat password", false)}
              {renderSubmit("Update password", "Updating", otp.length !== 8)}
            </form>
          )}

          {allowGuest && showTabs && (
            <button className="ax-guest" type="button" onClick={onGuest}>Continue as guest <ArrowRight size={14} /></button>
          )}
          {!allowGuest && <p className="ax-foot">Sign in is required to open this shared room.</p>}
        </section>
      </div>
    </main>
  );
}
