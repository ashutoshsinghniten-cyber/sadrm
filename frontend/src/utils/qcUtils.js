export const getConfTier = (c) => {
  if (c >= 90) return { border: 'border-l-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (c >= 70) return { border: 'border-l-amber-500', pill: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { border: 'border-l-rose-500', pill: 'bg-rose-50 text-rose-700 border-rose-200' };
};

export const normalize = (s) => String(s || '').toLowerCase().replace(/[\s$,.-]/g, '').trim();

export const valueMatches = (a, b) => {
  if (!a || !b) return false;
  const na = normalize(a), nb = normalize(b);
  if (na === nb) return true;
  if (na.length > 3 && nb.length > 3) return na.includes(nb) || nb.includes(na);
  return false;
};

// ===== qcReview helpers =====
// New shape:
//   qcReview = {
//     status: 'sent-back' | 'archived' | 'rejected',
//     destination: 'hitl' | 'preprep' | null,
//     reason: string,
//     flaggedFields: string[],
//     flaggedPages: string[],
//     boundaryIssue: boolean,
//     reviewedAt, reviewer,
//     history: [{ action, destination, reason, flaggedFields, flaggedPages, reviewer, at }]
//   }
export const getQcReason = (qcReview) => qcReview?.reason ?? qcReview?.sendBackReason ?? '';
export const getQcDestination = (qcReview) => qcReview?.destination ?? (qcReview?.status === 'sent-back' ? 'hitl' : null);
export const getQcFlaggedFields = (qcReview) => qcReview?.flaggedFields ?? [];
export const getQcFlaggedPages = (qcReview) => qcReview?.flaggedPages ?? [];
export const getQcHistory = (qcReview) => qcReview?.history ?? [];
