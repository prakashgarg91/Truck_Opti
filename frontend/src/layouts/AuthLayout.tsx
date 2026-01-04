import { Outlet } from 'react-router-dom'
import { Truck } from 'lucide-react'

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 flex flex-col">
      {/* Header */}
      <header className="px-6 py-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
            <Truck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">TruckOpti</h1>
        </div>
        <p className="text-primary-200 text-sm">Smart Logistics for India</p>
      </header>
      
      {/* Content */}
      <main className="flex-1 flex items-start justify-center px-4 pb-8">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden">
            <Outlet />
          </div>
        </div>
      </main>
      
      {/* Footer */}
      <footer className="px-6 py-4 text-center">
        <p className="text-primary-200 text-xs">
          🇮🇳 Made for Indian Logistics
        </p>
      </footer>
    </div>
  )
}
