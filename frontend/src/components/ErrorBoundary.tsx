import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * Error Boundary component that catches React rendering errors
 * and displays a friendly error screen with option to reload.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({
      error,
      errorInfo,
    })

    // Log error to console in all environments
    console.error('ErrorBoundary caught an error:', error, errorInfo)

    // Here you could also send error to an error reporting service like Sentry
    // if (import.meta.env.PROD) {
    //   errorReportingService.captureException(error, { extra: errorInfo })
    // }
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV
      const { error, errorInfo } = this.state

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4">
          <div className="w-full max-w-md">
            {/* Error Card */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {/* Header with gradient */}
              <div className="bg-gradient-to-r from-red-500 to-orange-500 p-6 text-center">
                <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-xl font-bold text-white">Something went wrong</h1>
                <p className="text-white/80 text-sm mt-1">
                  We apologize for the inconvenience
                </p>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                <p className="text-slate-600 dark:text-slate-400 text-center text-sm">
                  An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.
                </p>

                {/* Try Again Button */}
                <button
                  onClick={this.handleReload}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-all duration-200 active:scale-[0.98]"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>

                {/* Error Details - Development Only */}
                {isDev && error && (
                  <div className="mt-4 p-4 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                      Error Details (Development)
                    </h3>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                        <p className="text-red-700 dark:text-red-400 font-semibold">{error.name}</p>
                        <p className="text-red-600 dark:text-red-300 mt-1">{error.message}</p>
                      </div>
                      {error.stack && (
                        <details className="group">
                          <summary className="cursor-pointer text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
                            Stack Trace
                          </summary>
                          <pre className="mt-2 p-2 bg-slate-50 dark:bg-slate-950 rounded-lg text-slate-600 dark:text-slate-400 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                            {error.stack}
                          </pre>
                        </details>
                      )}
                      {errorInfo?.componentStack && (
                        <details className="group">
                          <summary className="cursor-pointer text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
                            Component Stack
                          </summary>
                          <pre className="mt-2 p-2 bg-slate-50 dark:bg-slate-950 rounded-lg text-slate-600 dark:text-slate-400 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                            {errorInfo.componentStack}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  If this keeps happening, please contact{' '}
                  <a
                    href="mailto:support@truckopti.in"
                    className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                  >
                    support@truckopti.in
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
