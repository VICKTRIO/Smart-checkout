import React, { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getPendingPayments, type PaymentStatus, type PendingPayment } from '../services/api';

interface PaymentUpdate { transaction_id?: string | number; }
interface PendingPaymentsProps { businessId: string; socket: Socket; }

const statusClassNames: Record<PaymentStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
};

export default function PendingPayments({ businessId, socket }: PendingPaymentsProps) {
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setPayments(await getPendingPayments(businessId));
    } catch {
      setError('Unable to load pending payments. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void loadPayments();
    const removeResolvedPayment = (update: PaymentUpdate) => {
      if (update.transaction_id !== undefined) {
        setPayments((current) => current.filter(
          (payment) => String(payment.transaction_id) !== String(update.transaction_id)
        ));
      }
      void loadPayments();
    };

    socket.on('payment_completed', removeResolvedPayment);
    socket.on('payment_failed', removeResolvedPayment);
    return () => {
      socket.off('payment_completed', removeResolvedPayment);
      socket.off('payment_failed', removeResolvedPayment);
    };
  }, [loadPayments, socket]);

  return (
    <section className="flex-1 overflow-y-auto p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="font-bold text-slate-800">Pending Payments</h2>
            <p className="text-xs text-slate-500 mt-1">M-Pesa requests awaiting a customer response.</p>
          </div>
          <button type="button" onClick={() => void loadPayments()} disabled={isLoading} className="px-3 py-2 text-sm font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50">Refresh</button>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading pending payments...</div>
        ) : error ? (
          <div className="p-8 text-center"><p className="text-sm text-red-600">{error}</p><button type="button" onClick={() => void loadPayments()} className="mt-3 text-sm font-semibold text-[#10b981] hover:text-emerald-700">Try again</button></div>
        ) : payments.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">There are no pending payments.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase font-semibold"><tr><th className="py-3.5 px-6">Invoice</th><th className="py-3.5 px-6">Phone</th><th className="py-3.5 px-6 text-right">Amount</th><th className="py-3.5 px-6">Requested</th><th className="py-3.5 px-6">Status</th><th className="py-3.5 px-6">Payment ID</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((payment) => <tr key={payment.transaction_id} className="hover:bg-slate-50/80"><td className="py-3.5 px-6 font-semibold text-slate-800">{payment.invoice_no}</td><td className="py-3.5 px-6 text-slate-600">{payment.phone_number}</td><td className="py-3.5 px-6 text-right font-bold text-slate-900">KSh {Number(payment.amount).toLocaleString()}</td><td className="py-3.5 px-6 text-slate-600">{new Date(payment.created_at).toLocaleString()}</td><td className="py-3.5 px-6"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClassNames[payment.status]}`}>{payment.status}</span></td><td className="py-3.5 px-6 max-w-48 truncate text-xs text-slate-500" title={payment.payment_identifier ?? undefined}>{payment.payment_identifier ?? 'Awaiting M-Pesa ID'}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}