// src/App.jsx — 카카오 상담·잔디 대화 조회 전용 앱. 위키·에디터·검색 등은 없다.
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastViewport } from '@astryxdesign/core/Toast'
import { AuthProvider } from '@/store/authStore'
import { RequireAuth } from '@/components/RequireAuth'
import AppLayout from '@/layouts/AppLayout'
import LoginPage from '@/pages/LoginPage'
import ConsultsPage from '@/pages/ConsultsPage'
import JandiPage from '@/pages/JandiPage'
import './App.astryx.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastViewport position="bottomEnd" maxVisible={3}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route element={<AppLayout />}>
                  <Route index element={<Navigate to="/consults" replace />} />
                  <Route path="/consults" element={<ConsultsPage />} />
                  <Route path="/jandi" element={<JandiPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastViewport>
    </QueryClientProvider>
  )
}
