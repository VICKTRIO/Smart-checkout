import type { Receipt } from '../services/api';

interface ReceiptPreviewProps {
  receipt: Receipt;
  onClose: () => void;
}

export default function ReceiptPreview({ receipt, onClose }: ReceiptPreviewProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 print:bg-white print:p-0">
      <style>{`@media print { body * { visibility: hidden; } #receipt-preview, #receipt-preview * { visibility: visible; } #receipt-preview { position: absolute; inset: 0; width: 100%; box-shadow: none; border: 0; } .receipt-actions { display: none; } }`}</style>
      <section id="receipt-preview" className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="bg-[#0f172a] px-6 py-5 text-center text-white">
          <h2 className="text-lg font-bold">Smart Checkout</h2>
          <p className="mt-1 text-xs text-slate-300">Payment Receipt</p>
        </div>
        <div className="p-6 text-sm text-slate-700">
          <div className="flex justify-between border-b border-dashed border-slate-300 pb-3 text-xs">
            <div><p className="font-bold text-slate-900">{receipt.invoice_no}</p><p className="mt-1">{new Date(receipt.date).toLocaleString()}</p></div>
            <div className="text-right"><p>Receipt: {receipt.receipt_no}</p><p className="mt-1">Transaction: {receipt.transaction_id}</p></div>
          </div>
          <table className="mt-4 w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500"><tr><th className="pb-2">Item</th><th className="pb-2 text-center">Qty</th><th className="pb-2 text-right">Price</th><th className="pb-2 text-right">Subtotal</th></tr></thead>
            <tbody>{receipt.items.map((item, index) => <tr key={`${item.product_name}-${index}`} className="border-b border-slate-100"><td className="py-2 pr-2 font-medium text-slate-800">{item.product_name}</td><td className="py-2 text-center">{item.quantity}</td><td className="py-2 text-right">{Number(item.unit_price).toLocaleString()}</td><td className="py-2 text-right font-semibold">{Number(item.subtotal).toLocaleString()}</td></tr>)}</tbody>
          </table>
          <div className="mt-4 border-t border-dashed border-slate-300 pt-3 text-xs space-y-1">
            <p className="flex justify-between"><span>Payment status</span><strong className="text-[#10b981]">{receipt.payment_status}</strong></p>
            {receipt.phone && <p className="flex justify-between"><span>Phone</span><strong>{receipt.phone}</strong></p>}
            {receipt.mpesa_receipt && <p className="flex justify-between"><span>M-Pesa receipt</span><strong>{receipt.mpesa_receipt}</strong></p>}
            <p className="mt-3 flex justify-between text-base font-bold text-slate-900"><span>Total</span><span>KSh {Number(receipt.total_amount).toLocaleString()}</span></p>
          </div>
          <p className="mt-6 text-center text-xs text-slate-400">Thank you for shopping with us.</p>
        </div>
        <div className="receipt-actions flex gap-3 border-t border-slate-100 p-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Close</button>
          <button type="button" onClick={() => window.print()} className="flex-1 rounded-xl bg-[#0f172a] py-2.5 text-sm font-bold text-white hover:bg-slate-800">Print Receipt</button>
        </div>
      </section>
    </div>
  );
}