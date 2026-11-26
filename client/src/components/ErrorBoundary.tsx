import { Component, ReactNode, ErrorInfo } from 'react';

interface State {
  error: Error | null;
}

/**
 * Last line of defense: without this, a single uncaught render error anywhere
 * unmounts the entire React tree and the user sees a fully blank page with no
 * clue why. This boundary catches it and shows the message + stack on screen,
 * with a way back.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const message = this.state.error.message || 'Unexpected error.';
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            background: '#f8fafc',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: 620,
              margin: '16px',
              padding: '24px 28px',
              background: '#fff',
              border: '1px solid #fecaca',
              borderRadius: 16,
              boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
            }}
          >
            <h1 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px', color: '#b91c1c' }}>
              Something went wrong on this screen.
            </h1>
            <p style={{ fontSize: 13, color: '#334155', margin: '0 0 12px' }}>{message}</p>
            <pre
              style={{
                fontSize: 11,
                color: '#64748b',
                background: '#f1f5f9',
                padding: 10,
                borderRadius: 8,
                overflow: 'auto',
                maxHeight: 220,
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {String(this.state.error.stack || '')}
            </pre>
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button
                onClick={() => this.setState({ error: null })}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#0e7490',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                Reload page
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 12, marginBottom: 0 }}>
              If the page stays blank without this message, do a hard refresh (Ctrl+Shift+R) so the
              browser picks up the latest build instead of cached files.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
