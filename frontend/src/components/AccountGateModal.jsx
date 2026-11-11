import { Cloud, Link2, Lock, Sparkles, Users } from "lucide-react";
import Drawer from "./Drawer.jsx";

const ACTION_COPY = {
  "cloud-save": { icon: Cloud, text: "Save this room to the cloud." },
  share: { icon: Link2, text: "Share this room with a link." },
  collaborate: { icon: Users, text: "Work on this room together." },
  invite: { icon: Users, text: "Invite people to your workspace." },
  agent: { icon: Sparkles, text: "Generate and refine designs with the Design Agent." }
};

export default function AccountGateModal({ action, onClose, onSignIn, isAuthenticated = false }) {
  if (!action) return null;
  const copy = ACTION_COPY[action] || { icon: Cloud, text: "Unlock cloud features." };
  const Icon = copy.icon;

  return (
    <Drawer
      title={isAuthenticated ? "You're all set" : "Sign in to continue"}
      subtitle={isAuthenticated ? "Your account is ready" : copy.text}
      icon={<Icon size={20} strokeWidth={1.8} />}
      onClose={onClose}
      footer={({ close }) => isAuthenticated ? (
        <button className="primary-button" type="button" onClick={close}>Done</button>
      ) : (
        <>
          <button className="secondary-button" type="button" onClick={close}>Not now</button>
          <button className="primary-button" type="button" onClick={onSignIn}>Sign in or sign up</button>
        </>
      )}
    >
      <div className="drawer-hero"><span className="gate-orb"><Icon size={30} strokeWidth={1.5} /></span></div>
      <div className="drawer-note"><Lock size={16} /> Your room stays safe on this device.</div>
    </Drawer>
  );
}
