import React from 'react';

/**
 * Basic Error Boundary to catch render errors in specific component trees
 * like the 3D Canvas to prevent the entire app from crashing to a white screen.
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center p-8 bg-red-950/20 border border-red-500/50 rounded-xl">
                    <h2 className="text-red-500 font-display font-bold text-xl mb-2">Component Crashed</h2>
                    <p className="text-red-300 font-mono text-sm max-w-md text-center">
                        {this.state.error?.message || 'An unknown rendering error occurred.'}
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
