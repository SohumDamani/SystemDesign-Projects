import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Changing this clears the error, such as when moving to another lesson. */
  resetKey?: string;
  what: string;
}

/** One broken lab should never take down the page around it. */
export class ErrorBoundary extends Component<Props, { failed: boolean; resetKey?: string }> {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: { failed: boolean; resetKey?: string }) {
    if (props.resetKey !== state.resetKey) return { failed: false, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(`${this.props.what} crashed`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="practice" role="alert">
        <h3>{this.props.what} ran into a problem</h3>
        <p>The rest of the page still works. Reloading usually fixes this.</p>
        <button className="btn" onClick={() => location.reload()}>
          Reload the page
        </button>
      </div>
    );
  }
}
