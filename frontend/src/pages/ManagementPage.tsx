import { useNavigate } from 'react-router-dom'
import { Truck, Package, Users, ChevronRight, Settings, Database, ShieldCheck } from 'lucide-react'

const managementCards = [
  {
    title: 'Truck Fleet',
    description: 'Manage your vehicle types, dimensions, and capacities.',
    icon: Truck,
    path: '/management/trucks',
    color: 'from-blue-500 to-indigo-600',
    count: '12 Types'
  },
  {
    title: 'Carton Inventory',
    description: 'Define standard carton sizes and weight limits.',
    icon: Package,
    path: '/management/cartons',
    color: 'from-emerald-500 to-teal-600',
    count: '45 Types'
  },
  {
    title: 'Customer Directory',
    description: 'Maintain customer records and delivery locations.',
    icon: Users,
    path: '/management/customers',
    color: 'from-orange-500 to-amber-600',
    count: '128 Active'
  }
]

export default function ManagementPage() {
  const navigate = useNavigate()

  return (
    <div className="p-4 space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Management Hub</h1>
          <p className="text-slate-500 dark:text-slate-400">Configure your logistics infrastructure</p>
        </div>
        <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-full">
          <Settings className="w-6 h-6 text-primary-600" />
        </div>
      </div>

      <div className="grid gap-4">
        {managementCards.map((card, index) => (
          <div
            key={card.title}
            onClick={() => navigate(card.path)}
            className="group relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 cursor-pointer hover:shadow-md transition-all duration-300 animate-fade-in"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-start gap-4">
              <div className={`bg-gradient-to-br ${card.color} p-3 rounded-xl text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                <card.icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{card.title}</h3>
                  <span className="text-xs font-medium px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-600 dark:text-slate-300">
                    {card.count}
                  </span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 pr-8">
                  {card.description}
                </p>
              </div>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all">
                <ChevronRight className="w-6 h-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-6 bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="p-3 bg-white/10 backdrop-blur rounded-2xl">
            <Database className="w-6 h-6 text-primary-400" />
          </div>
          <div>
            <h4 className="font-bold">System Health</h4>
            <p className="text-sm text-slate-400">All databases are synchronized and secure.</p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-emerald-400 text-sm font-medium">
            <ShieldCheck className="w-4 h-4" />
            Secure
          </div>
        </div>
      </div>
    </div>
  )
}
