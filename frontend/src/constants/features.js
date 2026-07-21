export const FEATURES = {
  // Pre-Processing
  'preprep.upload':       { group: 'Pre-Processing', label: 'Upload to Pre-Prep',           desc: 'Drop new files into Pre-Preparation' },
  'preprep.operate':      { group: 'Pre-Processing', label: 'Operate Pre-Prep',             desc: 'Split, rotate, classify pages on assigned records' },
  'preprep.assign':       { group: 'Pre-Processing', label: 'Assign Pre-Prep Records',      desc: 'Route a record to another operator or team' },
  // Import / Pipeline
  'import.upload':        { group: 'Import & Pipeline', label: 'Create Batches',            desc: 'Upload batches and queue for AI extraction' },
  'extraction.view':      { group: 'Import & Pipeline', label: 'View AI Extraction',          desc: 'See the live extraction screen' },
  'extraction.control':   { group: 'Import & Pipeline', label: 'Control AI Extraction',       desc: 'Start, pause, and resume extraction jobs' },
  // HITL
  'hitl.full':            { group: 'HITL Review', label: 'HITL Full',                       desc: 'Full HITL access including edit/approve across all batches' },
  'hitl.team':            { group: 'HITL Review', label: 'HITL Team-Scoped',                desc: 'HITL access scoped to user\'s team batches' },
  'hitl.readonly':        { group: 'HITL Review', label: 'HITL Read-Only',                  desc: 'View-only HITL — no edit, used by QC validators' },
  // QC
  'qc.approve':           { group: 'QC', label: 'QC Approve',                               desc: 'Full QC powers — approve, send-back, reject, archive' },
  'qc.team':              { group: 'QC', label: 'QC Team-Scoped',                           desc: 'QC scoped to user\'s team batches' },
  // Repository / DigiFind
  'repository.full':      { group: 'Repository & DigiFind', label: 'Repository Full',       desc: 'Full repository search inside the workflow shell' },
  'repository.browser':   { group: 'Repository & DigiFind', label: 'Repository Browser',    desc: 'Search-only mode — no sidebar, DigiFind companion pane' },
  'digifind.ai':           { group: 'Repository & DigiFind', label: 'DigiFind AI',           desc: 'Conversational query over the archive' },
  // Reports
  'reports.full':         { group: 'Reports', label: 'Reports & Analytics',                 desc: 'Reports dashboard + export' },
  // Admin
  'admin.workflow':       { group: 'Admin', label: 'Batch Manager',                         desc: 'Cross-pipeline view of all batches with delete authority and deletion log' },
  'admin.users':          { group: 'Admin', label: 'Users & Teams',                         desc: 'Manage users, teams, and feature assignments' },
  'admin.integrations':   { group: 'Admin', label: 'Integrations',                          desc: 'Manage S3 buckets, API keys, and connections' },
  'admin.billing':        { group: 'Admin', label: 'Session Billing',                       desc: 'View token usage and cost telemetry for the current session' },
  'admin.settings':       { group: 'Admin', label: 'Settings',                              desc: 'Pipeline thresholds, parallel processing, and per-stage extraction settings' }
};

export const FEATURE_IDS = Object.keys(FEATURES);
export const FEATURE_GROUPS = ['Pre-Processing', 'Import & Pipeline', 'HITL Review', 'QC', 'Repository & DigiFind', 'Reports', 'Admin'];

// Pre-defined role bundles.
export const ROLE_DEFS = [
  {
    name: 'Administrator',
    color: 'from-violet-500 to-indigo-700',
    features: [...FEATURE_IDS],  // all 19 features
    perms: ['Full system access', 'Manage users & teams', 'Configure extraction engine', 'View all data & reports', 'Audit log access']
  },
  {
    name: 'Supervisor',
    color: 'from-amber-500 to-orange-700',
    features: ['qc.approve', 'hitl.readonly', 'repository.full', 'digifind.ai'],
    perms: ['Approve HITL-reviewed batches', 'Read-only HITL to validate against original', 'Search the Digital Repository', 'Run DigiFind AI conversational queries']
  },
  {
    name: 'Operator',
    color: 'from-emerald-500 to-teal-700',
    features: ['preprep.operate', 'hitl.team'],
    perms: ['Split, rotate, and classify pages in Pre-Prep', 'Review assigned batches in HITL (team-scoped)', 'Edit extracted fields and flag NCV']
  },
  {
    name: 'User',
    color: 'from-slate-500 to-slate-700',
    features: ['repository.browser', 'digifind.ai'],
    perms: ['Browse the Digital Repository (search-only)', 'Run DigiFind AI conversational queries']
  },
  {
    name: 'Client',
    color: 'from-cyan-500 to-blue-700',
    features: ['repository.full', 'reports.full'],
    perms: ['Search the Digital Repository', 'View Reports & Analytics']
  }
];

// hasFeature — single source of truth for capability checks.
export const hasFeature = (user, featureId) => {
  if (!user) return false;
  if (user.role === 'Administrator') return true;
  return Array.isArray(user.features) && user.features.includes(featureId);
};

export const DEFAULT_TEAMS = [
  { id: 'team-admin',      name: 'Administration', location: 'New Jersey', description: 'Platform administrators with full access',                                color: 'from-violet-500 to-indigo-700', leadInitials: 'TA', lead: 'Theresa Atwood',    features: [...FEATURE_IDS] },
  { id: 'team-supervisor', name: 'Supervisors',    location: 'New Jersey', description: 'QC supervisors — approve archives + read-only HITL + repository access', color: 'from-amber-500 to-orange-700',  leadInitials: 'JV', lead: 'Joseph Velasquez',  features: ['qc.approve', 'hitl.readonly', 'repository.full', 'digifind.ai'] },
  { id: 'team-operator',   name: 'Operators',      location: 'Mumbai', description: 'Back-end operators handling Pre-Prep and team-scoped HITL review',         color: 'from-emerald-500 to-teal-700',  leadInitials: 'RM', lead: 'Rita Manning',      features: ['preprep.operate', 'hitl.team'] },
  { id: 'team-user',       name: 'Users',          location: 'Various',     description: 'Browser-mode repository search and DigiFind AI access only',              color: 'from-slate-500 to-slate-700',   leadInitials: 'LP', lead: 'Linda Park',        features: ['repository.browser', 'digifind.ai'] }
];

export const DEFAULT_USERS = [
  { id: 'user-admin',      name: 'Theresa Atwood',   email: 'admin@tsa.org',         role: 'Administrator', team: 'Administration', initials: 'TA', status: 'active', mfa: true,  lastActive: 'now', features: [...FEATURE_IDS] },
  { id: 'user-supervisor', name: 'Joseph Velasquez', email: 'jvelasquez@tsa.org',    role: 'Supervisor',    team: 'Supervisors',    initials: 'JV', status: 'active', mfa: true,  lastActive: 'now', features: ['qc.approve', 'hitl.readonly', 'repository.full', 'digifind.ai'] },
  { id: 'user-operator',   name: 'Rita Manning',     email: 'rita.manning@tsa.org',  role: 'Operator',      team: 'Operators',      initials: 'RM', status: 'active', mfa: true,  lastActive: 'now', features: ['preprep.operate', 'hitl.team'] },
  { id: 'user-user',       name: 'Linda Park',       email: 'lpark@tsa.org',         role: 'User',          team: 'Users',          initials: 'LP', status: 'active', mfa: false, lastActive: 'now', features: ['repository.browser', 'digifind.ai'] }
];
