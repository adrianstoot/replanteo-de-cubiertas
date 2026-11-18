import React, { useState } from 'react';
import { RoofProvider } from './store/useRoofStore';
import { TopBar } from './components/layout/TopBar';
import { LeftToolbar } from './components/layout/LeftToolbar';
import { CenterWorkspace } from './components/workspace/CenterWorkspace';
import { RightInspector } from './components/layout/RightInspector';
import { BottomDock } from './components/layout/BottomDock';
import { NormativaModal } from './components/modals/NormativaModal';
import { ExportModal } from './components/modals/ExportModal';
import { ImportCalibrateModal } from './components/modals/ImportCalibrateModal';
import { NewProjectModal } from './components/modals/NewProjectModal';
import { GuidedTutorModal } from './components/modals/GuidedTutorModal';
import { SolutionsModal } from './components/modals/SolutionsModal';

const AppShell: React.FC = () => {
  const [modal, setModal] = useState<
    null | 'new' | 'import' | 'normativa' | 'export' | 'help' | 'solutions'
  >(null);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#121821] text-slate-100 overflow-hidden">
      <TopBar
        onOpenNewModal={() => setModal('new')}
        onOpenImportModal={() => setModal('import')}
        onOpenNormativaModal={() => setModal('normativa')}
        onOpenExportModal={() => setModal('export')}
        onOpenHelpModal={() => setModal('help')}
        onOpenSolutionsModal={() => setModal('solutions')}
      />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <LeftToolbar
          onOpenImportModal={() => setModal('import')}
          onOpenNormativaModal={() => setModal('normativa')}
          onOpenExportModal={() => setModal('export')}
        />
        <CenterWorkspace onOpenSolutionsModal={() => setModal('solutions')} />
        <RightInspector onOpenNormativaModal={() => setModal('normativa')} />
      </div>

      <BottomDock
        onOpenNormativaModal={() => setModal('normativa')}
        onOpenExportModal={() => setModal('export')}
      />

      {modal === 'new' && <NewProjectModal onClose={() => setModal(null)} />}
      {modal === 'import' && <ImportCalibrateModal onClose={() => setModal(null)} />}
      {modal === 'normativa' && <NormativaModal onClose={() => setModal(null)} />}
      {modal === 'export' && <ExportModal onClose={() => setModal(null)} />}
      {modal === 'help' && <GuidedTutorModal onClose={() => setModal(null)} />}
      {modal === 'solutions' && <SolutionsModal onClose={() => setModal(null)} />}
    </div>
  );
};

export function App() {
  return (
    <RoofProvider>
      <AppShell />
    </RoofProvider>
  );
}

export default App;
