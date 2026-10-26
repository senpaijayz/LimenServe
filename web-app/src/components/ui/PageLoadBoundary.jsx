import { Component } from 'react';

// Keep a failed lazy page inside its workspace instead of blanking the app.
export default class PageLoadBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const needsRefresh = /dynamically imported module|loading chunk|chunkloaderror|importing a module script/i.test(
      String(this.state.error?.message || this.state.error),
    );

    return (
      <section role="alert" className="mx-auto my-6 w-full max-w-xl rounded-2xl border border-primary-200 bg-white p-6 text-primary-900 shadow-sm">
        <h2 className="text-xl font-bold">{needsRefresh ? 'Refresh to open the latest version' : 'This page could not open'}</h2>
        <p className="mt-3 text-sm leading-6 text-primary-700">
          {needsRefresh
            ? 'The website may have been updated while this tab was open. Reload the page to continue.'
            : 'Please reload the page. If this keeps happening, contact your administrator.'}
        </p>
        <p className="mt-2 text-sm leading-6 text-primary-700">Unsaved changes may be lost when reloading. If you were saving, check your saved records before trying again.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-5 min-h-11 rounded-xl bg-primary-900 px-5 py-3 text-sm font-semibold text-white hover:bg-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700">
          Reload page
        </button>
      </section>
    );
  }
}
