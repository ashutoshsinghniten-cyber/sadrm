import { AI_RUNTIME } from '../constants/appConfig.js';
import { PAGE_TYPES } from '../constants/pageTypes.js';
import { recordApiCall } from './billing.js';
import { fileToBase64 } from './pdfUtils.js';
import { getAuthToken } from './pgApi.js';

export const readEnv = (key, fallback = '') => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.env) {
      return import.meta.env[key] || fallback;
    }
  } catch { /* fall through */ }
  return fallback;
};

export const postRuntimeRequest = async (path, payload) => {
  let response;
  try {
    const token = getAuthToken();
    response = await fetch(AI_RUNTIME.endpoint(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error('Runtime gateway is unreachable. Restart `npm run dev`; the dev server hosts `/api/runtime` directly.');
  }

  if (!response.ok) {
    let message = `Runtime gateway error (${response.status})`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {}
    throw new Error(message);
  }

  const data = await response.json();
  // The backend always answers 200 OK, even when the upstream Claude call failed
  // internally (see AiRuntimeService) — surface that error instead of silently
  // returning an empty payload.
  if (data?.error) throw new Error(data.error);
  return data;
};

// Some models occasionally preface JSON with prose despite instructions to
// return JSON only (and some models reject assistant-turn prefill outright,
// so we can't force it that way). Extract the outermost {...} object by
// brace-matching — aware of string contents — instead of assuming the
// response starts with '{'.
const extractJsonObject = (text) => {
  const start = text.indexOf('{');
  if (start === -1) return text;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
};

export const DONATION_EXTRACTION_SYSTEM = `You are a careful data-extraction assistant for The Salvation Army Donation Records Management Project (SADRMP).

You receive multiple single-page PDFs that together describe ONE donation record. Each page has a type:
- CF: Check Front — the physical check
- CB: Check Back — check back (endorsement, stamps)
- RF: Receipt Front — donation slip or voucher front
- RB: Receipt Back — slip/voucher back (additional instructions, CC signature, auth block); contains credit-card number and expiry if the donor paid by card
- OT: Other — any supporting document not fitting the above categories

Your job: extract a SINGLE unified donation record by synthesising information across all provided pages. Cross-validate when multiple pages carry the same field (e.g., the cheque shows $500 and the voucher confirms $500). Classify the payment method. Never invent values — use empty string "" if a field is not visible. Return STRICT JSON only (no markdown, no commentary).

You read both printed and handwritten content equally well, including multilingual text. For each field you extract, you also return the bounding box of the source text on the source page using normalized coordinates (0.0–1.0) where (0,0) is the top-left and (1,1) is the bottom-right of the page.

For confidence scores (0-100): be conservative. Lower confidence when a value is handwritten, partially occluded, or inferred. Higher confidence when the same value appears verbatim across multiple pages.

For credit-card numbers on Receipt Back (RB): extract only the LAST 4 digits ("last4"), never the full number — we do not store full PANs. If you see only partial CC digits or masked digits, that still qualifies as last4.`;

export const DONATION_EXTRACTION_PROMPT = `Extract the unified donation record from all attached pages. Respond with valid JSON ONLY matching this schema:

{
  "paymentMethod": "Cheque | CreditCard | Unknown",
  "paymentMethodConf": 0,
  "donor": {
    "name": "",
    "address": "",
    "type": "Individual | Organization | Unknown",
    "donorId": ""
  },
  "donorConf": { "name": 0, "address": 0, "type": 0, "donorId": 0 },
  "donation": {
    "amount": "",
    "date": "",
    "chequeNo": "",
    "amountWords": "",
    "cardLast4": "",
    "cardExpiry": "",
    "cardType": "",
    "authCode": "",
    "invoiceNo": "",
    "grantId": "",
    "fundName": "",
    "actualDonor": "",
    "purpose": "",
    "payee": ""
  },
  "donationConf": {
    "amount": 0, "date": 0, "chequeNo": 0,
    "amountWords": 0, "cardLast4": 0, "cardExpiry": 0, "cardType": 0,
    "authCode": 0, "invoiceNo": 0, "grantId": 0, "fundName": 0,
    "actualDonor": 0, "purpose": 0, "payee": 0
  },
  "boxes": {
    "donor.name":     { "page": "CF", "x": 0.05, "y": 0.10, "w": 0.40, "h": 0.05 },
    "donor.address":  { "page": "CF", "x": 0.05, "y": 0.16, "w": 0.40, "h": 0.04 }
  },
  "pageNotes": [
    { "code": "CF", "notes": "" }
  ],
  "crossValidation": [
    { "field": "amount", "sources": ["CF", "RF"], "values": { "CF": "500.00", "RF": "500.00" }, "confByPage": { "CF": 98, "RF": 94 }, "consistent": true, "note": "" }
  ]
}

Rules:
- paymentMethod: "Cheque" when a CF page is present with legible cheque details. "CreditCard" when a RB page carries a credit-card number/last4 with no CF. "Unknown" otherwise.
- donor.name: the ACTUAL donor (not the intermediary/DAF). If a Letter names a natural person via "by the generosity of X", that natural person is the actual donor and donor.type = "Individual". The organization on the cheque may be the conduit, not the donor.
- donor.type: "Individual" for named persons; "Organization" for companies/foundations/churches; "Unknown" if unclear.
- donation.amount: only the numeric value ("500.00"), no currency symbol.
- donation.cardLast4: LAST 4 DIGITS ONLY, never the full PAN.
- donation.chequeNo / donation.cardLast4 / donation.invoiceNo — PRIORITY SOURCE IS RB: The Receipt Back (RB) page ALWAYS contains the cheque number or credit card number. When an RB page is present, extract the cheque/credit card number from RB FIRST. Only fall back to CF or RF if RB is absent or the value is illegible on RB. Never leave chequeNo or cardLast4 empty when an RB page is supplied.
- donation.signature: "Yes" | "No" | "Unclear".
- pageNotes: one entry per page type included in the submission with any noteworthy observation (e.g., "endorsement stamp visible", "handwriting smudged on amount line"). Omit for pages with nothing notable.
- crossValidation: list of fields where the same value appears on >1 page. For EACH source, also provide the literal extracted value in "values" (keyed by page code) AND a per-page confidence in "confByPage" (keyed by page code, integer 0-100 reflecting visual legibility on THAT specific page). The reviewer will see these as switchable tabs to compare what each page recorded. Flag inconsistencies (consistent: false) for reviewer attention.
- Omit any optional field you cannot determine — leave as empty string "".

Bounding boxes (REQUIRED for each non-empty field):
- The "boxes" object maps a dotted field path to a bounding box. Use these exact paths:
  donor.name, donor.address, donor.donorId,
  donation.amount, donation.date, donation.chequeNo,
  donation.amountWords, donation.cardLast4, donation.cardExpiry, donation.cardType,
  donation.authCode, donation.invoiceNo, donation.grantId, donation.fundName,
  donation.actualDonor, donation.purpose, donation.payee
- Each box: { "page": "<one of CF|CB|RF|RB|LF|LB|OT>", "x": <0..1>, "y": <0..1>, "w": <0..1>, "h": <0..1> }
- (x, y) is the TOP-LEFT corner; (w, h) is width/height. All values are fractions of the page dimensions.
- "page" must match the type code of the page where the value was read.
- Tightly enclose the source text — don't draw boxes that span the whole line if the value is just a few characters.
- Omit a field's box ONLY if the field value is empty.
- If the same value appears on multiple pages (e.g., amount on both CF and RF), pick the page with the cleanest source text and reference that one.`;

// Call the AI extraction service to extract a unified donation record
export const extractDonationRecord = async (pages) => {
  if (!pages || pages.length === 0) throw new Error('No pages to extract from');

  const PRIMARY_CODES = new Set(['CF', 'RF', 'RB']);
  const content = [];
  for (const page of pages) {
    const pageCode = page.code ?? page.kind;
    if (!PRIMARY_CODES.has(pageCode)) continue;
    const base64 = await fileToBase64(page.file);
    content.push({
      type: 'text',
      text: `--- Page Type: ${pageCode} (${PAGE_TYPES[pageCode]?.label || 'Unknown'}) ---`
    });
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 }
    });
  }
  if (content.length === 0) {
    throw new Error('NO_PRIMARY_PAGES');
  }
  content.push({ type: 'text', text: 'Extract the unified donation record from the attached pages following the schema and rules in the system prompt. Respond with valid JSON ONLY (no markdown).' });

  const systemBlocks = [
    {
      type: 'text',
      text: DONATION_EXTRACTION_SYSTEM,
      cache_control: { type: 'ephemeral' }
    },
    {
      type: 'text',
      text: DONATION_EXTRACTION_PROMPT,
      cache_control: { type: 'ephemeral' }
    }
  ];

  if (!AI_RUNTIME.isConfigured()) {
    throw new Error('AI runtime gateway is not configured. Start the dev server and verify VITE_RUNTIME_API_BASE.');
  }

  const callStart = Date.now();
  const data = await postRuntimeRequest('/extraction', {
    system: systemBlocks,
    messages: [{ role: 'user', content }],
    maxTokens: 4000
  });
  if (data && data.usage) {
    recordApiCall({
      inputTokens: data.usage.inputTokens || 0,
      outputTokens: data.usage.outputTokens || 0,
      durationMs: Date.now() - callStart,
      pages: pages.length,
      recordTag: pages[0]?.filename || ''
    });
  }
  const rawText = String(data?.text || '');
  if (!rawText) throw new Error('No text content in runtime response');

  const cleaned = extractJsonObject(rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());

  const parseExtractionResult = (jsonText) => {
    const parsed = JSON.parse(jsonText);
    return {
      paymentMethod: parsed.paymentMethod || 'Unknown',
      paymentMethodConf: parsed.paymentMethodConf || 0,
      donor: parsed.donor || {},
      donorConf: parsed.donorConf || {},
      donation: parsed.donation || {},
      donationConf: parsed.donationConf || {},
      boxes: parsed.boxes && typeof parsed.boxes === 'object' ? parsed.boxes : {},
      pageNotes: Array.isArray(parsed.pageNotes) ? parsed.pageNotes : [],
      crossValidation: Array.isArray(parsed.crossValidation) ? parsed.crossValidation : []
    };
  };

  const isAllFieldsEmpty = (result) => {
    const d = result.donation || {};
    const donor = result.donor || {};
    const donorFields = ['name', 'address', 'donorId'];
    const donationFields = ['amount', 'date', 'chequeNo', 'amountWords', 'cardLast4', 'invoiceNo', 'fundName', 'purpose', 'payee'];
    const allEmpty = [...donorFields.map(k => donor[k]), ...donationFields.map(k => d[k])].every(v => !v || String(v).trim() === '');
    return allEmpty;
  };

  try {
    const result = parseExtractionResult(cleaned);

    if (isAllFieldsEmpty(result)) {
      const retryContent = [...content.slice(0, -1), {
        type: 'text',
        text: 'IMPORTANT: The previous response returned all empty fields. Please look more carefully at every area of each page and extract whatever information is visible, even if partially legible. Assign low confidence (20) to uncertain values rather than returning empty strings. Extract the unified donation record now. Respond with valid JSON ONLY (no markdown).'
      }];
      const retryData = await postRuntimeRequest('/extraction', {
        system: systemBlocks,
        messages: [{ role: 'user', content: retryContent }],
        maxTokens: 4000
      });
      const retryRaw = String(retryData?.text || '');
      if (retryRaw) {
        const retryCleaned = extractJsonObject(retryRaw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
        try {
          return parseExtractionResult(retryCleaned);
        } catch (retryErr) {
          // Fall through to return the original empty result
        }
      }
    }

    return result;
  } catch (err) {
    throw new Error(`JSON parse failed: ${err.message}. First 200 chars: ${cleaned.slice(0, 200)}`);
  }
};

