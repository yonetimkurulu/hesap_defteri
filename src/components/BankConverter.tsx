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
  History,
  Eye,
  Clock,
} from 'lucide-react';
import {
  parseBankStatementPdf,
  exportStatementToExcel,
  type StatementParseResult,
  type ParsedBankRow,
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

export interface StatementHistoryItem {
  id: string;
  fileName: string;
  bankName: string;
  parsedAt: string;
  formattedDate: string;
  rowCount: number;
  totalIncome: number;
  totalExpense: number;
  rows: ParsedBankRow[];
}

const STATEMENT_HISTORY_KEY = 'hesap-defteri-statement-history-v1';

function readHistory(): StatementHistoryItem[] {
  try {
    const raw = localStorage.getItem(STATEMENT_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: StatementHistoryItem[]) {
  localStorage.setItem(STATEMENT_HISTORY_KEY, JSON.stringify(items.slice(0, 25)));
}

export function BankConverter({ onImportToLedger, activeLedgerName }: BankConverterProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<StatementParseResult | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [imported, setImported] = useState(false);
  const [history, setHistory] = useState<StatementHistoryItem[]>(readHistory);
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

        // Geçmişe ekle / güncelle
        const now = new Date();
        const formattedDate = new Intl.DateTimeFormat('tr-TR', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(now);

        const newHistoryItem: StatementHistoryItem = {
          id: crypto.randomUUID(),
          fileName: file.name,
          bankName: result.bankName,
          parsedAt: now.toISOString(),
          formattedDate,
          rowCount: result.rows.length,
          totalIncome: result.totalIncome,
          totalExpense: result.totalExpense,
          rows: result.rows,
        };

        const updatedHistory = [newHistoryItem, ...history.filter((h) => h.fileName !== file.name)];
        setHistory(updatedHistory);
        saveHistory(updatedHistory);
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
      totalIncome: inSum,
      totalExpense: outSum,
      rows: updatedRows,
    });
  };

  const handleLoadFromHistory = (item: StatementHistoryItem) => {
    setParseResult({
      bankName: item.bankName,
      totalIncome: item.totalIncome,
      totalExpense: item.totalExpense,
      rows: item.rows,
    });
    setFileName(item.fileName);
    setImported(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDownloadFromHistory = (item: StatementHistoryItem) => {
    const excelName = item.fileName.replace(/\.pdf$/i, '') + '-Cevrilmis.xlsx';
    exportStatementToExcel(
      {
        bankName: item.bankName,
        totalIncome: item.totalIncome,
        totalExpense: item.totalExpense,
        rows: item.rows,
      },
      excelName
    );
  };

  const handleDeleteHistoryItem = (id: string) => {
    const updated = history.filter((h) => h.id !== id);
    setHistory(updated);
    saveHistory(updated);
  };

  const handleClearHistory = () => {
    if (window.confirm('Tüm dönüştürülmüş ekstre geçmişi temizlensin mi?')) {
      setHistory([]);
      localStorage.removeItem(STATEMENT_HISTORY_KEY);
    }
  };

  return (
    <div className="bank-converter-wrap">
      {/* Sayfa Başlığı */}
      <div className="converter-header">
        <div>
          <h2>Banka & PDF Dönüştürücü</h2>
          <p className="muted">
            Ziraat, Vakıf Katılım, Garanti vb. banka hesap ekstrelerinizi tek tıkla Excel'e çevirin veya defterinize aktarın.
          </p>
        </div>
      </div>

      {/* Sürükle - Bırak Yükleme Alanı */}
      <div
        className={`converter-dropzone ${isDragOver ? 'drag-over' : ''} ${loading ? 'loading' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInput}
          accept="application/pdf"
          style={{ display: 'none' }}
        />

        {loading ? (
          <div className="dropzone-content">
            <RefreshCw size={36} className="spin dropzone-icon" />
            <h3>Ekstre Ayrıştırılıyor...</h3>
            <p>PDF tablosu okunuyor, satırlar ve tutarlar ayıklanıyor.</p>
          </div>
        ) : (
          <div className="dropzone-content">
            <div className="dropzone-icon-wrap">
              <UploadCloud size={38} />
            </div>
            <h3>Banka Ekstresi PDF Dosyasını Buraya Sürükleyin</h3>
            <p>veya bilgisayarınızdan seçmek için <span>tıklayın</span></p>
            <span className="dropzone-hint">Vakıf Katılım, Ziraat, VakıfBank, Garanti, İş Bankası vb. tüm bankalar desteklenir</span>
          </div>
        )}
      </div>

      {error && (
        <div className="notice converter-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Ayrıştırma Sonuç Alanı */}
      {parseResult && (
        <div className="converter-results">
          {/* Üst Bilgi Çubuğu & İşlem Butonları */}
          <div className="converter-top-card">
            <div className="bank-badge-info">
              <div className="bank-logo-icon">
                <FileCheck2 size={24} />
              </div>
              <div>
                <h4>{parseResult.bankName} Ekstresi Başarıyla Okundu</h4>
                <p>
                  {fileName} · <strong>{parseResult.rows.length} işlem hareketi</strong>
                </p>
              </div>
            </div>

            <div className="converter-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setParseResult(null);
                  setFileName('');
                }}
              >
                Yeni Dosya Yükle
              </button>
              <button
                type="button"
                className="primary-button btn-download-excel"
                onClick={handleDownloadExcel}
              >
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
                        {row.type === 'income' ? `+${currency.format(row.amount)}` : `-${currency.format(row.amount)}`}
                      </td>
                      <td style={{ textAlign: 'right', color: '#475569', fontSize: '12px', fontWeight: 500 }}>
                        {row.balance !== undefined ? currency.format(row.balance) : (row.rawBalance || '-')}
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

      {/* Dönüştürülen Ekstre Geçmişi Bölümü */}
      <div className="panel statement-history-panel">
        <div className="history-panel-header">
          <div className="history-title-group">
            <History size={20} />
            <div>
              <h3>Dönüştürülen Ekstre Geçmişi</h3>
              <p className="muted">Daha önce yükleyip Excel'e dönüştürdüğünüz ekstreler burada saklanır; istediğiniz zaman tekrar indirebilirsiniz.</p>
            </div>
          </div>
          {history.length > 0 && (
            <button type="button" className="secondary-button btn-xs text-danger" onClick={handleClearHistory}>
              Geçmişi Temizle
            </button>
          )}
        </div>

        {history.length > 0 ? (
          <div className="statement-history-list">
            {history.map((item) => (
              <div key={item.id} className="history-item-row">
                <div className="history-item-main">
                  <div className="history-item-badge">
                    <FileSpreadsheet size={20} />
                  </div>
                  <div className="history-item-info">
                    <div className="history-item-title">
                      <strong>{item.fileName}</strong>
                      <span className="bank-pill">{item.bankName}</span>
                      <span className="count-pill">{item.rowCount} İşlem</span>
                    </div>
                    <span className="history-item-time">{item.formattedDate}</span>
                  </div>
                </div>

                <div className="history-item-totals">
                  <span className="pos">+{currency.format(item.totalIncome)}</span>
                  <span className="neg">-{currency.format(item.totalExpense)}</span>
                </div>

                <div className="history-item-actions">
                  <button
                    type="button"
                    className="secondary-button btn-sm"
                    title="Önizlemeyi ekranda aç"
                    onClick={() => handleLoadFromHistory(item)}
                  >
                    <Eye size={14} /> Aç
                  </button>
                  <button
                    type="button"
                    className="primary-button btn-sm"
                    title="Excel olarak indir"
                    onClick={() => handleDownloadFromHistory(item)}
                  >
                    <Download size={14} /> Excel İndir
                  </button>
                  <button
                    type="button"
                    className="icon-button delete-row-btn"
                    title="Geçmişten sil"
                    onClick={() => handleDeleteHistoryItem(item.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="history-empty">
            <Clock size={24} />
            <p>Henüz dönüştürülmüş ekstre geçmişi bulunmuyor. Bir PDF yüklediğinizde burada listelenecektir.</p>
          </div>
        )}
      </div>
    </div>
  );
}
