import React, { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  getTransactions,
  type PaymentStatus,
  type TransactionFilters,
  type TransactionRecord,
} from '../services/api';

interface TransactionHistoryProps {
  businessId: string;
  socket: Socket;
  onViewReceipt: (transactionId: number) => void;
}

const statusClassNames: Record<PaymentStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
};

export default function TransactionHistory({ businessId, socket, onViewReceipt }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [filters, setFilters] = useState<TransactionFilters>({ status: '', from: '', to: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setTransactions(await getTransactions(businessId, filters));
    } catch {
      setError('Unable to load transaction history. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [businessId, filters]);

  useEffect(() => {
    void loadTransactions();

    const refreshHistory = () => void loadTransactions();
    socket.on('payment_completed', refreshHistory);
    socket.on('payment_failed', refreshHistory);

    return () => {
      socket.off('payment_completed', refreshHistory);
      socket.off('payment_failed', refreshHistory);
    };
  }, [loadTransactions, socket]);

  const updateFilter = (key: keyof TransactionFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="flex-1 overflow-y-auto p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center justify-between gap-4">
            <div><h2 className="font-bold text-slate-800">Transaction History</h2><p className="mt-1 text-xs text-slate-500">Latest sales and M-Pesa payment statuses.</p></div>
            <button type="button" onClick={() => void loadTransactions()} disabled={isLoading} className="px-3 py-2 text-sm font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50">Refresh</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <select value={filters.status ?? ''} onChange={(event) => updateFilter('status', event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#10b981]">
              <option value="">All statuses</option><option value="PENDING">Pending</option><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option>
            </select>
            <input type="date" value={filters.from ?? ''} onChange={(event) => updateFilter('from', event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#10b981]" />
            <input type="date" value={filters.to ?? ''} onChange={(event) => updateFilter('to', event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#10b981]" />
          </div>
        </div>
        {isLoading ? <div className="p-8 text-center text-sm text-slate-500">Loading transactions...</div> : error ? (
          <div className="p-8 text-center"><p className="text-sm text-red-600">{error}</p><button type="button" onClick={() => void loadTransactions()} className="mt-3 text-sm font-semibold text-[#10b981] hover:text-emerald-700">Try again</button></div>
        ) : transactions.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No transactions match these filters.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase font-semibold"><tr><th className="py-3.5 px-6">Invoice</th><th className="py-3.5 px-6">Date</th><th className="py-3.5 px-6 text-right">Amount</th><th className="py-3.5 px-6">Status</th><th className="py-3.5 px-6">Payment reference</th><th className="py-3.5 px-6">Cashier</th><th className="py-3.5 px-6"></th></tr></thead><tbody className="divide-y divide-slate-100">
            {transactions.map((transaction) => <tr key={transaction.transaction_id} className="hover:bg-slate-50/80"><td className="py-3.5 px-6"><p className="font-semibold text-slate-800">{transaction.invoice_no}</p>{transaction.phone_number && <p className="mt-0.5 text-xs text-slate-500">{transaction.phone_number}</p>}</td><td className="py-3.5 px-6 text-slate-600">{new Date(transaction.created_at).toLocaleString()}</td><td className="py-3.5 px-6 text-right font-bold text-slate-900">KSh {Number(transaction.amount).toLocaleString()}</td><td className="py-3.5 px-6"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClassNames[transaction.status]}`}>{transaction.status}</span></td><td className="py-3.5 px-6 max-w-48 truncate text-xs text-slate-600" title={transaction.mpesa_receipt_number ?? transaction.payment_identifier ?? undefined}>{transaction.mpesa_receipt_number ?? transaction.payment_identifier ?? '—'}</td><td className="py-3.5 px-6 text-slate-600">{transaction.cashier_name ?? '—'}</td><td className="py-3.5 px-6 text-right">{transaction.status === 'COMPLETED' && <button type="button" onClick={() => onViewReceipt(transaction.transaction_id)} className="text-sm font-semibold text-[#10b981] hover:text-emerald-700">Receipt</button>}</td></tr>)}
          </tbody></table></div>
        )}
      </div>
    </section>
  );
}