import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toolbar } from '@/components/Toolbar';
import { MatrixTable } from '@/components/MatrixTable';
import { RowDetailDrawer } from '@/components/RowDetailDrawer';
import { ShieldCheck } from 'lucide-react';

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
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
        <main className="flex-1 flex flex-col overflow-hidden">
          <Toolbar />
          <MatrixTable />
        </main>

        <RowDetailDrawer />
      </div>
    </QueryClientProvider>
  );
};

export default App;