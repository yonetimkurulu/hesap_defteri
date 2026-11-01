import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import {
  FileSpreadsheet,
  UploadCloud,
  FileCheck2,
  Download,
  BookPlus,
  RefreshCw,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
} from 'lucide-react';
import {
  parseBankStatementPdf,
  exportStatementToExcel,
  type StatementParseResult,
} from '../lib/bankStatementParser';

interface BankConverterProps {
  onImportToLedger: (transactions: {
    date: string;
    description: string;
    amount: number;
    kind: 'income' | 'expense';
  }[]) => void;
  activeLedgerName: string;
}

export function BankConverter({ onImportToLedger, activeLedgerName }: BankConverterProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<StatementParseResult | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [imported, setImported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currency = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });

  const handleFileProcess = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Lütfen geçerli bir banka ekstresi PDF dosyası yükleyin.');
      return;
    }

    setLoading(true);
    setError(null);
    setImported(false);
    setFileName(file.name);

    try {
      const result = await parseBankStatementPdf(file);
      if (result.rows.length === 0) {
        setError('Bu PDF içinde hesap hareketi veya tablo tespit edilemedi. Dosyanın şifresiz ve taranabilir bir banka ekstresi olduğundan emin olun.');
      } else {
        setParseResult(result);
      }
    } catch (err: unknown) {
      console.error(err);
      setError('PDF okunurken bir hata oluştu. Dosya şifreli veya bozuk olabilir.');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileProcess(e.target.files[0]);
    }
  };

  const handleDownloadExcel = () => {
    if (!parseResult) return;
    const excelName = fileName.replace(/\.pdf$/i, '') + '-Cevrilmis.xlsx';
    exportStatementToExcel(parseResult, excelName);
  };

  const handleImportToLedger = () => {
    if (!parseResult) return;
    const mapped = parseResult.rows.map((r) => ({
      date: r.date,
      description: `[${parseResult.bankName}] ${r.description}`,
      amount: r.amount,
      kind: r.type,
    }));

    onImportToLedger(mapped);
    setImported(true);
  };

  const handleRemoveRow = (id: string) => {
    if (!parseResult) return;
    const updatedRows = parseResult.rows.filter((r) => r.id !== id);
    let inSum = 0;
    let outSum = 0;
    for (const r of updatedRows) {
      if (r.type === 'income') inSum += r.amount;
      else outSum += r.amount;
    }
    setParseResult({
      ...parseResult,
      rows: updatedRows,
      totalIncome: inSum,
      totalExpense: outSum,
    });
  };

  const handleReset = () => {
    setParseResult(null);
    setFileName('');
    setError(null);
    setImported(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="bank-converter-wrap">
      <div className="page-heading">
        <div>
          <h1>Banka & PDF Dönüştürücü</h1>
          <p className="muted">
            Ziraat, Vakıfbank, Garanti vb. banka hesap ekstrelerinizi tek tıkla Excel'e çevirin veya defterinize aktarın.
          </p>
        </div>
      </div>

      {!parseResult && (
        <div
          className={`pdf-dropzone ${isDragOver ? 'drag-over' : ''} ${loading ? 'loading' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !loading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />

          {loading ? (
            <div className="dropzone-loading">
              <RefreshCw size={36} className="spin" />
              <strong>PDF Okunuyor ve Tablolar Ayrıştırılıyor...</strong>
              <p>Çok satırlı açıklamalar ve para hareketleri taranıyor, lütfen bekleyin.</p>
            </div>
          ) : (
            <div className="dropzone-idle">
              <div className="upload-icon-circle">
                <UploadCloud size={32} />
              </div>
              <h3>Banka Ekstresi PDF Dosyasını Buraya Sürükleyin</h3>
              <p>veya bilgisayarınızdan seçmek için <strong>tıklayın</strong></p>
              <span className="file-badge">Ziraat · Vakıfbank · Garanti · İş Bankası · Halkbank · Tüm Bankalar</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="converter-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {parseResult && (
        <div className="converter-result-panel">
          {/* Üst Özet Kartı */}
          <div className="result-header-card">
            <div className="result-title-group">
              <div className="bank-badge-icon">
                <FileCheck2 size={24} />
              </div>
              <div>
                <h2>{parseResult.bankName} Ekstresi Başarıyla Okundu</h2>
                <span className="result-filename">{fileName} · {parseResult.rows.length} işlem hareketi</span>
              </div>
            </div>

            <div className="result-actions">
              <button type="button" className="secondary-button" onClick={handleReset}>
                Yeni Dosya Yükle
              </button>
              <button type="button" className="primary-button btn-excel-download" onClick={handleDownloadExcel}>
                <Download size={16} /> Excel İndir (.xlsx)
              </button>
              <button
                type="button"
                className={`primary-button btn-import-ledger ${imported ? 'imported' : ''}`}
                onClick={handleImportToLedger}
                disabled={imported}
              >
                <BookPlus size={16} /> {imported ? 'Deftere Aktarıldı ✓' : `"${activeLedgerName}" Defterine Aktar`}
              </button>
            </div>
          </div>

          {/* Finansal Özet Kartları */}
          <div className="converter-metrics-grid">
            <div className="converter-metric-card positive">
              <div className="c-metric-icon pos">
                <ArrowDownLeft size={20} />
              </div>
              <div>
                <span>Toplam Giriş (Alacak)</span>
                <strong>{currency.format(parseResult.totalIncome)}</strong>
              </div>
            </div>

            <div className="converter-metric-card negative">
              <div className="c-metric-icon neg">
                <ArrowUpRight size={20} />
              </div>
              <div>
                <span>Toplam Çıkış (Borç)</span>
                <strong>{currency.format(parseResult.totalExpense)}</strong>
              </div>
            </div>

            <div className="converter-metric-card info">
              <div className="c-metric-icon inf">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <span>Net Fark</span>
                <strong className={parseResult.totalIncome >= parseResult.totalExpense ? 'positive' : 'negative'}>
                  {currency.format(parseResult.totalIncome - parseResult.totalExpense)}
                </strong>
              </div>
            </div>
          </div>

          {/* Ayrıştırılan Tablo Önizlemesi */}
          <div className="panel converter-table-panel">
            <div className="panel-heading">
              <div>
                <h3>Ayrıştırılan Hareketler Önizlemesi</h3>
                <p className="muted">Excel'e aktarılacak satırları inceleyebilir, istemediğiniz satırları silebilirsiniz.</p>
              </div>
            </div>

            <div className="converter-table-container">
              <table className="converter-table">
                <thead>
                  <tr>
                    <th style={{ width: '105px' }}>İşlem Tarihi</th>
                    <th style={{ width: '75px' }}>Tür</th>
                    <th>Açıklama</th>
                    <th style={{ width: '150px', textAlign: 'right' }}>Tutar</th>
                    <th style={{ width: '150px', textAlign: 'right' }}>Bakiye</th>
                    <th style={{ width: '85px', textAlign: 'center' }}>Referans</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="date-cell">{row.rawDate}</td>
                      <td>
                        <span className={`c-type-pill ${row.type}`}>
                          {row.type === 'income' ? 'Giriş' : 'Çıkış'}
                        </span>
                      </td>
                      <td className="desc-cell" title={row.description}>
                        {row.description}
                      </td>
                      <td className={`amount-cell ${row.type === 'income' ? 'positive' : 'negative'}`} style={{ fontWeight: 600 }}>
                        {row.rawAmount}
                      </td>
                      <td style={{ textAlign: 'right', color: '#475569', fontSize: '12px' }}>
                        {row.rawBalance || (row.balance !== undefined ? currency.format(row.balance) : '-')}
                      </td>
                      <td style={{ textAlign: 'center', color: '#64748b', fontSize: '11px', fontFamily: 'monospace' }}>
                        {row.referenceNo || '-'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="icon-button delete-row-btn"
                          title="Bu satırı kaldır"
                          onClick={() => handleRemoveRow(row.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
