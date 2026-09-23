import { useState } from 'react';
import { bulkAllotOfficerCodes } from '../services/api';
import {
  guessColumnMapping,
  parseTeacherRows,
  buildAllotments,
  buildWhatsAppLink,
  fillMessageTemplate,
  DEFAULT_MESSAGE_TEMPLATE
} from '../utils/bulkAllot';
import type { ColumnMapping, ParsedTeacherRow } from '../utils/bulkAllot';
import type { Branch } from '../types/election';
import type { BulkAllotedCode } from '../types/api';

interface BulkAllotCodesModalProps {
  adminSecret: string;
  branch: Branch;
  onClose: () => void;
  // Called after a successful bulk-allot so the parent can refresh the
  // Officer Codes roster below.
  onAllotted: () => void;
}

type Step = 'upload' | 'mapping' | 'preview' | 'results';

// exceljs cell values can be a plain scalar, a Date, or an object (rich
// text, hyperlink, formula result) depending on how the cell was authored
// -- this collapses any of those down to the plain text a human typed.
const cellToText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    const obj = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: unknown }> };
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((part) => String(part.text ?? '')).join('');
    }
    if (obj.text !== undefined) {
      return String(obj.text);
    }
    if (obj.result !== undefined) {
      return String(obj.result);
    }
    if (value instanceof Date) {
      return value.toLocaleDateString('en-GB');
    }
    return '';
  }
  return String(value).trim();
};

