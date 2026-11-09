import { Component } from "react";

// Last line of defence: if a screen crashes, show a clear recovery screen
// instead of a blank page. Local work is stored on the device and is not lost.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
    this.handleReload = this.handleReload.bind(this);
    this.handleHome = this.handleHome.bind(this);
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Arcdraw screen crashed:", error, info?.componentStack);
  }

  handleReload() {
    window.location.reload();
  }

  handleHome() {
    window.location.hash = "/workspace";
    window.location.reload();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="editor-error-screen" role="alert">
        <p className="section-kicker">Something broke</p>
        <h1>This screen hit a problem.</h1>
        <p>Your work is saved on this device. Reload to pick up where you left off.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="primary-button" type="button" onClick={this.handleReload}>Reload</button>
          <button className="secondary-button" type="button" onClick={this.handleHome}>Back to workspace</button>
        </div>
      </main>
    );
  }
}
