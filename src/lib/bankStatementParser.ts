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
 * Türk Lirası tutar string'ini sayıya çevirir (eksi işareti dahil).
 */
export function parseTrAmount(str: string): number {
  if (!str) return 0;
  let clean = str.trim().replace(/[^\d.,\-+]/g, '');
  if (!clean) return 0;

  const isNeg = clean.includes('-');
  clean = clean.replace(/[-+]/g, '');

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
  if (isNaN(num)) return 0;
  return isNeg ? -num : num;
}

/**
 * GG.AA.YYYY formatındaki tarihi YYYY-MM-DD formatına çevirir.
 */
export function normalizeDate(dateStr: string): string {
  const match = dateStr.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
  if (!match) return dateStr;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

interface TextItemWithPos {
  text: string;
  x: number;
  y: number;
  page: number;
}

const TCMB_BANK_CODES: Record<string, string> = {
  '0010': 'Ziraat Bankası',
  '0012': 'Halkbank',
  '0015': 'VakıfBank',
  '0021': 'Vakıf Katılım Bankası',
  '0032': 'Türk Ekonomi Bankası (TEB)',
  '0046': 'Akbank',
  '0062': 'Garanti BBVA',
  '0064': 'Türkiye İş Bankası',
  '0067': 'Yapı ve Kredi Bankası',
  '0111': 'QNB Finansbank',
  '0123': 'HSBC',
  '0134': 'DenizBank',
  '0203': 'Albaraka Türk',
  '0205': 'Kuveyt Türk',
  '0206': 'Türkiye Finans',
  '0210': 'Ziraat Katılım',
  '0211': 'Emlak Katılım',
};

/**
 * Bankayı hem metinden hem de IBAN banka kodundan tespit eder.
 */
function detectBankName(allText: string): string {
  const lower = allText.toLowerCase();

  // 1. IBAN Kodundan Tespit (En güvenilir yöntem)
  const ibanMatch = allText.match(/TR\s*\d{2}\s*(\d{4})/i);
  if (ibanMatch && TCMB_BANK_CODES[ibanMatch[1]]) {
    return TCMB_BANK_CODES[ibanMatch[1]];
  }

  // 2. Metin bazlı tespit
  if (lower.includes('vakıf katılım') || lower.includes('vakif katilim')) return 'Vakıf Katılım Bankası';
  if (lower.includes('ziraat')) return 'Ziraat Bankası';
  if (lower.includes('vakıfbank') || lower.includes('vakifbank')) return 'VakıfBank';
  if (lower.includes('garanti')) return 'Garanti BBVA';
  if (lower.includes('iş bank') || lower.includes('isbank')) return 'Türkiye İş Bankası';
  if (lower.includes('halkbank')) return 'Halkbank';
  if (lower.includes('yapı kredi') || lower.includes('yapi kredi')) return 'Yapı Kredi';
  if (lower.includes('akbank')) return 'Akbank';
  if (lower.includes('kuveyt')) return 'Kuveyt Türk';
  if (lower.includes('albaraka')) return 'Albaraka Türk';
  if (lower.includes('emlak katılım')) return 'Emlak Katılım';
  if (lower.includes('qnb') || lower.includes('finansbank')) return 'QNB Finansbank';
  if (lower.includes('denizbank')) return 'DenizBank';

  return 'Banka Ekstresi';
}

/**
 * PDF dosyasını okuyup koordinatlarına ve sütun yapısına göre satır satır ayrıştırır.
 */
export async function parseBankStatementPdf(file: File): Promise<StatementParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let allFullText = '';
  const rows: ParsedBankRow[] = [];

  const dateRegex = /^\d{2}[./-]\d{2}[./-]\d{4}$/;
  const amountRegex = /-?\s*\d{1,3}(?:[.,]\d{3})*[.,]\d{2}/g;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const pageItems: TextItemWithPos[] = [];

    for (const item of textContent.items) {
      if ('str' in item && item.str.trim()) {
        const text = item.str.trim();
        const x = Math.round(item.transform[4]);
        const y = Math.round(item.transform[5]);
        pageItems.push({ text, x, y, page: pageNum });
        allFullText += ' ' + text;
      }
    }

    // Tablo başlık satırını bul (İşlem Tarihi, Tarih, Valör, Açıklama, Tutar vs.)
    const headerItem = pageItems.find(
      (it) =>
        it.text.toLowerCase().includes('işlem tarihi') ||
        it.text.toLowerCase().includes('islem tarihi') ||
        it.text === 'Tarih' ||
        it.text === 'İşlem Tarihi'
    );

    const headerY = headerItem ? headerItem.y : 9999;

    // Sadece başlığın ALTINDA kalan tablo öğelerini al
    const tableItems = pageItems.filter((it) => it.y < headerY - 4);

    // İşlem Tarihi sütunundaki tarih hücrelerini bul (Genelde X < 145)
    const dateCells = tableItems
      .filter((it) => it.x < 145 && dateRegex.test(it.text))
      .sort((a, b) => b.y - a.y); // Yukarıdan aşağıya

    for (let i = 0; i < dateCells.length; i++) {
      const curDateCell = dateCells[i];
      const nextDateCell = dateCells[i + 1];

      // Bu hareketin dikey koordinat aralığı
      const topY = curDateCell.y + 4;
      const bottomY = nextDateCell ? nextDateCell.y + 4 : -999;

      const rowItems = tableItems.filter((it) => it.y <= topY && it.y > bottomY);

      // Açıklama: Tarih sütunundan sonra, tutar sütunundan önce gelen çok satırlı metinler
      const descItems = rowItems
        .filter((it) => it.x >= 135 && it.x < 290)
        .sort((a, b) => (b.y !== a.y ? b.y - a.y : a.x - b.x));
      const description = descItems.map((it) => it.text).join(' ').replace(/\s+/g, ' ').trim();

      // Tutar & Bakiye sütunu: X >= 290
      const amountItems = rowItems.filter((it) => it.x >= 290 && it.x < 450);
      const combinedAmountStr = amountItems.map((it) => it.text).join(' ');

      // Sayıları ayıkla
      const matches = combinedAmountStr.match(amountRegex) || [];

      let amount = 0;
      let isExpense = false;
      let balance: number | undefined = undefined;
      let rawAmount = '';

      if (matches.length > 0) {
        const firstAmtStr = matches[0] ?? '';
        rawAmount = firstAmtStr;
        const parsed = parseTrAmount(firstAmtStr);
        amount = Math.abs(parsed);

        // Borç / Alacak Tespiti:
        // 1. Sayı eksi ile başlıyorsa -> ÇIKIŞ (Gider)
        if (parsed < 0 || firstAmtStr.includes('-')) {
          isExpense = true;
        }
        // 2. Sayı pozitifse:
        // Vakıf Katılım, Ziraat gibi ekstrelerde pozitif tutarlar GİRİŞ (Alacak) anlamına gelir
        else {
          isExpense = false;
        }

        // Açıklama bazlı teyit (örn. 'Amir=' gelen para, 'Lehdar=' giden para)
        const descLower = description.toLowerCase();
        if (descLower.includes('lehdar=') || descLower.includes('lhd:') || descLower.includes('fat.tahs') || descLower.includes('pos')) {
          // Eğer tutarda açıkça + yoksa ve açıklama fatura/lehdar ise çıkıştır
          if (firstAmtStr.includes('-')) isExpense = true;
        }

        // İkinci sayı varsa bu Bakiye'dir
        const secondAmtStr = matches[1];
        if (secondAmtStr) {
          balance = Math.abs(parseTrAmount(secondAmtStr));
        }
      }

      if (amount > 0) {
        rows.push({
          id: crypto.randomUUID(),
          date: normalizeDate(curDateCell.text),
          rawDate: curDateCell.text,
          description: description || 'Banka Hareketi',
          amount,
          type: isExpense ? 'expense' : 'income',
          balance,
          rawAmount,
        });
      }
    }
  }

  // Toplamları hesapla
  let totalIncome = 0;
  let totalExpense = 0;

  for (const row of rows) {
    if (row.type === 'income') totalIncome += row.amount;
    else totalExpense += row.amount;
  }

  const detectedBank = detectBankName(allFullText);

  return {
    bankName: detectedBank,
    totalIncome,
    totalExpense,
    rows,
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
    ...(row.balance !== undefined ? { 'Bakiye (TL)': row.balance } : {}),
  }));

  const worksheet = XLSX.utils.json_to_sheet(excelData);

  // Kolon genişliklerini otomatik ayarla
  worksheet['!cols'] = [
    { wch: 14 }, // Tarih
    { wch: 16 }, // Tür
    { wch: 60 }, // Açıklama
    { wch: 18 }, // Tutar
    { wch: 18 }, // Bakiye
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Hesap Hareketleri');

  // Dosyayı indir
  XLSX.writeFile(workbook, fileName);
}
