import React, { useMemo } from 'react';
import { Bot, User } from 'lucide-react';

// ==================== AI-VS-HITL DIFF VIEW (QC) ====================
export const flattenExtractedRecord = (extracted) => {
  const donor = extracted?.donor || {};
  const donation = extracted?.donation || {};
  const donorConf = extracted?.donorConf || {};
  const donationConf = extracted?.donationConf || {};
  return {
    fields: {
      donorName: donor.name || '',
      donorAddress: donor.address || '',
      donorType: donor.type || '',
      donorId: donor.donorId || '',
      amount: donation.amount || '',
      date: donation.date || '',
      chequeNo: donation.chequeNo || '',
      amountWords: donation.amountWords || '',
      cardLast4: donation.cardLast4 || '',
      cardExpiry: donation.cardExpiry || '',
      cardType: donation.cardType || '',
      authCode: donation.authCode || '',
      invoiceNo: donation.invoiceNo || '',
      grantId: donation.grantId || '',
      fundName: donation.fundName || '',
      actualDonor: donation.actualDonor || '',
      purpose: donation.purpose || '',
      payee: donation.payee || ''
    },
    fieldsConf: {
      donorName: donorConf.name || 0,
      donorAddress: donorConf.address || 0,
      donorType: donorConf.type || 0,
      donorId: donorConf.donorId || 0,
      amount: donationConf.amount || 0,
      date: donationConf.date || 0,
      chequeNo: donationConf.chequeNo || 0,
      amountWords: donationConf.amountWords || 0,
      cardLast4: donationConf.cardLast4 || 0,
      cardExpiry: donationConf.cardExpiry || 0,
      cardType: donationConf.cardType || 0,
      authCode: donationConf.authCode || 0,
      invoiceNo: donationConf.invoiceNo || 0,
      grantId: donationConf.grantId || 0,
      fundName: donationConf.fundName || 0,
      actualDonor: donationConf.actualDonor || 0,
      purpose: donationConf.purpose || 0,
      payee: donationConf.payee || 0
    }
  };
};

const QCFieldDiffView = ({ record, coreFieldDefs }) => {
  const flat = useMemo(() => flattenExtractedRecord(record.extractedRecord), [record.extractedRecord]);
  const aiFields = record.fields || flat.fields;
  const aiFieldsConf = record.fieldsConf || flat.fieldsConf;
  const hitlReview = record.hitlReview || {};
  const lockedFields = hitlReview.lockedFields || {};
  const ncvSet = new Set(hitlReview.ncvFields || []);
  const editsSet = new Set(Object.keys(hitlReview.edits || {}));
  const tabPicksSet = new Set(Object.keys(hitlReview.tabPicks || {}));

  const fields = coreFieldDefs || [];
  const colTemplate = '1.2fr 1.4fr 1.4fr';

  return (
    <div className="bg-white border border-slate-200  shadow-sm overflow-hidden">
      <div
        className="px-3 py-2 bg-slate-50 border-b border-slate-200 grid items-center gap-3"
        style={{ gridTemplateColumns: colTemplate }}
      >
        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Field</div>
        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
          <Bot size={10} />AI Extracted
        </div>
        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
          <User size={10} />Reviewer Value
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {fields.map(fd => {
          const aiVal = aiFields[fd.key] ?? '';
          const hitlVal = lockedFields[fd.key] ?? '';
          const aiConf = aiFieldsConf[fd.key] || 0;
          const wasEdited = editsSet.has(fd.key);
          const wasTabSwapped = tabPicksSet.has(fd.key);
          const isNCV = ncvSet.has(fd.key);
          const valuesMatch = String(aiVal).trim() === String(hitlVal).trim();
          const divergent = !valuesMatch || wasEdited || wasTabSwapped;
          const bothEmpty = !aiVal && !hitlVal;

          const confTone = aiConf >= 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : aiConf >= 70 ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-rose-50 text-rose-700 border-rose-200';

          const rowTone = divergent
            ? 'border-l-amber-400 bg-amber-50/40'
            : bothEmpty
              ? 'border-l-slate-200'
              : 'border-l-emerald-300';

          return (
            <div
              key={fd.key}
              className={`px-3 py-2.5 text-xs grid items-start gap-3 border-l-[3px] ${rowTone}`}
              style={{ gridTemplateColumns: colTemplate }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-slate-700 break-words">{fd.label}</span>
                  {isNCV && (
                    <span className="text-[8px] font-bold px-1 py-0.5  bg-amber-100 text-amber-800 border border-amber-200 flex-shrink-0" title="Field flagged Need Customer Verification">NCV</span>
                  )}
                </div>
                {aiConf > 0 && (
                  <span className={`inline-block mt-1 text-[9px] font-bold px-1.5 py-0  border ${confTone}`} title={`AI confidence: ${aiConf}%`}>
                    {aiConf}%
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <span className={`text-[12px] break-words whitespace-normal leading-snug ${aiVal ? 'text-slate-700' : 'text-slate-400 italic'}`}>
                  {aiVal || 'empty'}
                </span>
              </div>
              <div className="min-w-0">
                <span className={`text-[12px] break-words whitespace-normal leading-snug ${hitlVal ? (divergent ? 'text-amber-900 font-semibold' : 'text-slate-700') : 'text-slate-400 italic'}`}>
                  {hitlVal || 'empty'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default QCFieldDiffView;
