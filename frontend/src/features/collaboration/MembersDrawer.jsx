import { useCallback, useEffect, useState } from "react";
import { Check, Crown, LoaderCircle, RefreshCw, UserRound, Users, X } from "lucide-react";
import Drawer from "../../components/Drawer.jsx";
import { getBoardMembers, reviewWorkspaceJoinRequest } from "../../services/boardCloudService.js";

function initials(name = "Member") {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

export default function MembersDrawer({ boardId, participants = [], onClose }) {
  const [roster, setRoster] = useState({ owner: null, members: [], requests: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    setError("");
    try {
      setRoster(await getBoardMembers(boardId));
    } catch (cause) {
      setError(cause.message || "Couldn't load workspace members.");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const decide = async (requestId, action) => {
    setBusyId(requestId);
    setError("");
    try {
      await reviewWorkspaceJoinRequest(boardId, requestId, action);
      await refresh();
    } catch (cause) {
      setError(cause.message || "Couldn't update this join request.");
    } finally {
      setBusyId("");
    }
  };

  const onlineIds = new Set(participants.map((person) => String(person.userId)));
  const people = [roster.owner, ...roster.members].filter(Boolean);

  return (
    <Drawer
      title="People"
      subtitle={`${people.length} in this workspace${roster.requests.length ? ` · ${roster.requests.length} waiting` : ""}`}
      icon={<Users size={20} strokeWidth={1.8} />}
      onClose={onClose}
    >
      <div className="members-drawer-content">
        <div className="members-section-heading">
          <span>Workspace members</span>
          <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh members">
            {loading ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>

        {loading && !people.length ? (
          <div className="members-empty"><LoaderCircle size={18} className="spin" /> Loading people…</div>
        ) : people.length ? (
          <div className="members-list">
            {people.map((person) => {
              const isOwner = person.role === "owner";
              const online = onlineIds.has(String(person.id));
              return (
                <div className="members-person" key={person.id}>
                  <span className={`members-avatar ${isOwner ? "is-owner" : ""}`}>
                    {person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : initials(person.name)}
                  </span>
                  <span className="members-person-copy">
                    <strong>{person.name || "ArcDraw member"}</strong>
                    <small>{person.email || (isOwner ? "Workspace owner" : "Member")}</small>
                  </span>
                  <span className={`members-role ${online ? "is-online" : ""}`}>
                    {isOwner ? <><Crown size={12} /> Owner</> : online ? <><i /> Online</> : "Editor"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="members-empty"><UserRound size={18} /> No members yet.</div>
        )}

        <div className="members-requests-section">
          <div className="members-section-heading">
            <span>Join requests</span>
            {roster.requests.length > 0 && <b>{roster.requests.length}</b>}
          </div>
          {roster.requests.length ? (
            <div className="members-list">
              {roster.requests.map((request) => (
                <div className="members-request" key={request.id}>
                  <span className="members-avatar">{initials(request.user?.name)}</span>
                  <span className="members-person-copy">
                    <strong>{request.user?.name || "New collaborator"}</strong>
                    <small>{request.user?.email || "Requested to join"}</small>
                    <small>Requested {new Date(request.requestedAt).toLocaleDateString()}</small>
                  </span>
                  <span className="members-request-actions">
                    <button type="button" className="members-approve" disabled={Boolean(busyId)} onClick={() => void decide(request.id, "approve")} aria-label="Approve join request">
                      {busyId === request.id ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}
                    </button>
                    <button type="button" className="members-reject" disabled={Boolean(busyId)} onClick={() => void decide(request.id, "reject")} aria-label="Decline join request">
                      {busyId === request.id ? <LoaderCircle size={14} className="spin" /> : <X size={14} />}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="members-empty members-empty-compact">No pending requests.</div>
          )}
        </div>
        {error && <p className="drawer-error" role="alert">{error}</p>}
      </div>
    </Drawer>
  );
}
