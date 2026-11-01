import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

// Vite / browser ortamında worker ayarı
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export interface ParsedBankRow {
  id: string;
  date: string;          // YYYY-MM-DD
  rawDate: string;       // GG.AA.YYYY
  description: string;   // Açıklama (birleştirilmiş)
  amount: number;        // Pozitif sayı
  type: 'income' | 'expense'; // Gelir (Giriş) veya Gider (Çıkış)
  balance?: number;      // Bakiye (varsa)
  rawAmount: string;
}

export interface StatementParseResult {
  bankName: string;
  totalIncome: number;
  totalExpense: number;
  rows: ParsedBankRow[];
}

/**
 * Türk Lirası tutar string'ini sayıya çevirir.
 * Örn: "125.450,50" -> 125450.50
 * Örn: "1,250.00" -> 1250.00
 */
export function parseTrAmount(str: string): number {
  if (!str) return 0;
  let clean = str.trim().replace(/[^\d.,\-+]/g, '');
  if (!clean) return 0;

  // Türk formatı: 1.250,50
  if (clean.includes(',') && clean.includes('.')) {
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }

  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

/**
 * GG.AA.YYYY formatındaki tarihi YYYY-MM-DD formatına çevirir.
 */
export function normalizeDate(dateStr: string): string {
  const match = dateStr.match(/^(\d{2})[./\-](\d{2})[./\-](\d{4})/);
  if (!match) return dateStr;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

interface TextItemWithPos {
  text: string;
  x: number;
  y: number;
  page: number;
}

/**
 * PDF dosyasını okuyup koordinatlarına göre satır ve sütunlara ayırır.
 */
export async function parseBankStatementPdf(file: File): Promise<StatementParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const allItems: TextItemWithPos[] = [];
  let detectedBank = 'Banka Ekstresi';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    for (const item of textContent.items) {
      if ('str' in item && item.str.trim()) {
        const text = item.str.trim();
        // transform[4] = X, transform[5] = Y
        const x = Math.round(item.transform[4]);
        const y = Math.round(item.transform[5]);

        allItems.push({ text, x, y, page: pageNum });

        const lower = text.toLowerCase();
        if (lower.includes('ziraat')) detectedBank = 'Ziraat Bankası';
        else if (lower.includes('vakıf') || lower.includes('vakifbank')) detectedBank = 'VakıfBank';
        else if (lower.includes('garanti')) detectedBank = 'Garanti BBVA';
        else if (lower.includes('iş bank') || lower.includes('isbank')) detectedBank = 'İş Bankası';
        else if (lower.includes('halkbank')) detectedBank = 'Halkbank';
        else if (lower.includes('akbank')) detectedBank = 'Akbank';
        else if (lower.includes('yapı kredi') || lower.includes('yapi kredi')) detectedBank = 'Yapı Kredi';
        else if (lower.includes('qnb') || lower.includes('finansbank')) detectedBank = 'QNB Finansbank';
      }
    }
  }

  // Sayfa ve Y koordinatına göre satır gruplama (Y toleransı 4px)
  const rowsByPageAndY: Record<string, TextItemWithPos[]> = {};

  for (const item of allItems) {
    // PDF koordinatında Y yukarıdan aşağıya azaldığı için sayfa + yaklaşık Y grubu yapıyoruz
    const roundedY = Math.round(item.y / 5) * 5;
    const key = `p${item.page}_y${roundedY}`;

    if (!rowsByPageAndY[key]) {
      rowsByPageAndY[key] = [];
    }
    rowsByPageAndY[key].push(item);
  }

  // Satırları X eksenine göre soldan sağa sırala
  const sortedRowKeys = Object.keys(rowsByPageAndY).sort((a, b) => {
    const [pA, yA] = a.replace('p', '').split('_y').map(Number);
    const [pB, yB] = b.replace('p', '').split('_y').map(Number);
    if (pA !== pB) return pA - pB;
    return yB - yA; // Y koordinatı yukarıdan aşağıya azalır
  });

  const parsedLines: string[][] = [];
  for (const key of sortedRowKeys) {
    const items = rowsByPageAndY[key].sort((a, b) => a.x - b.x);
    parsedLines.push(items.map((it) => it.text));
  }

  // Satırlardan işlem hareketlerini ayıklama
  const transactions: ParsedBankRow[] = [];
  const dateRegex = /\b(\d{2}[./\-]\d{2}[./\-]\d{4})\b/;
  const amountRegex = /([+\-]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/;

  let currentRow: Partial<ParsedBankRow> | null = null;

  for (const line of parsedLines) {
    const lineStr = line.join(' ');

    // Başlık satırlarını atla
    if (
      lineStr.toLowerCase().includes('bakiye') &&
      lineStr.toLowerCase().includes('tarih') &&
      lineStr.toLowerCase().includes('tutar')
    ) {
      continue;
    }

    const dateMatch = lineStr.match(dateRegex);

    if (dateMatch) {
      // Önceki satırı kaydet
      if (currentRow && currentRow.rawDate && currentRow.amount) {
        transactions.push(finalizeRow(currentRow));
      }

      // Yeni satır başlat
      const rawDate = dateMatch[1];
      const isoDate = normalizeDate(rawDate);

      // Tutarları bul
      const matches = Array.from(lineStr.matchAll(new RegExp(amountRegex.source, 'g'))).map((m) => m[1]);
      
      let amount = 0;
      let rawAmount = '';
      let type: 'income' | 'expense' = 'expense';

      // Satırdaki tutarları tara
      for (const m of matches) {
        if (m === rawDate) continue; // Tarihle karışmasın
        const val = parseTrAmount(m);
        if (val > 0) {
          amount = val;
          rawAmount = m;
          // Eğer + varsa veya Alacak sütunundaysa gelir
          if (m.includes('+') || lineStr.toLowerCase().includes('alacak') || lineStr.toLowerCase().includes('gelir')) {
            type = 'income';
          } else {
            type = 'expense';
          }
          break;
        }
      }

      // Açıklamayı temizle
      let desc = lineStr.replace(rawDate, '').replace(rawAmount, '').trim();
      desc = desc.replace(/\s+/g, ' ');

      currentRow = {
        id: crypto.randomUUID(),
        rawDate,
        date: isoDate,
        description: desc,
        amount,
        rawAmount,
        type,
      };
    } else if (currentRow) {
      // Tarih yoksa, bu satır bir önceki işlemin açıklamasının devamıdır (Ziraat çok satırlı açıklamaları!)
      const extraDesc = lineStr.trim();
      if (extraDesc && !extraDesc.toLowerCase().includes('sayfa') && !extraDesc.toLowerCase().includes('toplam')) {
        currentRow.description = (currentRow.description ? `${currentRow.description} ` : '') + extraDesc;
      }
    }
  }

  // Son satırı da ekle
  if (currentRow && currentRow.rawDate && currentRow.amount) {
    transactions.push(finalizeRow(currentRow));
  }

  // Toplamları hesapla
  let totalIncome = 0;
  let totalExpense = 0;

  for (const row of transactions) {
    if (row.type === 'income') totalIncome += row.amount;
    else totalExpense += row.amount;
  }

  return {
    bankName: detectedBank,
    totalIncome,
    totalExpense,
    rows: transactions,
  };
}

function finalizeRow(row: Partial<ParsedBankRow>): ParsedBankRow {
  return {
    id: row.id || crypto.randomUUID(),
    date: row.date || '',
    rawDate: row.rawDate || '',
    description: (row.description || 'Banka Hareketi').replace(/\s+/g, ' ').trim(),
    amount: row.amount || 0,
    type: row.type || 'expense',
    rawAmount: row.rawAmount || '',
    balance: row.balance,
  };
}

/**
 * İşlenmiş verileri şık bir Excel (.xlsx) dosyasına dönüştürüp indirtir.
 */
export function exportStatementToExcel(result: StatementParseResult, fileName = 'Banka-Ekstresi.xlsx') {
  const excelData = result.rows.map((row) => ({
    'Tarih': row.rawDate,
    'İşlem Türü': row.type === 'income' ? 'Giriş (Alacak)' : 'Çıkış (Borç)',
    'Açıklama': row.description,
    'Tutar (TL)': row.amount,
  }));

  const worksheet = XLSX.utils.json_to_sheet(excelData);

  // Kolon genişliklerini otomatik ayarla
  worksheet['!cols'] = [
    { wch: 14 }, // Tarih
    { wch: 16 }, // Tür
    { wch: 55 }, // Açıklama
    { wch: 18 }, // Tutar
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Hesap Hareketleri');

  // Dosyayı indir
  XLSX.writeFile(workbook, fileName);
}
