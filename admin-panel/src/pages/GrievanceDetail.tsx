import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Grievance, GrievanceAction, GrievanceStatus } from '../types'
import { getStatusColor, formatDate } from '../lib/utils'

export default function GrievanceDetail() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [remarks, setRemarks] = useState('')
  const [newStatus, setNewStatus] = useState<GrievanceStatus>('Acknowledged')

  const { data: grievance, isLoading } = useQuery({
    queryKey: ['grievance', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grievances')
        .select('*')
        .eq('id', id)
        .single()
      
      if (error) throw error
      return data as Grievance
    },
  })

  const { data: actions = [] } = useQuery({
    queryKey: ['actions', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grievance_actions')
        .select('*')
        .eq('grievance_id', id)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data as GrievanceAction[]
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ currentRemarks, currentStatus }: { currentRemarks: string, currentStatus: GrievanceStatus }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user?.id)
        .single()

      const adminName = profile?.full_name || 'Admin'

      await supabase.from('grievances').update({
        status: currentStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', id)

      await supabase.from('grievance_actions').insert({
        grievance_id: id,
        action_by: profile ? user?.id : null,
        admin_name: adminName,
        remarks: currentRemarks,
        new_status: currentStatus,
      })

      // Notify user via WhatsApp if remarks provided
      if (currentRemarks.trim() && grievance) {
        try {
          console.log('[notify] sending to bot:', grievance.grievance_id, currentRemarks)
          const BOT_URL = import.meta.env.VITE_BOT_URL || 'http://localhost:3001'
          const notifyRes = await fetch(`${BOT_URL}/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              grievanceId: grievance.grievance_id,
              remarks: currentRemarks,
              newStatus: currentStatus,
              adminName,
            }),
          })
          console.log('[notify] response:', notifyRes.status)
        } catch (err) {
          console.error('[notify] fetch error:', err)
        }
      } else {
        console.log('[notify] skipped — remarks empty or grievance null', { currentRemarks, grievance: !!grievance })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grievance', id] })
      queryClient.invalidateQueries({ queryKey: ['actions', id] })
      setRemarks('')
    },
  })

  if (isLoading) return <div className="p-8 text-gray-900 dark:text-white">Loading...</div>
  if (!grievance) return <div className="p-8 text-gray-900 dark:text-white">Grievance not found</div>

  const statuses: GrievanceStatus[] = [
    'Submitted', 'Acknowledged', 'Under Review', 'In Progress',
    'Awaiting Confirmation', 'Resolved', 'Closed', 'Rejected'
  ]

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{grievance.grievance_id}</h1>
          <span className={`inline-block mt-2 px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(grievance.status)}`}>
            {grievance.status}
          </span>
        </div>

        {/* Identity */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Identity</h2>
          {grievance.is_anonymous ? (
            <p className="text-gray-600 dark:text-gray-400 italic">Anonymous Submission</p>
          ) : (
            <div className="space-y-2 text-gray-900 dark:text-gray-200">
              <p><span className="font-medium">Name:</span> {grievance.user_name || 'N/A'}</p>
              <p><span className="font-medium">Role:</span> {grievance.user_role || 'N/A'}</p>
              <p><span className="font-medium">Department:</span> {grievance.user_department || 'N/A'}</p>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Details</h2>
          <div className="space-y-4">
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Category:</span>
              <span className="ml-2 text-gray-900 dark:text-gray-200">{grievance.category}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Submitted:</span>
              <span className="ml-2 text-gray-900 dark:text-gray-200">{formatDate(grievance.created_at)}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Description:</span>
              <p className="mt-2 text-gray-900 dark:text-gray-200">{grievance.description}</p>
            </div>
          </div>
        </div>

        {/* Media */}
        {(grievance.image_url || grievance.video_url) && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Media</h2>
            <div className="space-y-2">
              {grievance.image_url && (
                <a href={grievance.image_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline block">📷 View Image</a>
              )}
              {grievance.video_url && (
                <a href={grievance.video_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline block">🎥 View Video</a>
              )}
            </div>
          </div>
        )}

        {/* Action Panel */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Take Action</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">New Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as GrievanceStatus)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Remarks</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Add your remarks here..."
              />
            </div>
            <button
              onClick={() => updateMutation.mutate({ currentRemarks: remarks, currentStatus: newStatus })}
              disabled={updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Action'}
            </button>
          </div>
        </div>

        {/* Action History */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Action History</h2>
          <div className="space-y-4">
            {actions.map((action) => (
              <div key={action.id} className="border-l-4 border-blue-500 pl-4 py-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{action.new_status}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{action.remarks}</p>
                  </div>
                  <div className="text-right text-sm text-gray-500 dark:text-gray-400">
                    <p>{action.admin_name}</p>
                    <p>{formatDate(action.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
