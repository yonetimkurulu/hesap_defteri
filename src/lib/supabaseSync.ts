import { supabase } from './supabase'

export type TransactionKind = 'income' | 'expense' | 'payable' | 'receivable' | 'payment' | 'collection' | 'check'

export type Transaction = {
  id: string
  date: string
  kind: TransactionKind
  amount: number
  description: string
  category: string
  contact?: string
  project?: string
  checkNumber?: string
  checkDate?: string
}

export type Contact = {
  id: string
  name: string
  role: string
  phone: string
  balance: number
}

export type Ledger = {
  id: string
  name: string
  createdAt: string
}

export type FullCloudData = {
  companyName: string
  ledgers: Ledger[]
  contacts: Contact[]
  ledgerTransactions: Record<string, Transaction[]>
}

/**
 * Kullanıcının buluttaki tüm verilerini çeker
 */
export async function pullCloudData(userId: string): Promise<FullCloudData | null> {
  if (!supabase) return null

  try {
    const [companiesRes, ledgersRes, contactsRes, txRes] = await Promise.all([
      supabase.from('companies').select('name').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
      supabase.from('ledgers').select('id, name, created_at').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('contacts').select('id, name, role, phone, balance').eq('user_id', userId).order('name', { ascending: true }),
      supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }),
    ])

    if (ledgersRes.error) throw ledgersRes.error
    if (contactsRes.error) throw contactsRes.error
    if (txRes.error) throw txRes.error

    const companyName = companiesRes.data?.[0]?.name ?? ''
    const ledgers: Ledger[] = (ledgersRes.data ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      createdAt: l.created_at,
    }))

    const contacts: Contact[] = (contactsRes.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role ?? 'Diğer',
      phone: c.phone ?? '',
      balance: Number(c.balance ?? 0),
    }))

    const ledgerTransactions: Record<string, Transaction[]> = {}
    for (const t of txRes.data ?? []) {
      const lid = t.ledger_id
      if (!ledgerTransactions[lid]) ledgerTransactions[lid] = []
      ledgerTransactions[lid].push({
        id: t.id,
        date: t.date,
        kind: t.kind as TransactionKind,
        amount: Number(t.amount),
        description: t.description,
        category: t.category ?? 'Genel',
        contact: t.contact ?? '',
        project: t.project ?? '',
        checkNumber: t.check_number ?? '',
        checkDate: t.check_date ?? '',
      })
    }

    return { companyName, ledgers, contacts, ledgerTransactions }
  } catch (err) {
    console.error('Buluttan veri çekilirken hata oluştu:', err)
    throw err
  }
}

/**
 * Masaüstündeki yerel verileri topluca Supabase buluta aktarır (Göç / Migration)
 */