// askDigiFind — conversational query over the archive
export const askDigiFind = async (question, archivedRecords, history = []) => {
  if (!AI_RUNTIME.isConfigured()) {
    throw new Error('Runtime gateway not configured');
  }

  const archive = archivedRecords.map(r => ({
    id: r.id,
    recordId: r.recordId || r.id,
    paymentMethod: r.paymentMethod || 'Unknown',
    archivedAt: r.archivedAt || null,
    fields: r.fields || {}
  }));

  const systemPrompt = [
    'You are DigiFind, a conversational analyst over a digital donation-records archive.',
    'You receive the full archive as a JSON array and answer the operator\'s question by reasoning over it.',
    '',
    'RESPONSE FORMAT — CRITICAL:',
    'Return ONLY a single JSON object, no prose before or after, no markdown fences, with this exact shape:',
    '{ "answer": "<your natural-language answer with markdown allowed>", "recordIds": ["<id1>", "<id2>", ...] }',
    '',
    '`answer` is what the operator reads. Be concise and useful. If the archive doesn\'t answer the question, say so plainly.',
    '`recordIds` is the array of archive ids that your answer references or filters to. If the question is a pattern/aggregate question with no specific records (e.g., "what\'s the average gift?"), return an empty array.',
    '',
    'Style:',
    '- Markdown formatting OK in `answer` (bold, lists). No headers (h1-h6).',
    '- Numbers: format USD with $ and commas. Example: $2,500.00.',
    '- Be specific. If you cite a donor, name them. If you cite an amount, state it.',
    '- If the operator references "this batch" or "these records", they likely mean the archive — there is no other context.',
    '- If asked to do something the archive can\'t support (e.g., real-time market data, anything outside the archive), say so.'
  ].join('\n');

  const truncatedHistory = (history || []).slice(-8).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.role === 'user' ? m.text : (m.answer || m.text || '')
  })).filter(m => m.content);

  const userTurn = [
    { type: 'text', text: `ARCHIVE (${archive.length} records):\n\`\`\`json\n${JSON.stringify(archive, null, 2)}\n\`\`\`` },
    { type: 'text', text: `QUESTION: ${question}` }
  ];

  const callStart = Date.now();
  const data = await postRuntimeRequest('/extraction', {
    system: systemPrompt,
    messages: [
      ...truncatedHistory,
      { role: 'user', content: userTurn }
    ],
    maxTokens: 1500
  });

  if (data && data.usage) {
    recordApiCall({
      inputTokens: data.usage.inputTokens || 0,
      outputTokens: data.usage.outputTokens || 0,
      durationMs: Date.now() - callStart,
      pages: 0,
      recordTag: 'DigiFind query'
    });
  }

  const rawText = String(data?.text || '');
  if (!rawText) throw new Error('No text content in runtime response');

  const cleaned = extractJsonObject(rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
  try {
    const parsed = JSON.parse(cleaned);
    return {
      answer: typeof parsed.answer === 'string' ? parsed.answer : String(parsed.answer || ''),
      recordIds: Array.isArray(parsed.recordIds) ? parsed.recordIds.filter(x => typeof x === 'string') : []
    };
  } catch (err) {
    return { answer: cleaned, recordIds: [] };
  }
};
