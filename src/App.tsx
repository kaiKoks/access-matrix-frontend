import React from 'react';
import { Toolbar } from './components/Toolbar';
import { MatrixTable } from './components/MatrixTable';
import { RowDetailDrawer } from './components/RowDetailDrawer';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Панель управления и Таблица */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Toolbar />
        <MatrixTable />
      </main>

      {/* Шторка логов */}
      <RowDetailDrawer />
    </div>
  );
};

export default App;