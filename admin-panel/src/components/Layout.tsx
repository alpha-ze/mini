import { Outlet, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LayoutDashboard, FileText, Search, BarChart3, LogOut, Sun, Moon } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

export default function Layout() {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">DDGRS Admin</h1>
          <button
            onClick={toggle}
            className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Toggle dark mode"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
        <nav className="px-4 space-y-1 flex-1">
          <Link
            to="/"
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <LayoutDashboard className="w-5 h-5 mr-3" />
            Dashboard
          </Link>
          <Link
            to="/grievances"
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <FileText className="w-5 h-5 mr-3" />
            Grievances
          </Link>
          <Link
            to="/reports"
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <BarChart3 className="w-5 h-5 mr-3" />
            Reports
          </Link>
          <Link
            to="/search"
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Search className="w-5 h-5 mr-3" />
            Search
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <LogOut className="w-5 h-5 mr-3" />
            Logout
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950">
        <Outlet />
      </main>
    </div>
  )
}
