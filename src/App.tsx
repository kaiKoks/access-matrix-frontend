import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toolbar } from '@/components/Toolbar';
import { MatrixSidebar } from '@/components/MatrixSidebar';
import { MatrixTable } from '@/components/MatrixTable';
import { RowDetailDrawer } from '@/components/RowDetailDrawer';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="h-screen overflow-hidden bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
        <Toolbar />
        <div className="flex-1 flex overflow-hidden relative">
          <MatrixSidebar />
          <main className="flex-1 flex flex-col overflow-hidden relative">
            <MatrixTable />
          </main>
          <RowDetailDrawer />
        </div>
      </div>
    </QueryClientProvider>
  );
};

export default App;