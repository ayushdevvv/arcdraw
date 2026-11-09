import { useEffect, useState } from "react";
import { GitCommit, History, LoaderCircle, RotateCcw } from "lucide-react";
import Drawer from "../../components/Drawer.jsx";
import { getCommitHistory } from "../../services/boardCloudService.js";

function dateLabel(value) {
  const date = new Date(value);
  return date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function HistoryDrawer({ boardId, shareToken, canRestore, refreshKey, onClose, onRestore }) {
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState("");
  const [confirmId, setConfirmId] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    getCommitHistory(boardId, shareToken)
      .then((items) => active && setCommits(items))
      .catch((cause) => active && setError(cause.message || "Couldn't load version history."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [boardId, shareToken, refreshKey]);

  const restore = async (commit) => {
    setConfirmId("");
    setRestoring(commit.id);
    setError("");
    try {
      await onRestore(commit);
      const latest = await getCommitHistory(boardId, shareToken);
      setCommits(latest);
    } catch (cause) {
      setError(cause.message || "Could not restore this version.");
    } finally {
      setRestoring("");
    }
  };

  return (
    <Drawer title="History" subtitle="Saved versions of this room" icon={<History size={20} strokeWidth={1.8} />} onClose={onClose}>
      {loading ? <div className="history-empty"><LoaderCircle size={18} className="spin" /> Loading…</div> : error ? <p className="drawer-error">{error}</p> : commits.length ? (
        <div className="history-list">
          {commits.map((commit, index) => (
            <article className="history-item" key={commit.id}>
              <div className="history-rail"><span className={index === 0 ? "latest" : ""}><GitCommit size={13} /></span>{index !== commits.length - 1 && <i />}</div>
              <div className="history-item-content">
                <div className="history-item-top"><strong>{commit.message}</strong>{commit.kind === "restore" && <em>Restore</em>}{commit.kind === "merge" && <em>Merged</em>}</div>
                <div className="history-meta"><code>{commit.shortHash}</code><span>{dateLabel(commit.createdAt)}</span><span>{commit.author?.name || "Member"}</span>{commit.kind === "merge" && commit.mergedBy && <span>Merged by {commit.mergedBy.name}</span>}</div>
                {canRestore && (confirmId === commit.id ? (
                  <span className="inline-confirm"><span className="history-confirm-text">Restore this version?</span><button type="button" onClick={() => setConfirmId("")}>Cancel</button><button type="button" className="is-danger" onClick={() => void restore(commit)}>Restore</button></span>
                ) : (
                  <button className="history-restore-button" type="button" disabled={Boolean(restoring)} onClick={() => setConfirmId(commit.id)}>{restoring === commit.id ? <LoaderCircle size={13} className="spin" /> : <RotateCcw size={13} />} Restore</button>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="history-empty"><History size={24} /><strong>No versions yet</strong><span>Save a version to see it here.</span></div>}
    </Drawer>
  );
}
