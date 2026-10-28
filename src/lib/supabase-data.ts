import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Company = { id: string; name: string; created_at: string }
export type DatabaseContact = { id: string; company_id: string; name: string; relationship: string; phone: string | null }
export type DatabaseProject = { id: string; company_id: string; name: string; customer_id: string | null; status: string }
export type DatabaseTransaction = { id: string; company_id: string; kind: 'income' | 'expense' | 'payable' | 'receivable' | 'payment' | 'collection'; amount: number; transaction_date: string; description: string; contact_id: string | null; project_id: string | null; contacts?: { name: string }[] | null }

export async function listUserCompanies(user: User) {
  if (!supabase) throw new Error('Supabase yapılandırılmamış.')
  const { data, error } = await supabase.from('company_memberships').select('company_id, companies(id, name, created_at)').eq('user_id', user.id).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((membership) => membership.companies).filter(Boolean) as unknown as Company[]
}

export async function loadCompanyData(companyId: string) {
  if (!supabase) throw new Error('Supabase yapılandırılmamış.')
  const [contacts, projects, transactions] = await Promise.all([
    supabase.from('contacts').select('id, company_id, name, relationship, phone').eq('company_id', companyId).eq('is_active', true).order('name'),
    supabase.from('projects').select('id, company_id, name, customer_id, status').eq('company_id', companyId).order('created_at', { ascending: false }),
    supabase.from('financial_transactions').select('id, company_id, kind, amount, transaction_date, description, contact_id, project_id, contacts(name)').eq('company_id', companyId).order('transaction_date', { ascending: false }),
  ])
  const error = contacts.error ?? projects.error ?? transactions.error
  if (error) throw error
  return { contacts: contacts.data as DatabaseContact[], projects: projects.data as DatabaseProject[], transactions: transactions.data as DatabaseTransaction[] }
}

export async function insertCompany(name: string, user: User) {
  if (!supabase) throw new Error('Supabase yapılandırılmamış.')
  const { data: company, error: companyError } = await supabase.from('companies').insert({ name }).select('id, name, created_at').single()
  if (companyError) throw companyError
  const { error: membershipError } = await supabase.from('company_memberships').insert({ company_id: company.id, user_id: user.id, role: 'owner' })
  if (membershipError) throw membershipError
  return company as Company
}

export async function insertFinancialTransaction(companyId: string, userId: string, record: { kind: DatabaseTransaction['kind']; amount: number; date: string; description: string; contactId?: string }) {
  if (!supabase) throw new Error('Supabase yapılandırılmamış.')
  const { data, error } = await supabase.from('financial_transactions').insert({ company_id: companyId, created_by: userId, kind: record.kind, amount: record.amount, transaction_date: record.date, description: record.description, contact_id: record.contactId || null }).select('id, company_id, kind, amount, transaction_date, description, contact_id, project_id').single()
  if (error) throw error
  return data as DatabaseTransaction
}

export async function checkSupabaseConnection() {
  if (!supabase) return { configured: false, ok: false, message: 'Supabase değişkenleri bulunamadı.' }
  const { error } = await supabase.from('companies').select('id').limit(1)
  return error ? { configured: true, ok: false, message: error.message } : { configured: true, ok: true, message: 'Supabase bağlantısı hazır.' }
}
