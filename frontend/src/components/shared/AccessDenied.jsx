import React from 'react';
import { Shield } from 'lucide-react';
import Button from './Button.jsx';

const AccessDeniedScreen = ({ currentUser, onGoHome }) => (
  <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50 p-8">
    <div className="text-center max-w-md">
      <div className="w-16 h-16  bg-gradient-to-br from-red-700 to-red-900 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-red-900/25">
        <Shield size={28} className="text-white" />
      </div>
      <h2 className="text-2xl font-black text-slate-800 tracking-tight">Access Denied</h2>
      <div className="w-16 h-0.5 bg-gradient-to-r from-red-600 via-amber-400 to-blue-800 mt-2 mx-auto opacity-80"></div>
      <p className="text-sm text-slate-500 mt-4 leading-relaxed">
        You don't have permission to view this page.
        {currentUser && <span className="block mt-1">Logged in as <strong>{currentUser.name}</strong> ({currentUser.role}).</span>}
      </p>
      <div className="mt-6">
        <Button variant="primary" onClick={onGoHome}>Return to your home screen</Button>
      </div>
    </div>
  </div>
);

export default AccessDeniedScreen;
