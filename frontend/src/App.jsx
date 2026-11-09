import { useEffect } from "react";
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

const POST_AUTH_ROUTE_KEY = "arcdraw:post-auth-route";

export default function App() {
  const { route, navigate } = useHashRoute();
  const { session, start } = useGuestSession();
  const { user, isAuthenticated, signOut } = useAuth();
  const { pendingAction, dismiss } = useAccountGate();

  const shareMatch = route.match(/^\/share\/([^/]+)$/);
  const roomMatch = route.match(/^\/room\/([^/]+)$/);
  const legacyBoardMatch = route.match(/^\/board\/([^/]+)$/);
  const boardMatch = roomMatch || legacyBoardMatch;

  useEffect(() => {
    if ((route === "/workspace" || boardMatch || shareMatch) && !session) start();
  }, [route, session, start]);

  // OAuth providers return to the application root. Restore the route that prompted sign-in.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("authError")) {
      navigate("/auth/login");
      return;
    }
    if (isAuthenticated && params.has("signedIn")) {
      const target = sessionStorage.getItem(POST_AUTH_ROUTE_KEY) || "/workspace";
      sessionStorage.removeItem(POST_AUTH_ROUTE_KEY);
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
      navigate(target);
    }
  }, [isAuthenticated, navigate]);

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
  if (shareMatch && !isAuthenticated) {
    sessionStorage.setItem(POST_AUTH_ROUTE_KEY, route);
    content = <AuthPage route="/auth/login" navigate={navigate} redirectTo={route} allowGuest={false} onGuest={openWorkspace} />;
  } else if (shareMatch) {
    content = session ? (
      <RoomEditor guestId={session.guestId} shareToken={decodeURIComponent(shareMatch[1])} onBack={backToWorkspace} onAccountRequired={(action) => requireAccountForAction(isAuthenticated, action)} user={user} isAuthenticated={isAuthenticated} />
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
