import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  formatFinancialDate,
  IMPORT_MAX_ROWS,
  importCommitResponse,
  importPreviewResponse,
  STATEMENT_DATE_FORMATS,
  type ImportCommitResponse,
  type ImportPreviewResponse,
  type ImportRow,
  type StatementDateFormat,
} from '@smartfin/shared';
import { api } from '../api/client';
import { useMoneyMutation } from '../api/queries';
import { useLookups } from '../lib/lookups';
import {
  buildRows,
  columnNames,
  dataRows,
  guessMapping,
  readStatementFile,
  type AmountMode,
  type Mapping,
  type Sheet,
} from '../lib/statement-file';
import { Amount, Badge, Button, Card, ErrorState, PageHeader } from '../ui/components';
import { SelectField } from '../ui/fields';
import './pages.css';

type Step = 'file' | 'map' | 'review' | 'done';
const STEP_LABELS: Record<Step, string> = {
  file: '1. Choose file',
  map: '2. Match columns',
  review: '3. Review',
  done: '4. Done',
};
const SHOW_ROWS = 300;

export function ImportStatement() {
  const lookups = useLookups();
  const active = lookups.accountList.filter((a) => a.status === 'active');
  const [step, setStep] = useState<Step>('file');
  const [accountId, setAccountId] = useState('');
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<Sheet>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [unreadable, setUnreadable] = useState<number[]>([]);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [include, setInclude] = useState<Record<number, boolean>>({});
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [result, setResult] = useState<ImportCommitResponse | null>(null);
  const selectedAccount = accountId || active[0]?.id || '';

  const previewMutation = useMutation({
    mutationFn: (body: unknown) =>
      api('POST', '/imports/preview', { body, schema: importPreviewResponse }),
    onSuccess: (data) => {
      setPreview(data);
      setInclude(Object.fromEntries(data.rows.map((r) => [r.rowNumber, r.duplicate !== 'likely'])));
      setIdempotencyKey(crypto.randomUUID());
      setStep('review');
    },
  });
  const commit = useMoneyMutation((body: unknown) =>
    api('POST', '/imports/commit', {
      body,
      schema: importCommitResponse,
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  );

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    try {
      const parsed = await readStatementFile(file);
      if (parsed.length === 0) throw new Error('The file has no rows.');
      setSheet(parsed);
      setFileName(file.name);
      setMapping(guessMapping(parsed));
      setStep('map');
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Couldn’t read the file.');
    }
  }

  function toReview() {
    if (!mapping) return;
    const built = buildRows(sheet, mapping);
    setRows(built.rows);
    setUnreadable(built.unreadable);
    if (built.rows.length === 0 || built.rows.length > IMPORT_MAX_ROWS) return;
    previewMutation.mutate({ accountId: selectedAccount, rows: built.rows });
  }

  const includedCount = preview ? preview.rows.filter((r) => include[r.rowNumber]).length : 0;

  return (
    <div className="page">
      <PageHeader
        title="Import a bank statement"
        description="Your file is read in this browser; only the date, amount, description and reference of each row are sent to SmartFin."
      />
      <ol className="steps">
        {(Object.keys(STEP_LABELS) as Step[]).map((s) => (
          <li key={s} aria-current={s === step ? 'step' : undefined}>
            {STEP_LABELS[s]}
          </li>
        ))}
      </ol>

      {step === 'file' ? (
        <Card title="Choose the statement">
          {active.length === 0 ? (
            <p>
              <Link to="/accounts/new">Add an account</Link> first. Statements are imported into an
              account.
            </p>
          ) : (
            <div className="stack">
              <SelectField
                label="Account this statement belongs to"
                value={selectedAccount}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {active.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nickname}
                  </option>
                ))}
              </SelectField>
              <div className="field">
                <label className="field-label" htmlFor="statement-file">
                  Statement file (.csv or .xlsx, up to 5 MB)
                </label>
                <input
                  id="statement-file"
                  type="file"
                  accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
                <p className="field-hint">
                  Download it from your bank’s website or app. PDF statements aren’t supported.
                </p>
              </div>
              {fileError ? (
                <p className="form-error" role="alert">
                  {fileError}
                </p>
              ) : null}
            </div>
          )}
        </Card>
      ) : null}

      {step === 'map' && mapping ? (
        <MapColumns
          sheet={sheet}
          mapping={mapping}
          onChange={setMapping}
          fileName={fileName}
          busy={previewMutation.isPending}
          error={previewMutation.error}
          builtCount={rows.length}
          unreadable={unreadable}
          onBack={() => setStep('file')}
          onNext={toReview}
        />
      ) : null}

      {step === 'review' && preview ? (
        <Card
          title="Review"
          subtitle={`${preview.counts.total} rows read from ${fileName}${unreadable.length ? `; ${unreadable.length} rows without a date or amount were left out` : ''}.`}
        >
          <div className="stack">
            <p>
              {preview.counts.likely > 0 ? (
                <Badge tone="warning">{preview.counts.likely} likely duplicates</Badge>
              ) : null}{' '}
              {preview.counts.possible > 0 ? (
                <Badge tone="info">{preview.counts.possible} possible duplicates</Badge>
              ) : null}{' '}
              {preview.counts.likely + preview.counts.possible === 0 ? (
                <Badge tone="success">No duplicates found</Badge>
              ) : null}
            </p>
            <p className="field-hint">
              Likely duplicates match an existing transaction’s reference, or its date, amount and
              description, so they’re unticked. Possible duplicates have the same amount within two
              days; check them. Imported rows arrive uncategorised; categorise them afterwards.
            </p>
            <div className="form-actions" style={{ marginTop: 0 }}>
              <Button
                className="btn-small"
                onClick={() =>
                  setInclude(Object.fromEntries(preview.rows.map((r) => [r.rowNumber, true])))
                }
              >
                Tick all
              </Button>
              <Button
                className="btn-small"
                onClick={() =>
                  setInclude(
                    Object.fromEntries(
                      preview.rows.map((r) => [r.rowNumber, r.duplicate === 'none']),
                    ),
                  )
                }
              >
                Untick all duplicates
              </Button>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Import</th>
                    <th scope="col">Date</th>
                    <th scope="col">Description</th>
                    <th scope="col" className="num">
                      Amount
                    </th>
                    <th scope="col">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, SHOW_ROWS).map((r) => (
                    <tr key={r.rowNumber}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Import row ${r.rowNumber}`}
                          checked={include[r.rowNumber] ?? false}
                          onChange={(e) =>
                            setInclude({ ...include, [r.rowNumber]: e.target.checked })
                          }
                        />
                      </td>
                      <td>{formatFinancialDate(r.valueDate)}</td>
                      <td>{r.description ?? <span className="muted">No description</span>}</td>
                      <td className="num">
                        <Amount value={r.amount} direction={r.type === 'income' ? 'in' : 'out'} />
                      </td>
                      <td>
                        {r.duplicate === 'likely' ? (
                          <Badge tone="warning">Likely duplicate</Badge>
                        ) : r.duplicate === 'possible' ? (
                          <Badge tone="info">Possible duplicate</Badge>
                        ) : (
                          <Badge tone="success">New</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > SHOW_ROWS ? (
              <p className="field-hint">
                Showing the first {SHOW_ROWS} of {preview.rows.length} rows. The rest are imported
                with the same rule (likely duplicates skipped).
              </p>
            ) : null}
            {commit.isError ? <ErrorState error={commit.error} /> : null}
            <div className="form-actions" style={{ marginTop: 0 }}>
              <Button
                variant="primary"
                disabled={commit.isPending || includedCount === 0}
                onClick={() =>
                  commit.mutate(
                    {
                      accountId: selectedAccount,
                      fileName,
                      rows: rows.map((r) => ({ ...r, include: include[r.rowNumber] ?? false })),
                    },
                    {
                      onSuccess: (data) => {
                        setResult(data);
                        setStep('done');
                      },
                    },
                  )
                }
              >
                {commit.isPending
                  ? 'Importing…'
                  : `Import ${includedCount} transaction${includedCount === 1 ? '' : 's'}`}
              </Button>
              <Button variant="ghost" onClick={() => setStep('map')}>
                Back
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {step === 'done' && result ? (
        <Card title="Import complete">
          <div className="stack">
            <p>
              Imported <strong>{result.imported}</strong> transaction
              {result.imported === 1 ? '' : 's'} into{' '}
              {lookups.accounts.get(selectedAccount)?.nickname}; skipped {result.skipped}.
            </p>
            <div className="form-actions" style={{ marginTop: 0 }}>
              <Link
                to={`/transactions?importBatchId=${result.batchId}`}
                className="btn btn-primary"
              >
                Review imported transactions
              </Link>
              <Link to={`/accounts/${selectedAccount}`} className="btn btn-secondary">
                Check the account balance
              </Link>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function MapColumns({
  sheet,
  mapping,
  onChange,
  fileName,
  busy,
  error,
  builtCount,
  unreadable,
  onBack,
  onNext,
}: {
  sheet: Sheet;
  mapping: Mapping;
  onChange: (m: Mapping) => void;
  fileName: string;
  busy: boolean;
  error: unknown;
  builtCount: number;
  unreadable: number[];
  onBack: () => void;
  onNext: () => void;
}) {
  const names = columnNames(sheet, mapping.headerRow);
  const sample = dataRows(sheet, mapping.headerRow).slice(0, 5);
  const set = <K extends keyof Mapping>(key: K, value: Mapping[K]) =>
    onChange({ ...mapping, [key]: value });
  const columnSelect = (
    label: string,
    key: 'date' | 'description' | 'reference' | 'amount' | 'debit' | 'credit' | 'drcr',
    optional = false,
  ) => (
    <SelectField
      label={label}
      optional={optional}
      value={mapping[key]}
      onChange={(e) => set(key, Number(e.target.value))}
    >
      <option value={-1}>{optional ? 'None' : 'Choose a column'}</option>
      {names.map((n, i) => (
        <option key={i} value={i}>
          {n}
        </option>
      ))}
    </SelectField>
  );
  const ready =
    mapping.date >= 0 &&
    (mapping.amountMode === 'split'
      ? mapping.debit >= 0 || mapping.credit >= 0
      : mapping.amount >= 0) &&
    (mapping.amountMode !== 'drcr' || mapping.drcr >= 0);

  return (
    <Card title="Match columns" subtitle={`We guessed from ${fileName}. Check the preview below.`}>
      <div className="stack">
        <div className="form-grid">
          <SelectField
            label="Column names are in"
            value={mapping.headerRow}
            onChange={(e) => onChange(guessMapping(sheet, Number(e.target.value)))}
          >
            <option value={-1}>No header row</option>
            {sheet.slice(0, 25).map((_, i) => (
              <option key={i} value={i}>
                Row {i + 1}
              </option>
            ))}
          </SelectField>
          {columnSelect('Date', 'date')}
          <SelectField
            label="Date format"
            value={mapping.dateFormat}
            onChange={(e) => set('dateFormat', e.target.value as StatementDateFormat)}
          >
            {STATEMENT_DATE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </SelectField>
          {columnSelect('Description', 'description', true)}
          {columnSelect('Reference', 'reference', true)}
          <SelectField
            label="Amounts are"
            value={mapping.amountMode}
            onChange={(e) => set('amountMode', e.target.value as AmountMode)}
          >
            <option value="split">Separate debit and credit columns</option>
            <option value="signed">One column, negative = money out</option>
            <option value="drcr">One column plus a Dr/Cr column</option>
          </SelectField>
          {mapping.amountMode === 'split' ? (
            <>
              {columnSelect('Debit (money out)', 'debit')}
              {columnSelect('Credit (money in)', 'credit')}
            </>
          ) : (
            <>
              {columnSelect('Amount', 'amount')}
              {mapping.amountMode === 'drcr' ? columnSelect('Dr/Cr column', 'drcr') : null}
            </>
          )}
        </div>

        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">First rows of the file</caption>
            <thead>
              <tr>
                {names.map((n, i) => (
                  <th key={i} scope="col">
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sample.map((row, r) => (
                <tr key={r}>
                  {names.map((_, c) => (
                    <td key={c}>
                      {row[c] instanceof Date
                        ? (row[c] as Date).toISOString().slice(0, 10)
                        : String(row[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {builtCount === 0 && unreadable.length > 0 ? (
          <p className="form-error" role="alert">
            No row had a readable date and amount. Check the date format and the amount columns.
          </p>
        ) : null}
        {builtCount > IMPORT_MAX_ROWS ? (
          <p className="form-error" role="alert">
            The file has more than {IMPORT_MAX_ROWS} transactions. Split it into smaller periods.
          </p>
        ) : null}
        {error ? <ErrorState error={error} /> : null}
        <div className="form-actions" style={{ marginTop: 0 }}>
          <Button variant="primary" onClick={onNext} disabled={!ready || busy}>
            {busy ? 'Checking for duplicates…' : 'Continue'}
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Choose another file
          </Button>
        </div>
        {!ready ? (
          <p className="field-hint">Choose the date column and the amount column(s) to continue.</p>
        ) : null}
      </div>
    </Card>
  );
}
