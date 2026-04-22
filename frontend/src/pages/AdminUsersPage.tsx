import { useState, useEffect, useCallback } from 'react'
import { Users, Search, RefreshCw, Shield, Trash2, Mail, Phone, Calendar, X, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useLanguageStore } from '../stores/languageStore'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

interface UserRecord {
  id: string
  email: string
  role: string
  created_at: string
  updated_at: string
  name?: string
  phone?: string
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuthStore()
  const { language } = useLanguageStore()
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'customer' | 'driver' | 'agency'>('all')
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  // Redirect non-admins
  useEffect(() => {
    if (currentUser && currentUser.role !== 'admin') {
      toast.error('Admin access required')
      navigate('/dashboard', { replace: true })
    }
  }, [currentUser, navigate, language])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, role, created_at, updated_at, name, phone')
        .order('created_at', { ascending: false })

      if (error) {
        toast.error('Failed to load users')
      } else {
        setUsers((data as UserRecord[]) || [])
      }
    } catch (_err) {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [language])

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchUsers()
    }
  }, [currentUser?.role, fetchUsers])

  const handleDeleteUser = async () => {
    if (!selectedUser) return
    try {
      const { error } = await supabase.from('users').delete().eq('id', selectedUser.id)
      if (error) {
        toast.error('Failed to delete user')
      } else {
        toast.success('User deleted successfully')
        setShowDeleteModal(false)
        setSelectedUser(null)
        fetchUsers()
      }
    } catch (_err) {
      toast.error('Failed to delete user')
    }
  }

  const filteredUsers = users.filter(u => {
    const matchesSearch = !search ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.role?.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === 'all' || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  const roleColors: Record<string, string> = {
    admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    customer: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    driver: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    agency: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
  }

  const roleLabels: Record<string, string> = {
    admin: 'Admin',
    customer: 'Customer',
    driver: 'Driver',
    agency: 'Agency'
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
            <Users size={20} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">
              {'User Management'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {users.length} {'total users'}
            </p>
          </div>
        </div>
        <button
          onClick={fetchUsers}
          disabled={loading}
          className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <RefreshCw size={18} className={`text-slate-600 dark:text-slate-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder={'Search users...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['all', 'admin', 'customer', 'driver', 'agency'] as const).map(role => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${roleFilter === role
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
            >
              {role === 'all' ? ('All') : roleLabels[role]}
            </button>
          ))}
        </div>
      </div>

      {/* Users List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw size={24} className="animate-spin text-indigo-600" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12">
          <Users size={48} className="text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">
            {'No users found'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map(user => (
            <div
              key={user.id}
              className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
                    <Shield size={18} className="text-slate-500" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800 dark:text-white">
                      {user.name || user.email?.split('@')[0] || 'Unknown'}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
                    {user.phone && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-1">
                        <Phone size={12} /> {user.phone}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${roleColors[user.role] || 'bg-slate-100 text-slate-600'}`}>
                    {roleLabels[user.role] || user.role}
                  </span>
                  {user.role !== 'admin' && (
                    <button
                      onClick={() => { setSelectedUser(user); setShowDeleteModal(true) }}
                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {'Joined'}: {new Date(user.created_at).toLocaleDateString('en-IN')}
                </span>
                <span className="flex items-center gap-1">
                  <Mail size={12} />
                  <CheckCircle size={12} className="text-green-500" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
          <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                {'Delete User'}
              </h3>
              <button onClick={() => setShowDeleteModal(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {`Are you sure you want to delete user "${selectedUser.email}"? This action cannot be undone.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                {'Cancel'}
              </button>
              <button
                onClick={handleDeleteUser}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700"
              >
                {'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