export const BulkAllotCodesModal = ({ adminSecret, branch, onClose, onAllotted }: BulkAllotCodesModalProps): JSX.Element => {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, unknown>>>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ name: '', phone: '', school: '', house: '' });
  const [parsedRows, setParsedRows] = useState<ParsedTeacherRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCodes, setCreatedCodes] = useState<BulkAllotedCode[]>([]);
  const [phoneByName, setPhoneByName] = useState<Record<string, string | undefined>>({});
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_MESSAGE_TEMPLATE);

  const handleFile = async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const ExcelJS = await import('exceljs');
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('No sheet found in this file');
      }

      const foundHeaders: string[] = [];
      worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
        foundHeaders[colNumber - 1] = cellToText(cell.value);
      });
      if (foundHeaders.filter(Boolean).length === 0) {
        throw new Error('Could not find a header row -- make sure row 1 has column names');
      }

      const rows: Array<Record<string, unknown>> = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          return;
        }
        const rowData: Record<string, unknown> = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const header = foundHeaders[colNumber - 1];
          if (header) {
            rowData[header] = cellToText(cell.value);
          }
        });
        if (Object.values(rowData).some((value) => String(value ?? '').trim() !== '')) {
          rows.push(rowData);
        }
      });

      const cleanHeaders = foundHeaders.filter(Boolean);
      const guess = guessColumnMapping(cleanHeaders);
      setFileName(file.name);
      setHeaders(cleanHeaders);
      setRawRows(rows);
      setMapping({ name: guess.name ?? '', phone: guess.phone ?? '', school: guess.school ?? '', house: guess.house ?? '' });
      setStep('mapping');
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Could not read this file');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmMapping = () => {
    if (!mapping.name || !mapping.phone) {
      setError('Choose at least the Name and WhatsApp Number columns');
      return;
    }
    setError(null);
    setParsedRows(parseTeacherRows(rawRows, mapping));
    setStep('preview');
  };

  const cleanRows = parsedRows.filter((row) => row.errors.length === 0);
  const errorRows = parsedRows.filter((row) => row.errors.length > 0);
  const allotments = buildAllotments(cleanRows);
  const schoolCount = allotments.filter((a) => a.electionType === 'school').length;
  const houseCount = allotments.filter((a) => a.electionType === 'house').length;

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await bulkAllotOfficerCodes(branch, allotments, adminSecret);
      setCreatedCodes(response.codes);
      setPhoneByName(Object.fromEntries(cleanRows.map((row) => [row.name, row.phone])));
      setStep('results');
      onAllotted();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to allot codes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '1.25rem', backgroundColor: '#f3f4f6', borderRadius: '8px', border: '2px solid #3b82f6', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0 }}>📋 Bulk Allot from List -- {branch === 'AN' ? 'AN' : 'Dwarka'}</h3>
        <button type="button" className="button" style={{ backgroundColor: '#6b7280' }} onClick={onClose}>
          Close
        </button>
      </div>

      {error && <p style={{ color: '#dc2626', fontWeight: 600, marginBottom: '0.75rem' }}>{error}</p>}

      {step === 'upload' && (
        <div>
          <p style={{ margin: '0 0 0.75rem 0' }}>
            Upload the {branch === 'AN' ? 'AN' : 'Dwarka'} teacher list (.xlsx) -- one row per teacher, with columns
            for name, WhatsApp number, School duty (Yes/blank), and House duty (house name/blank). A teacher with
            both gets two separate codes.
          </p>
          <input
            type="file"
            accept=".xlsx"
            disabled={loading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleFile(file);
              }
            }}
          />
          {loading && <p style={{ marginTop: '0.5rem', color: '#6b7280' }}>Reading file...</p>}
        </div>
      )}

      {step === 'mapping' && (
        <div>
          <p style={{ margin: '0 0 0.75rem 0' }}>
            <strong>{fileName}</strong> -- {rawRows.length} row{rawRows.length === 1 ? '' : 's'} found. Confirm which
            column is which (guessed automatically -- correct any that are wrong):
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
            {(
              [
                ['name', 'Teacher Name'],
                ['phone', 'WhatsApp Number'],
                ['school', 'School Duty (Yes/blank)'],
                ['house', 'House Duty (house name/blank)']
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <label className="form-label" htmlFor={`bulk-map-${field}`}>{label}</label>
                <select
                  id={`bulk-map-${field}`}
                  className="form-input"
                  style={{ width: '220px' }}
                  value={mapping[field]}
                  onChange={(event) => setMapping((prev) => ({ ...prev, [field]: event.target.value }))}
                >
                  <option value="">-- none --</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="button" onClick={handleConfirmMapping}>Continue</button>
            <button type="button" className="button" style={{ backgroundColor: '#6b7280' }} onClick={() => setStep('upload')}>
              &larr; Back
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div>
          <p style={{ margin: '0 0 0.75rem 0' }}>
            {cleanRows.length} teacher{cleanRows.length === 1 ? '' : 's'} ready &rarr; {schoolCount} School code
            {schoolCount === 1 ? '' : 's'} + {houseCount} House code{houseCount === 1 ? '' : 's'} = {allotments.length}{' '}
            code{allotments.length === 1 ? '' : 's'} total.
            {errorRows.length > 0 && (
              <span style={{ color: '#dc2626', fontWeight: 600 }}> {errorRows.length} row{errorRows.length === 1 ? '' : 's'} will be skipped (see below).</span>
            )}
          </p>
          <div style={{ maxHeight: '360px', overflowY: 'auto', marginBottom: '1rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '0.4rem' }}>Row</th>
                  <th style={{ padding: '0.4rem' }}>Name</th>
                  <th style={{ padding: '0.4rem' }}>Phone</th>
                  <th style={{ padding: '0.4rem' }}>Duty</th>
                  <th style={{ padding: '0.4rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map((row) => (
                  <tr key={row.rowNumber} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: row.errors.length > 0 ? '#fef2f2' : undefined }}>
                    <td style={{ padding: '0.4rem' }}>{row.rowNumber}</td>
                    <td style={{ padding: '0.4rem' }}>{row.name || <em>(blank)</em>}</td>
                    <td style={{ padding: '0.4rem' }}>
                      {row.phone ?? (
                        <span style={{ color: '#92400e' }} title={`Could not parse "${row.rawPhone}"`}>
                          ⚠ no valid number
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.4rem' }}>
                      {[row.schoolDuty ? 'School' : null, row.house ? `${row.house} House` : null].filter(Boolean).join(' + ') || '--'}
                    </td>
                    <td style={{ padding: '0.4rem', color: row.errors.length > 0 ? '#dc2626' : '#16a34a' }}>
                      {row.errors.length > 0 ? row.errors.join('; ') : 'OK'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="button" onClick={handleSubmit} disabled={loading || allotments.length === 0}>
              {loading ? 'Allotting codes...' : `Allot ${allotments.length} Code${allotments.length === 1 ? '' : 's'}`}
            </button>
            <button type="button" className="button" style={{ backgroundColor: '#6b7280' }} onClick={() => setStep('mapping')} disabled={loading}>
              &larr; Back
            </button>
          </div>
        </div>
      )}

      {step === 'results' && (
        <div>
          <p style={{ margin: '0 0 0.75rem 0', fontWeight: 600, color: '#16a34a' }}>
            ✓ {createdCodes.length} code{createdCodes.length === 1 ? '' : 's'} allotted. Now send each one on
            WhatsApp -- click "Send", then hit Send inside WhatsApp. Nothing is sent automatically.
          </p>
          <label className="form-label" htmlFor="bulk-message-template">Message template</label>
          <textarea
            id="bulk-message-template"
            className="form-input"
            style={{ width: '100%', minHeight: '110px', fontFamily: 'inherit' }}
            value={messageTemplate}
            onChange={(event) => setMessageTemplate(event.target.value)}
          />
          <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '0.25rem 0 1rem 0' }}>
            Placeholders: {'{name}'}, {'{code}'}, {'{duty}'}, {'{branch}'} -- filled in per teacher below.
          </p>
          <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '0.4rem' }}>Name</th>
                  <th style={{ padding: '0.4rem' }}>Duty</th>
                  <th style={{ padding: '0.4rem' }}>Code</th>
                  <th style={{ padding: '0.4rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {createdCodes.map((entry) => {
                  const duty = entry.electionType === 'house' ? `${entry.house} House` : 'School';
                  const phone = phoneByName[entry.officerName];
                  const message = fillMessageTemplate(messageTemplate, {
                    name: entry.officerName,
                    code: entry.code,
                    duty,
                    branch: branch === 'AN' ? 'AN' : 'Dwarka'
                  });
                  return (
                    <tr key={entry.code} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.4rem' }}>{entry.officerName}</td>
                      <td style={{ padding: '0.4rem' }}>{duty}</td>
                      <td style={{ padding: '0.4rem', fontFamily: 'monospace', fontWeight: 700 }}>{entry.code}</td>
                      <td style={{ padding: '0.4rem' }}>
                        {phone ? (
                          <a className="button" style={{ display: 'inline-block', backgroundColor: '#16a34a' }} href={buildWhatsAppLink(phone, message)} target="_blank" rel="noreferrer">
                            Send via WhatsApp
                          </a>
                        ) : (
                          <span style={{ color: '#92400e' }}>No valid number -- send manually</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
