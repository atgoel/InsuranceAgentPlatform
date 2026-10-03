import { useState, useRef } from 'react';
import { useT } from '../../../../lib/i18n';
import { parseCSV, sha256 } from '../../import/csv';
import { MAX_IMPORT_ROWS } from '../../import/mapping';

interface UploadStepProps {
  onNext: (text: string, checksum: string, headers: string[], rows: string[][]) => void;
}

export function UploadStep({ onNext }: UploadStepProps) {
  const { t } = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | undefined>();
  const [fileName, setFileName] = useState<string | undefined>();
  const [preview, setPreview] = useState<string[][] | undefined>();

  const handleFileSelect = async (file: File) => {
    try {
      setError(undefined);
      const text = await file.text();
      const check = await sha256(text);
      const parsed = parseCSV(text);
      if (parsed.length < 2) {
        setError(t('crm.import.file_too_small'));
        return;
      }
      if (parsed.length - 1 > MAX_IMPORT_ROWS) {
        setError(t('crm.import.too_many_rows', { max: MAX_IMPORT_ROWS }));
        return;
      }
      setFileName(file.name);
      setPreview(parsed.slice(0, 6));
      onNext(text, check, parsed[0], parsed.slice(1));
    } catch {
      setError(t('crm.import.parse_error'));
    }
  };

  return (
    <div className="import-step">
      <h2>{t('crm.import.step_upload')}</h2>
      <p>{t('crm.import.upload_instruction')}</p>

      <div className="file-input-wrapper">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          aria-label={t('crm.import.select_file')}
        />
        <button
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
        >
          {t('crm.import.choose_file')}
        </button>
        {fileName && <span className="file-name">{fileName}</span>}
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {preview && (
        <div className="file-preview">
          <h3>{t('crm.import.preview')}</h3>
          <table>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
