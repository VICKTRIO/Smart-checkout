import React, { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getWhatsAppOrders, type PaymentStatus, type WhatsAppOrder } from '../services/api';

interface WhatsAppOrdersProps {
  businessId: string;
  socket: Socket;
  onViewReceipt: (transactionId: number) => void;
}

const statusClassNames: Record<PaymentStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
};

export default function WhatsAppOrders({ businessId, socket, onViewReceipt }: WhatsAppOrdersProps) {
  const [orders, setOrders] = useState<WhatsAppOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setOrders(await getWhatsAppOrders(businessId));
    } catch {
      setError('Unable to load WhatsApp orders. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void loadOrders();
    const refreshOrders = () => void loadOrders();
    socket.on('payment_completed', refreshOrders);
    socket.on('payment_failed', refreshOrders);
    return () => {
      socket.off('payment_completed', refreshOrders);
      socket.off('payment_failed', refreshOrders);
    };
  }, [loadOrders, socket]);

  return (
    <section className="flex-1 overflow-y-auto p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50">
          <div><h2 className="font-bold text-slate-800">WhatsApp Orders</h2><p className="mt-1 text-xs text-slate-500">Orders received through the WhatsApp commerce endpoint.</p></div>
          <button type="button" onClick={() => void loadOrders()} disabled={isLoading} className="px-3 py-2 text-sm font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50">Refresh</button>
        </div>
        {isLoading ? <div className="p-8 text-center text-sm text-slate-500">Loading WhatsApp orders...</div> : error ? (
          <div className="p-8 text-center"><p className="text-sm text-red-600">{error}</p><button type="button" onClick={() => void loadOrders()} className="mt-3 text-sm font-semibold text-[#10b981] hover:text-emerald-700">Try again</button></div>
        ) : orders.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No WhatsApp orders have been received.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase font-semibold"><tr><th className="py-3.5 px-6">Order</th><th className="py-3.5 px-6">Customer</th><th className="py-3.5 px-6">Date</th><th className="py-3.5 px-6 text-right">Amount</th><th className="py-3.5 px-6">Status</th><th className="py-3.5 px-6">Confirmation</th><th className="py-3.5 px-6"></th></tr></thead><tbody className="divide-y divide-slate-100">
            {orders.map((order) => <tr key={order.transaction_id} className="hover:bg-slate-50/80"><td className="py-3.5 px-6 font-semibold text-slate-800">{order.invoice_no}</td><td className="py-3.5 px-6"><p className="text-slate-700">{order.customer_name ?? 'Customer'}</p><p className="mt-0.5 text-xs text-slate-500">{order.phone_number}</p></td><td className="py-3.5 px-6 text-slate-600">{new Date(order.created_at).toLocaleString()}</td><td className="py-3.5 px-6 text-right font-bold text-slate-900">KSh {Number(order.amount).toLocaleString()}</td><td className="py-3.5 px-6"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClassNames[order.status]}`}>{order.status}</span></td><td className="py-3.5 px-6 text-xs text-slate-600">{order.confirmation_sent_at ? 'Delivered' : order.whatsapp_message_id ? 'Awaiting delivery confirmation' : 'Not sent'}</td><td className="py-3.5 px-6 text-right">{order.status === 'COMPLETED' && <button type="button" onClick={() => onViewReceipt(order.transaction_id)} className="text-sm font-semibold text-[#10b981] hover:text-emerald-700">Receipt</button>}</td></tr>)}
          </tbody></table></div>
        )}
      </div>
    </section>
  );
}