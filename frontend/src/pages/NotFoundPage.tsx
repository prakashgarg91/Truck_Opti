import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'
import { useLanguageStore } from '../stores/languageStore'

export default function NotFoundPage() {
  const navigate = useNavigate()
  const { language } = useLanguageStore()

  useEffect(() => {
    document.title = '404 - Page Not Found'
  }, [language])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="text-center">
        {/* Large 404 */}
        <div className="relative mb-8">
          <span className="text-[12rem] leading-none font-bold text-slate-200 dark:text-slate-700 select-none">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-32 h-32 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center shadow-2xl">
              <span className="text-6xl">🤔</span>
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">
          {'Page not found'}
        </h1>

        {/* Subtitle */}
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-md mx-auto">
          The page you're looking for doesn't exist or has been moved.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate('/')}
            className="btn btn-primary inline-flex items-center gap-2 px-6 py-3"
            aria-label={'Go home'}
          >
            <Home className="w-5 h-5" />
            {'Go Home'}
          </button>
          <button
            onClick={() => navigate(-1)}
            className="btn bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 inline-flex items-center gap-2 px-6 py-3"
            aria-label={'Go back'}
          >
            <ArrowLeft className="w-5 h-5" />
            {'Go Back'}
          </button>
        </div>
      </div>
    </div>
  )
}