export async function pushLocalDataToCloud(
  userId: string,
  companyName: string,
  ledgers: Ledger[],
  contacts: Contact[],
  getTransactionsForLedger: (ledgerId: string) => Transaction[]
): Promise<{ count: number }> {
  if (!supabase) return { count: 0 }

  try {
    // 1. Şirket adı kaydet/güncelle
    if (companyName) {
      const { data: existingCompany } = await supabase.from('companies').select('id').eq('user_id', userId).limit(1)
      if (existingCompany && existingCompany.length > 0) {
        await supabase.from('companies').update({ name: companyName }).eq('user_id', userId)
      } else {
        await supabase.from('companies').insert({ user_id: userId, name: companyName })
      }
    }

    // 2. Defterleri aktar
    if (ledgers.length > 0) {
      const ledgerRows = ledgers.map((l) => ({
        id: l.id,
        user_id: userId,
        name: l.name,
        created_at: l.createdAt,
      }))
      const { error: ledgerErr } = await supabase.from('ledgers').upsert(ledgerRows, { onConflict: 'id' })
      if (ledgerErr) throw ledgerErr
    }

    // 3. Kişileri aktar
    if (contacts.length > 0) {
      const contactRows = contacts.map((c) => ({
        id: c.id,
        user_id: userId,
        name: c.name,
        role: c.role || 'Diğer',
        phone: c.phone || '',
        balance: c.balance || 0,
      }))
      const { error: contactErr } = await supabase.from('contacts').upsert(contactRows, { onConflict: 'id' })
      if (contactErr) throw contactErr
    }

    // 4. Tüm defterlerdeki hareketleri topla ve aktar
    let totalTxCount = 0
    const allTxRows: any[] = []
    for (const ledger of ledgers) {
      const txs = getTransactionsForLedger(ledger.id)
      for (const t of txs) {
        allTxRows.push({
          id: t.id,
          user_id: userId,
          ledger_id: ledger.id,
          date: t.date,
          kind: t.kind,
          amount: t.amount,
          description: t.description,
          category: t.category || 'Genel',
          contact: t.contact || '',
          project: t.project || '',
          check_number: t.checkNumber || '',
          check_date: t.checkDate || '',
        })
      }
    }

    if (allTxRows.length > 0) {
      // Chunking (500'lük gruplar halinde güvenli upsert)
      const chunkSize = 400
      for (let i = 0; i < allTxRows.length; i += chunkSize) {
        const chunk = allTxRows.slice(i, i + chunkSize)
        const { error: txErr } = await supabase.from('transactions').upsert(chunk, { onConflict: 'id' })
        if (txErr) throw txErr
      }
      totalTxCount = allTxRows.length
    }

    return { count: totalTxCount + ledgers.length + contacts.length }
  } catch (err) {
    console.error('Veriler buluta aktarılırken hata oluştu:', err)
    throw err
  }
}

/**
 * Tekil Kayıt Bulut Fonksiyonları (Anlık Değişiklikler İçin)
 */
export async function cloudSaveTransaction(userId: string, ledgerId: string, tx: Transaction): Promise<void> {
  if (!supabase) return
  await supabase.from('transactions').upsert({
    id: tx.id,
    user_id: userId,
    ledger_id: ledgerId,
    date: tx.date,
    kind: tx.kind,
    amount: tx.amount,
    description: tx.description,
    category: tx.category || 'Genel',
    contact: tx.contact || '',
    project: tx.project || '',
    check_number: tx.checkNumber || '',
    check_date: tx.checkDate || '',
  }, { onConflict: 'id' })
}

export async function cloudDeleteTransaction(userId: string, txId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('transactions').delete().match({ id: txId, user_id: userId })
}

export async function cloudSaveContact(userId: string, contact: Contact): Promise<void> {
  if (!supabase) return
  await supabase.from('contacts').upsert({
    id: contact.id,
    user_id: userId,
    name: contact.name,
    role: contact.role || 'Diğer',
    phone: contact.phone || '',
    balance: contact.balance || 0,
  }, { onConflict: 'id' })
}

export async function cloudDeleteContact(userId: string, contactId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('contacts').delete().match({ id: contactId, user_id: userId })
}

export async function cloudSaveLedger(userId: string, ledger: Ledger): Promise<void> {
  if (!supabase) return
  await supabase.from('ledgers').upsert({
    id: ledger.id,
    user_id: userId,
    name: ledger.name,
    created_at: ledger.createdAt,
  }, { onConflict: 'id' })
}

export async function cloudDeleteLedger(userId: string, ledgerId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('ledgers').delete().match({ id: ledgerId, user_id: userId })
}

export async function cloudSaveCompanyName(userId: string, companyName: string): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.from('companies').select('id').eq('user_id', userId).limit(1)
  if (data && data.length > 0) {
    await supabase.from('companies').update({ name: companyName }).eq('user_id', userId)
  } else {
    await supabase.from('companies').insert({ user_id: userId, name: companyName })
  }
}

/**
 * Buluttaki değişiklikleri canlı dinleme (Realtime Sync)
 */
export function subscribeToRealtime(userId: string, onUpdate: () => void): () => void {
  if (!supabase) return () => {}

  const channel = supabase
    .channel('realtime_sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` }, () => {
      onUpdate()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ledgers', filter: `user_id=eq.${userId}` }, () => {
      onUpdate()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `user_id=eq.${userId}` }, () => {
      onUpdate()
    })
    .subscribe()

  return () => {
    if (supabase) supabase.removeChannel(channel)
  }
}
