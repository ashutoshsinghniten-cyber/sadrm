import React, { useState } from 'react';
import { FileSpreadsheet, FileJson, ChevronDown } from 'lucide-react';
import Button from '../../../components/shared/Button.jsx';

export default function ExportRecordButton({ onExport }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="secondary" icon={FileSpreadsheet} onClick={() => setOpen(o => !o)}>
        Export Record
        <ChevronDown size={11} className={`ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full mb-1 z-[56] min-w-[180px] bg-white border border-slate-200  shadow-lg overflow-hidden">
            <button onClick={() => { onExport('json'); setOpen(false); }} className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 transition flex items-center gap-2 border-b border-slate-100">
              <FileJson size={12} className="text-blue-700" />
              <div><div className="font-semibold text-slate-800">JSON</div><div className="text-[10px] text-slate-500">Full structured data</div></div>
            </button>
            <button onClick={() => { onExport('xlsx'); setOpen(false); }} className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 transition flex items-center gap-2">
              <FileSpreadsheet size={12} className="text-emerald-700" />
              <div><div className="font-semibold text-slate-800">Spreadsheet</div><div className="text-[10px] text-slate-500">Flat field rows · XLSX</div></div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
