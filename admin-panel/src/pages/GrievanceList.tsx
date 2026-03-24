import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Grievance } from '../types'
import { getStatusColor, formatDate } from '../lib/utils'
import { useEffect, useState } from 'react'

export default function GrievanceList() {
  const [searchParams] = useSearchParams()
  const [filteredGrievances, setFilteredGrievances] = useState<Grievance[]>([])
  
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

  useEffect(() => {
    let filtered = [...grievances]
    
    // Filter by category
    const category = searchParams.get('category')
    if (category) {
      filtered = filtered.filter(g => g.category === category)
    }
    
    // Filter by status
    const status = searchParams.get('status')
    if (status) {
      switch (status) {
        case 'pending':
          filtered = filtered.filter(g => g.status === 'Submitted' || g.status === 'Acknowledged')
          break
        case 'progress':
          filtered = filtered.filter(g => g.status === 'In Progress' || g.status === 'Under Review')
          break
        case 'resolved':
          filtered = filtered.filter(g => g.status === 'Resolved' || g.status === 'Closed')
          break
        default:
          filtered = filtered.filter(g => g.status === status)
      }
    }
    
    setFilteredGrievances(filtered)
  }, [grievances, searchParams])

  const getFilterTitle = () => {
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    
    if (category && status) {
      return `${category} - ${status.charAt(0).toUpperCase() + status.slice(1)} Grievances`
    } else if (category) {
      return `${category} Grievances`
    } else if (status) {
      const statusMap: { [key: string]: string } = {
        pending: 'Pending',
        progress: 'In Progress',
        resolved: 'Resolved'
      }
      return `${statusMap[status] || status.charAt(0).toUpperCase() + status.slice(1)} Grievances`
    }
    return 'All Grievances'
  }

  if (isLoading) {
    return <div className="p-8 text-gray-900 dark:text-white">Loading...</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{getFilterTitle()}</h1>
          {(searchParams.get('category') || searchParams.get('status')) && (
            <Link to="/grievances" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 mt-1 inline-block">
              ← Back to all grievances
            </Link>
          )}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Showing: {filteredGrievances.length} of {grievances.length} grievances
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Grievance ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Identity</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredGrievances.map((grievance) => (
              <tr key={grievance.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link to={`/grievances/${grievance.id}`} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800">
                    {grievance.grievance_id}
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-200 max-w-md truncate">{grievance.description}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{grievance.category}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(grievance.status)}`}>{grievance.status}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">
                  {grievance.is_anonymous ? <span className="text-gray-500 dark:text-gray-500 italic">Anonymous</span> : grievance.user_name || 'Identified'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(grievance.created_at)}</td>
              </tr>
            ))}
            {filteredGrievances.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No grievances found matching the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
