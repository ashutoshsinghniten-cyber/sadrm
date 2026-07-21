import React from 'react';

// ==================== ERROR BOUNDARY ====================
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ error, info });
    console.error('[ErrorBoundary] Caught:', error);
    if (info?.componentStack) console.error('[ErrorBoundary] Component stack:', info.componentStack);
  }
  reset = () => this.setState({ hasError: false, error: null, info: null });
  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || String(this.state.error);
      const stack = this.state.error?.stack || '';
      const cstack = this.state.info?.componentStack || '';
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5, background: '#fee2e2', minHeight: '100vh', color: '#7f1d1d' }}>
          <h1 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>⚠️ Render error caught by boundary</h1>
          <p style={{ marginBottom: 12 }}><strong>Message:</strong> {msg}</p>
          <details open style={{ marginBottom: 12 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Error stack</summary>
            <pre style={{ background: 'white', padding: 12, marginTop: 8, overflow: 'auto', maxHeight: 300, whiteSpace: 'pre-wrap' }}>{stack}</pre>
          </details>
          {cstack && (
            <details open style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Component stack</summary>
              <pre style={{ background: 'white', padding: 12, marginTop: 8, overflow: 'auto', maxHeight: 300, whiteSpace: 'pre-wrap' }}>{cstack}</pre>
            </details>
          )}
          <button
            onClick={this.reset}
            style={{ padding: '8px 16px', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 8 }}
          >
            Try again
          </button>
          <button
            onClick={() => { try { localStorage.clear(); } catch {} window.location.reload(); }}
            style={{ padding: '8px 16px', background: '#7f1d1d', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Clear storage and reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
