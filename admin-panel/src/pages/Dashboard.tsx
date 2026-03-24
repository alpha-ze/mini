import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Grievance } from '../types'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useTheme } from '../context/ThemeContext'

export default function Dashboard() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const { data: grievances = [], isLoading } = useQuery({
    queryKey: ['grievances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grievances')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Grievance[]
    },
  })

  const stats = {
    total: grievances.length,
    pending: grievances.filter(g => g.status === 'Submitted' || g.status === 'Acknowledged').length,
    inProgress: grievances.filter(g => g.status === 'In Progress' || g.status === 'Under Review').length,
    resolved: grievances.filter(g => g.status === 'Resolved' || g.status === 'Closed').length,
  }

  const categories = [
    'Academic', 'Examination', 'Infrastructure', 'Hostel',
    'Library', 'Administration', 'IT / Network',
    'Discipline / Harassment', 'Other'
  ]

  const getCategoryCount = (category: string) =>
    grievances.filter(g => g.category === category && (g.status === 'Submitted' || g.status === 'Acknowledged')).length

  const categoryData = categories.map(category => ({
    name: category,
    count: grievances.filter(g => g.category === category).length
  })).filter(item => item.count > 0)

  const statusData = [
    { name: 'Submitted', value: grievances.filter(g => g.status === 'Submitted').length, color: '#3B82F6' },
    { name: 'Acknowledged', value: grievances.filter(g => g.status === 'Acknowledged').length, color: '#60A5FA' },
    { name: 'Under Review', value: grievances.filter(g => g.status === 'Under Review').length, color: '#F59E0B' },
    { name: 'In Progress', value: grievances.filter(g => g.status === 'In Progress').length, color: '#FB923C' },
    { name: 'Awaiting Confirmation', value: grievances.filter(g => g.status === 'Awaiting Confirmation').length, color: '#8B5CF6' },
    { name: 'Resolved', value: grievances.filter(g => g.status === 'Resolved').length, color: '#10B981' },
    { name: 'Closed', value: grievances.filter(g => g.status === 'Closed').length, color: '#6B7280' },
    { name: 'Rejected', value: grievances.filter(g => g.status === 'Rejected').length, color: '#EF4444' },
  ].filter(item => item.value > 0)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Submitted': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
      case 'Acknowledged': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
      case 'Under Review': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
      case 'In Progress': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
      case 'Awaiting Confirmation': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300'
      case 'Resolved': return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
      case 'Closed': return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
      case 'Rejected': return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const axisColor = isDark ? '#9CA3AF' : '#6B7280'
  const gridColor = isDark ? '#374151' : '#E5E7EB'
  const tooltipStyle = isDark
    ? { backgroundColor: '#1F2937', border: '1px solid #374151', color: '#F9FAFB' }
    : {}

  if (isLoading) return <div className="p-8 text-gray-900 dark:text-white">Loading...</div>

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Grievances', value: stats.total, color: 'text-gray-900 dark:text-white', path: '/grievances', sub: 'Click to view all' },
          { label: 'Pending', value: stats.pending, color: 'text-yellow-600 dark:text-yellow-400', path: '/grievances?status=pending', sub: 'Click to view pending' },
          { label: 'In Progress', value: stats.inProgress, color: 'text-blue-600 dark:text-blue-400', path: '/grievances?status=progress', sub: 'Click to view in progress' },
          { label: 'Resolved', value: stats.resolved, color: 'text-green-600 dark:text-green-400', path: '/grievances?status=resolved', sub: 'Click to view resolved' },
        ].map(card => (
          <div
            key={card.label}
            className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate(card.path)}
          >
            <div className="text-sm text-gray-600 dark:text-gray-400">{card.label}</div>
            <div className={`text-3xl font-bold mt-2 ${card.color}`}>{card.value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Category Distribution</h2>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} interval={0} tick={{ fontSize: 11, fill: axisColor }} />
                <YAxis tick={{ fill: axisColor }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500 dark:text-gray-400">No data available</div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Status Breakdown</h2>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" labelLine={true} label={({ name, value }) => `${name}: ${value}`} outerRadius={80} dataKey="value">
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500 dark:text-gray-400">No data available</div>
          )}
        </div>
      </div>

      {/* Category Grid */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Categories</h2>
        <div className="grid grid-cols-3 gap-4">
          {categories.map((category) => (
            <div
              key={category}
              className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md cursor-pointer transition-all"
              onClick={() => navigate(`/grievances?category=${encodeURIComponent(category)}`)}
            >
              <div className="text-sm font-medium text-gray-900 dark:text-white">{category}</div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">{getCategoryCount(category)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">pending • click to view</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Grievances */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Grievances</h2>
          <button onClick={() => navigate('/grievances')} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium">
            View All →
          </button>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {['ID', 'Category', 'Description', 'Status', 'Date'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {grievances.slice(0, 8).map((grievance) => (
                <tr
                  key={grievance.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                  onClick={() => navigate(`/grievances/${grievance.id}`)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400">{grievance.grievance_id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{grievance.category}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-200"><div className="max-w-xs truncate">{grievance.description}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(grievance.status)}`}>{grievance.status}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(grievance.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {grievances.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">No grievances found.</div>
          )}
          {grievances.length > 8 && (
            <div className="bg-gray-50 dark:bg-gray-800 px-6 py-3 text-center">
              <button onClick={() => navigate('/grievances')} className="text-blue-600 dark:text-blue-400 text-sm font-medium">
                View {grievances.length - 8} more grievances →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
