import { useEffect, useRef } from "react";
import Home from "./pages/Home.jsx";
import Workspace from "./pages/Workspace.jsx";
import RoomEditor from "./features/rooms/RoomEditor.jsx";
import AccountGateModal from "./components/AccountGateModal.jsx";
import AuthPage from "./features/auth/AuthPage.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { useGuestSession } from "./hooks/useGuestSession.js";
import { useAccountGate } from "./hooks/useAccountGate.js";
import { useHashRoute } from "./app/useHashRoute.js";
import { requireAccountForAction } from "./guest/accountGate.js";
import { toast } from "./components/toast/toastStore.js";
import { readOAuthPending, clearOAuthPending } from "./services/authService.js";

const POST_AUTH_ROUTE_KEY = "arcdraw:post-auth-route";

export default function App() {
  const { route, navigate } = useHashRoute();
  const { session, start } = useGuestSession();
  const { user, isAuthenticated, isLoading, signOut, refreshUser } = useAuth();
  const oauthHandled = useRef(false);
  const { pendingAction, dismiss } = useAccountGate();

  const shareMatch = route.match(/^\/share\/([^/]+)$/);
  const roomMatch = route.match(/^\/room\/([^/]+)$/);
  const legacyBoardMatch = route.match(/^\/board\/([^/]+)$/);
  const boardMatch = roomMatch || legacyBoardMatch;

  useEffect(() => {
    if ((route === "/workspace" || boardMatch || shareMatch) && !session) start();
  }, [route, session, start]);

  // OAuth providers return to the application root. Restore the route that prompted sign-in.
  // This also catches the case where the redirect never reached the app at all
  // (no query string, still signed out) and tells the user instead of silently
  // showing the home page.
  useEffect(() => {
    if (isLoading || oauthHandled.current) return;

    const params = new URLSearchParams(window.location.search);
    const failedProvider = params.get("authError");
    const returnedProvider = params.get("signedIn");
    const pending = readOAuthPending();
    if (!failedProvider && !returnedProvider && !pending) return;

    oauthHandled.current = true;
    clearOAuthPending();

    if (failedProvider) {
      navigate("/auth/login");
      return;
    }

    function finishSignIn(provider) {
      toast.success(provider === "google" ? "Signed in with Google." : provider === "github" ? "Signed in with GitHub." : "Signed in successfully.");
      const target = sessionStorage.getItem(POST_AUTH_ROUTE_KEY) || "/workspace";
      sessionStorage.removeItem(POST_AUTH_ROUTE_KEY);
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
      navigate(target);
    }

    function failSignIn() {
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
      toast.error("Sign in did not complete. Please try again.");
      navigate("/auth/login");
    }

    const provider = returnedProvider || (pending && pending.provider) || "";

    if (isAuthenticated) {
      if (returnedProvider) finishSignIn(provider);
      return;
    }

    if (!returnedProvider) {
      // We left for a provider but came back without the sign in marker.
      failSignIn();
      return;
    }

    // The provider said yes but the first account check came back signed out.
    // Ask again a few times before giving up, in case the server was waking up.
    async function retryAccountCheck() {
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        await new Promise(function (resolve) { window.setTimeout(resolve, attempt * 700); });
        const nextUser = await refreshUser();
        if (nextUser) {
          finishSignIn(provider);
          return;
        }
      }
      failSignIn();
    }
    retryAccountCheck();
  }, [isLoading, isAuthenticated, navigate, refreshUser]);

  const openWorkspace = () => {
    start();
    navigate("/workspace");
  };

  const openBoard = (id) => navigate(`/room/${encodeURIComponent(id)}`);
  const backToWorkspace = () => navigate("/workspace");
  const openAuth = (returnTo = "/workspace") => {
    sessionStorage.setItem(POST_AUTH_ROUTE_KEY, returnTo);
    navigate("/auth/login");
  };

  let content;
  if (shareMatch) {
    content = session ? (
      <RoomEditor guestId={session.guestId} shareToken={decodeURIComponent(shareMatch[1])} onBack={backToWorkspace} onAccountRequired={(action) => requireAccountForAction(isAuthenticated, action)} onSignIn={() => openAuth(route)} user={user} isAuthenticated={isAuthenticated} />
    ) : <div className="editor-loading">Opening shared room…</div>;
  } else if (route.startsWith("/auth/")) {
    content = <AuthPage route={route} navigate={navigate} onGuest={openWorkspace} redirectTo={sessionStorage.getItem(POST_AUTH_ROUTE_KEY) || "/workspace"} />;
  } else if (boardMatch) {
    content = session ? (
      <RoomEditor
        guestId={session.guestId}
        boardId={decodeURIComponent(boardMatch[1])}
        onBack={backToWorkspace}
        onAccountRequired={(action) => { if (!isAuthenticated) openAuth(route); }}
        onSignIn={() => openAuth(route)}
        user={user}
        isAuthenticated={isAuthenticated}
      />
    ) : <div className="editor-loading">Opening your room…</div>;
  } else if (route === "/workspace") {
    content = session ? (
      <Workspace
        guestId={session.guestId}
        onOpenBoard={openBoard}
        onBackHome={() => navigate("/")}
        onSignIn={() => openAuth("/workspace")}
        onSignOut={signOut}
        user={user}
      />
    ) : <div className="editor-loading">Opening your workspace…</div>;
  } else {
    content = <Home onContinue={openWorkspace} onSignIn={() => openAuth("/workspace")} hasGuestSession={Boolean(session)} user={user} />;
  }

  return (
    <>
      {content}
      <AccountGateModal action={pendingAction} onClose={dismiss} onSignIn={() => { dismiss(); openAuth(route); }} isAuthenticated={isAuthenticated} />
    </>
  );
}
