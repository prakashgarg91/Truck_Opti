import { useState, useEffect, useCallback } from 'react'
import {
  Users,
  Search,
  RefreshCw,
  Shield,
  Trash2,
  Mail,
  Phone,
  Calendar,
  ChevronLeft,
  X,
  CheckCircle,
  AlertTriangle,
  UserCheck,
  UserX,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { adminSupabaseApi, type AdminUser as UserRecord } from '../services/adminSupabaseApi'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import { toUserFacingErrorMessage } from '../utils/userFacingError'

type UserAction = 'disable' | 'enable' | 'delete'

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  agency: 'Agency',
  customer: 'Customer',
  driver: 'Driver',
  manager: 'Manager',
  user: 'User',
}

const roleColors: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  agency: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  customer: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  driver: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  manager: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  user: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
}

function getActionCopy(action: UserAction, user: UserRecord) {
  switch (action) {
    case 'disable':
      return {
        title: 'Disable Account',
        description: `This bans sign-in for "${user.email}" until an admin re-enables the account.`,
        confirmLabel: 'Disable account',
        confirmClassName: 'bg-amber-600 hover:bg-amber-700 text-white',
        icon: <UserX size={18} className="text-amber-600 dark:text-amber-400" />,
      }
    case 'enable':
      return {
        title: 'Re-enable Account',
        description: `This lifts the auth ban for "${user.email}" and allows new sign-ins again.`,
        confirmLabel: 'Re-enable account',
        confirmClassName: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        icon: <UserCheck size={18} className="text-emerald-600 dark:text-emerald-400" />,
      }
    case 'delete':
      return {
        title: 'Delete Account',
        description: `This permanently deletes the auth account for "${user.email}" and cascades through linked profile data. This cannot be undone.`,
        confirmLabel: 'Delete account',
        confirmClassName: 'bg-red-600 hover:bg-red-700 text-white',
        icon: <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />,
      }
  }
}

export default function AdminUsersPage() {
  const navigate = useNavigate()
  const { user: currentUser } = useAuthStore()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [selectedAction, setSelectedAction] = useState<{ user: UserRecord; action: UserAction } | null>(null)
  const [submittingAction, setSubmittingAction] = useState<UserAction | null>(null)

  const closeActionModal = () => {
    if (submittingAction) {
      return
    }

    setSelectedAction(null)
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const nextUsers = await adminSupabaseApi.getAdminUsers()
      setUsers(nextUsers)
    } catch (error) {
      toast.error(toUserFacingErrorMessage(error, 'Failed to load users'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchUsers()
    }
  }, [currentUser?.role, fetchUsers])

  const roleOptions = ['all', ...Array.from(new Set(users.map(user => user.role).filter(Boolean))).sort()]

  const filteredUsers = users.filter(u => {
    const matchesSearch = !search ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.role?.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === 'all' || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  const statusColors: Record<UserRecord['account_status'], string> = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    disabled: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  }

  const openActionModal = (user: UserRecord, action: UserAction) => {
    setSelectedAction({ user, action })
  }

  const runUserAction = async () => {
    if (!selectedAction) {
      return
    }

    const { user, action } = selectedAction
    setSubmittingAction(action)

    try {
      if (action === 'delete') {
        await adminSupabaseApi.deleteUser(user.id)
        setUsers(currentUsers => currentUsers.filter(currentUser => currentUser.id !== user.id))
        toast.success('User account deleted')
      } else {
        if (action === 'disable') {
          await adminSupabaseApi.banUser(user.id)
        } else {
          await adminSupabaseApi.unbanUser(user.id)
        }

        await fetchUsers()
        toast.success(action === 'disable' ? 'User account disabled' : 'User account re-enabled')
      }

      setSelectedAction(null)
    } catch (error) {
      const fallbackMessage = action === 'delete'
        ? 'Failed to delete the user account'
        : action === 'disable'
          ? 'Failed to disable the user account'
          : 'Failed to re-enable the user account'

      toast.error(toUserFacingErrorMessage(error, fallbackMessage))
    } finally {
      setSubmittingAction(null)
    }
  }

  const modalCopy = selectedAction ? getActionCopy(selectedAction.action, selectedAction.user) : null

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 max-w-6xl mx-auto p-4 md:p-8 pb-20 md:pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin')}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            aria-label="Back to admin dashboard"
          >
            <ChevronLeft size={18} className="text-slate-600 dark:text-slate-400" />
          </button>
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
          {roleOptions.map(role => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${roleFilter === role
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
            >
              {role === 'all' ? ('All') : (roleLabels[role] || role)}
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
              className={`bg-white dark:bg-slate-800 rounded-2xl p-4 border shadow-sm ${user.account_status === 'disabled'
                ? 'border-amber-200 dark:border-amber-900/40'
                : 'border-slate-200 dark:border-slate-700'
                }`}
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
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[user.account_status]}`}>
                    {user.account_status === 'disabled' ? 'Disabled' : 'Active'}
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${roleColors[user.role] || 'bg-slate-100 text-slate-600'}`}>
                    {roleLabels[user.role] || user.role}
                  </span>
                  {user.role !== 'admin' && (
                    <>
                      <button
                        onClick={() => openActionModal(user, user.account_status === 'disabled' ? 'enable' : 'disable')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${user.account_status === 'disabled'
                          ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30'
                          : 'text-amber-700 bg-amber-50 hover:bg-amber-100 dark:text-amber-300 dark:bg-amber-900/20 dark:hover:bg-amber-900/30'
                          }`}
                      >
                        {user.account_status === 'disabled' ? <UserCheck size={14} /> : <UserX size={14} />}
                        {user.account_status === 'disabled' ? 'Enable' : 'Disable'}
                      </button>
                      <button
                        onClick={() => openActionModal(user, 'delete')}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        aria-label={`Delete ${user.email}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
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

      {selectedAction && modalCopy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
          <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {modalCopy.icon}
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                  {modalCopy.title}
                </h3>
              </div>
              <button onClick={closeActionModal} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {modalCopy.description}
            </p>
            <div className="flex gap-3">
              <button
                onClick={closeActionModal}
                disabled={Boolean(submittingAction)}
                className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 disabled:opacity-60 disabled:hover:bg-transparent dark:hover:bg-slate-700"
              >
                {'Cancel'}
              </button>
              <button
                onClick={runUserAction}
                disabled={Boolean(submittingAction)}
                className={`flex-1 px-4 py-2 rounded-xl font-medium disabled:opacity-60 ${modalCopy.confirmClassName}`}
              >
                {submittingAction === selectedAction.action ? 'Working...' : modalCopy.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
