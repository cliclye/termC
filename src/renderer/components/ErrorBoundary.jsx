import { Component } from 'react';

// Contains a rendering error to one region of the UI instead of blanking the whole window.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    window.termc?.log('render error', this.props.name || '', error?.stack || String(error), info?.componentStack || '');
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.silent) return null;
    return (
      <div className="error-box">
        <strong>{this.props.name || 'This panel'} hit an error</strong>
        <span>{String(this.state.error?.message || this.state.error)}</span>
        <button className="btn sm" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
