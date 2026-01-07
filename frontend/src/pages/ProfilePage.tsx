import { useState } from 'react'
import { 
  Phone, Mail, MapPin, Shield, Bell, 
  Globe, ChevronRight, LogOut, Camera, Unlink
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

export default function ProfilePage() {
  const { user, logout } = useAuthStore()
  const [isLocationSharing, setIsLocationSharing] = useState(true)
  const [notifications, setNotifications] = useState({
    sms: true,
    push: true,
    email: false
  })
  
  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }
  
  return (
    <div className="p-4 space-y-6">
      {/* Profile Header */}
      <div className="card p-6 text-center">
        <div className="relative inline-block mb-4">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-500 to-saffron-500 flex items-center justify-center text-white text-3xl font-bold">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <button className="absolute bottom-0 right-0 w-8 h-8 bg-white dark:bg-slate-700 rounded-full shadow-lg flex items-center justify-center text-slate-600 dark:text-slate-300">
            <Camera className="w-4 h-4" />
          </button>
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {user?.name || 'Guest User'}
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          TruckOpti User
        </p>
        <div className="flex items-center justify-center gap-2 mt-2 text-sm text-green-600">
          <Shield className="w-4 h-4" />
          <span>Verified Account</span>
        </div>
      </div>
      
      {/* Contact Info */}
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        <h2 className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
          Contact Information
        </h2>
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600">
            <Phone className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-slate-500">Phone</p>
            <p className="font-medium text-slate-900 dark:text-white">
              +91 98765 43210
            </p>
          </div>
          <span className="badge badge-success">Verified</span>
        </div>
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
            <Mail className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-slate-500">Email</p>
            <p className="font-medium text-slate-900 dark:text-white">
              {user?.email || 'user@truckopti.in'}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400" />
        </div>
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
            <MapPin className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-slate-500">Location</p>
            <p className="font-medium text-slate-900 dark:text-white">
              Mumbai, Maharashtra
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400" />
        </div>
      </div>
      
      {/* Google Account */}
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        <h2 className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
          Connected Accounts
        </h2>
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-900 dark:text-white">Google Account</p>
              <p className="text-sm text-slate-500">Location sharing enabled</p>
            </div>
            <button className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700">
              <Unlink className="w-4 h-4" />
              <span>Unlink</span>
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500 pl-13">
            Your location is shared with fleet managers for delivery tracking
          </p>
        </div>
      </div>
      
      {/* Location Sharing */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-saffron-100 dark:bg-saffron-900/30 flex items-center justify-center text-saffron-600">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-slate-900 dark:text-white">
                Location Sharing
              </p>
              <p className="text-sm text-slate-500">
                Share live location with dispatchers
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={isLocationSharing}
              onChange={(e) => setIsLocationSharing(e.target.checked)}
              className="sr-only peer" 
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-primary-600"></div>
          </label>
        </div>
      </div>
      
      {/* Notifications */}
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        <h2 className="px-4 py-3 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Notifications
        </h2>
        {Object.entries(notifications).map(([key, value]) => (
          <div key={key} className="p-4 flex items-center justify-between">
            <span className="text-slate-700 dark:text-slate-300 capitalize">
              {key === 'sms' ? 'SMS Alerts' : key === 'push' ? 'Push Notifications' : 'Email Updates'}
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={value}
                onChange={(e) => setNotifications(prev => ({
                  ...prev,
                  [key]: e.target.checked
                }))}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-primary-600"></div>
            </label>
          </div>
        ))}
      </div>
      
      {/* App Info */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">App Version</span>
          <span className="text-slate-700 dark:text-slate-300">2.0.0-beta</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Language</span>
          <span className="text-slate-700 dark:text-slate-300">English / हिंदी</span>
        </div>
      </div>
      
      {/* Logout Button */}
      <button 
        onClick={handleLogout}
        className="w-full btn bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30"
      >
        <LogOut className="w-5 h-5" />
        <span>Sign Out</span>
      </button>
      
      {/* Footer */}
      <div className="text-center text-xs text-slate-400 pb-4">
        <p>TruckOpti India • Made with ❤️ in India</p>
        <p className="mt-1">© 2025 All Rights Reserved</p>
      </div>
    </div>
  )
}
