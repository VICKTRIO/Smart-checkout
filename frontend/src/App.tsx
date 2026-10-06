import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import PendingPayments from './components/PendingPayments';
import ReceiptPreview from './components/ReceiptPreview';
import TransactionHistory from './components/TransactionHistory';
import WhatsAppOrders from './components/WhatsAppOrders';
import { getReceipt, type Receipt as ReceiptData } from './services/api';
import {
  ShoppingCart,
  Clock,
  Receipt,
  LogOut,
  Search,
  Trash2,
  Phone,
  CheckCircle2,
  Printer,
  XCircle,
  MessageSquareShare,
  Plus,
  X,
} from 'lucide-react';

const socket = io('http://localhost:5000');

interface Product {
  id: number;
  name: string;
  price: number;
  barcode: string;
}

interface CartItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
}

interface PaymentDetails {
  transaction_id?: string | number;
  checkout_request_id?: string;
  invoice_no?: string;
  mpesa_receipt?: string;
  amount?: number;
  phone?: string;
  status?: string;
  result_code?: number;
  result_description?: string;
}

const SAMPLE_PRODUCTS: Product[] = [
  { id: 1, name: 'Milk 500ml', price: 65, barcode: '600123' },
  { id: 2, name: 'Bread White', price: 70, barcode: '600124' },
  { id: 3, name: 'Sugar 1kg', price: 180, barcode: '600125' },
  { id: 4, name: 'Cooking Oil 1L', price: 230, barcode: '600126' },
  { id: 5, name: 'Rice 2kg', price: 340, barcode: '600127' },
  { id: 6, name: 'Eggs (Tray)', price: 450, barcode: '600128' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('pos');

  const [cart, setCart] = useState<CartItem[]>([]);

  const [phone, setPhone] = useState('0712345678');

  const [searchQuery, setSearchQuery] = useState('');

  const [paymentStatus, setPaymentStatus] = useState<
    'IDLE' | 'PENDING' | 'COMPLETED' | 'FAILED'
  >('IDLE');

  const [receiptDetails, setReceiptDetails] =
    useState<PaymentDetails | null>(null);

  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [isReceiptLoading, setIsReceiptLoading] = useState(false);

  // ---------------------------------------------------------
  // PAYMENT TRANSACTION TRACKING
  // ---------------------------------------------------------

  const [transactionId, setTransactionId] = useState<string | null>(null);

  const businessId = '1';

  // ---------------------------------------------------------
  // SOCKET.IO - REAL-TIME PAYMENT STATUS
  // ---------------------------------------------------------

  useEffect(() => {
    console.log('🔌 [Frontend Socket] Setting up payment listeners');

    // Join the business room after Socket.IO connects.
    // This also runs again after reconnects.
    const joinBusinessRoom = () => {
      socket.emit('join_business', businessId);

      console.log(
        '🏢 [Frontend Socket] Requested to join:',
        `business_${businessId}`
      );
    };

    socket.on('connect', joinBusinessRoom);

    // If the socket is already connected, join immediately.
    if (socket.connected) {
      joinBusinessRoom();
    }

    // -------------------------------------------------------
    // PAYMENT COMPLETED
    // -------------------------------------------------------

    const handlePaymentCompleted = (data: PaymentDetails) => {
      console.log(
        '✅ [Frontend Socket] PAYMENT COMPLETED RECEIVED:',
        data
      );

      /*
       * IMPORTANT:
       * Only update this POS if the event belongs to the
       * transaction currently being processed.
       */

      if (!transactionId || !data.transaction_id || String(data.transaction_id) !== transactionId) {
        console.log('Ignoring completed payment for a transaction not active in this POS:', data.transaction_id);
        return;
      }

      setPaymentStatus('COMPLETED');

      setReceiptDetails(data);
    };

    // -------------------------------------------------------
    // PAYMENT FAILED
    // -------------------------------------------------------

    const handlePaymentFailed = (data: PaymentDetails) => {
      console.log(
        '❌ [Frontend Socket] PAYMENT FAILED RECEIVED:',
        data
      );

      /*
       * Ignore payment events belonging to another transaction.
       */

      if (!transactionId || !data.transaction_id || String(data.transaction_id) !== transactionId) {
        console.log('Ignoring failed payment for a transaction not active in this POS:', data.transaction_id);
        return;
      }

      setPaymentStatus('FAILED');

      setReceiptDetails(data);
    };

    // -------------------------------------------------------
    // REGISTER SOCKET LISTENERS
    // -------------------------------------------------------

    socket.on(
      'payment_completed',
      handlePaymentCompleted
    );

    socket.on(
      'payment_failed',
      handlePaymentFailed
    );

    // -------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------

    return () => {
      console.log(
        '🧹 [Frontend Socket] Removing payment listeners'
      );

      socket.off(
        'payment_completed',
        handlePaymentCompleted
      );

      socket.off(
        'payment_failed',
        handlePaymentFailed
      );

      socket.off('connect', joinBusinessRoom);
    };
  }, [transactionId]);

  // ---------------------------------------------------------
  // CART FUNCTIONS
  // ---------------------------------------------------------

  const addToCart = (product: Product) => {
    // Do not modify cart while payment is processing.
    if (paymentStatus === 'PENDING') {
      return;
    }

    setCart((prev) => {
      const exists = prev.find(
        (item) => item.id === product.id
      );

      if (exists) {
        return prev.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        );
      }

      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          quantity: 1,
          price: product.price,
        },
      ];
    });
  };

  const updateQuantity = (
    id: number,
    delta: number
  ) => {
    // Do not modify cart while payment is processing.
    if (paymentStatus === 'PENDING') {
      return;
    }

    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty =
              item.quantity + delta;

            return newQty > 0
              ? {
                  ...item,
                  quantity: newQty,
                }
              : null;
          }

          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (id: number) => {
    // Do not modify cart while payment is processing.
    if (paymentStatus === 'PENDING') {
      return;
    }

    setCart((prev) =>
      prev.filter((item) => item.id !== id)
    );
  };

  // ---------------------------------------------------------
  // CLEAR / NEW SALE
  // ---------------------------------------------------------

  const clearCart = () => {
    console.log('🧹 Starting new sale');

    setCart([]);

    setPaymentStatus('IDLE');

    setReceiptDetails(null);
    setReceipt(null);
    setReceiptError(null);

    setTransactionId(null);
  };

  const totalAmount = cart.reduce(
    (sum, item) =>
      sum + item.price * item.quantity,
    0
  );

  // ---------------------------------------------------------
  // STK PUSH
  // ---------------------------------------------------------

  const handleSTKPush = async () => {
    /*
     * Basic validation.
     */

    if (cart.length === 0) {
      return;
    }

    if (!phone) {
      return;
    }

    /*
     * Prevent duplicate payment requests.
     */

    if (paymentStatus === 'PENDING') {
      console.log(
        '⚠️ Payment already processing. Ignoring duplicate request.'
      );

      return;
    }

    /*
     * Clear old payment information before starting
     * a completely new attempt.
     */

    setReceiptDetails(null);
    setReceipt(null);
    setReceiptError(null);

    setTransactionId(null);

    /*
     * Immediately change UI to PENDING.
     */

    setPaymentStatus('PENDING');

    console.log('📡 Sending STK Push...');

    try {
      const response = await axios.post(
        'http://localhost:5000/api/v1/payments/stkpush',
        {
          business_id: businessId,
          branch_id: '1',
          cashier_id: '1',
          phone: phone,
          amount: totalAmount,

          items: cart.map((item) => ({
            product_name: item.name,
            quantity: item.quantity,
            unit_price: item.price,
          })),
        }
      );

      console.log(
        '📥 STK Push Response:',
        response.data
      );

      /*
       * Backend creates the transaction first and returns
       * the transaction_id.
       */

      const newTransactionId =
        response.data?.transaction_id;

      if (!newTransactionId) {
        console.error(
          '❌ STK Push succeeded but no transaction_id was returned.'
        );

        setPaymentStatus('FAILED');

        setReceiptDetails({
          result_description:
            'Payment request was sent, but the transaction could not be tracked.',
        });

        return;
      }

      /*
       * Store the transaction we are waiting for.
       */

      setTransactionId(String(newTransactionId));

      console.log(
        '🆔 Tracking transaction:',
        newTransactionId
      );

      /*
       * The UI remains PENDING.
       *
       * We DO NOT mark payment as completed here.
       *
       * Completion only happens when the backend callback
       * sends payment_completed through Socket.IO.
       */

    } catch (error: any) {
      console.error(
        '❌ STK Push Error:',
        error
      );

      setPaymentStatus('FAILED');

      setReceiptDetails({
        result_description:
          error?.response?.data?.message ||
          'Unable to send the M-Pesa payment request. Please try again.',
      });
    }
  };

  // ---------------------------------------------------------
  // RETRY PAYMENT
  // ---------------------------------------------------------

  const retryPayment = () => {
    console.log('🔄 Retrying payment');

    /*
     * Keep the current cart.
     *
     * Only clear the previous transaction/payment result.
     */

    setTransactionId(null);

    setReceiptDetails(null);

    setPaymentStatus('IDLE');

    /*
     * STK Push is started manually by the cashier
     * after pressing the button again.
     */
  };

  const viewReceipt = async (selectedTransactionId?: string | number) => {
    const completedTransactionId = selectedTransactionId || receiptDetails?.transaction_id || transactionId;

    if (!completedTransactionId) {
      setReceiptError('The completed transaction could not be identified.');
      return;
    }

    setIsReceiptLoading(true);
    setReceiptError(null);

    try {
      setReceipt(await getReceipt(completedTransactionId));
    } catch (error: any) {
      setReceiptError(
        error?.response?.data?.error ||
        'Unable to load the receipt. Please try again.'
      );
    } finally {
      setIsReceiptLoading(false);
    }
  };
  // ---------------------------------------------------------
  // FILTER PRODUCTS
  // ---------------------------------------------------------

  const filteredProducts =
    SAMPLE_PRODUCTS.filter(
      (p) =>
        p.name
          .toLowerCase()
          .includes(
            searchQuery.toLowerCase()
          ) ||
        p.barcode.includes(searchQuery)
    );

  return (
    <div className="flex h-screen bg-[#f1f5f9] text-[#1e293b] font-sans">

      {/* 1. DARK SIDEBAR WITH GREEN ACTIVE HIGHLIGHTS */}

      <aside className="w-64 bg-[#0f172a] text-[#94a3b8] flex flex-col justify-between p-4 border-r border-slate-800">

        <div>

          {/* Brand Header */}

          <div className="flex items-center gap-3 px-2 py-4 mb-6 border-b border-slate-800">

            <div className="bg-[#10b981] p-2.5 rounded-xl text-white shadow-md shadow-emerald-900/30">

              <ShoppingCart className="w-6 h-6" />

            </div>

            <div>

              <h1 className="font-bold text-lg text-white leading-tight">
                Smart Checkout
              </h1>

              <p className="text-xs text-emerald-400 font-medium">
                POS & Payments
              </p>

            </div>

          </div>

          {/* Navigation Items */}

          <nav className="space-y-1">

            <button
              onClick={() =>
                setActiveTab('pos')
              }
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'pos'
                  ? 'bg-[#10b981] text-white shadow-md shadow-emerald-900/40 font-semibold'
                  : 'hover:bg-slate-800/60 text-slate-400'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              New Sale
            </button>

            <button
              onClick={() =>
                setActiveTab('pending')
              }
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'pending'
                  ? 'bg-[#10b981] text-white shadow-md shadow-emerald-900/40 font-semibold'
                  : 'hover:bg-slate-800/60 text-slate-400'
              }`}
            >
              <Clock className="w-4 h-4" />
              Pending Payments

              <span className="ml-auto bg-amber-500/20 text-amber-300 text-xs px-2 py-0.5 rounded-full font-bold">
                3
              </span>

            </button>

            <button
              onClick={() =>
                setActiveTab('transactions')
              }
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'transactions'
                  ? 'bg-[#10b981] text-white shadow-md shadow-emerald-900/40 font-semibold'
                  : 'hover:bg-slate-800/60 text-slate-400'
              }`}
            >
              <Receipt className="w-4 h-4" />
              Transactions
            </button>

            <button
              onClick={() =>
                setActiveTab('whatsapp')
              }
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'whatsapp'
                  ? 'bg-[#10b981] text-white shadow-md shadow-emerald-900/40 font-semibold'
                  : 'hover:bg-slate-800/60 text-slate-400'
              }`}
            >
              <MessageSquareShare className="w-4 h-4" />
              WhatsApp Orders
            </button>

          </nav>

        </div>

        {/* User Profile */}

        <div className="pt-4 border-t border-slate-800 flex items-center justify-between px-2">

          <div className="flex items-center gap-3">

            <div className="w-9 h-9 rounded-full bg-[#10b981] flex items-center justify-center font-bold text-white text-sm shadow-md">
              MW
            </div>

            <div>

              <p className="text-sm font-semibold text-white">
                Mary Wanjiku
              </p>

              <p className="text-xs text-slate-400">
                Cashier
              </p>

            </div>

          </div>

          <button className="text-slate-400 hover:text-red-400 transition">
            <LogOut className="w-4 h-4" />
          </button>

        </div>

      </aside>

      {/* 2. MAIN POS AREA */}

      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Top Header */}

        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4 shadow-sm">

          <div className="relative flex-1 max-w-xl">

            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />

            <input
              type="text"
              placeholder="Scan barcode or search product..."
              value={searchQuery}
              onChange={(e) =>
                setSearchQuery(e.target.value)
              }
              disabled={paymentStatus === 'PENDING'}
              className="w-full pl-11 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10b981] font-medium text-sm disabled:opacity-60"
            />

          </div>

          <div className="flex items-center gap-3">

            <button
              onClick={clearCart}
              disabled={paymentStatus === 'PENDING'}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear Cart
            </button>

            <button
              onClick={clearCart}
              disabled={paymentStatus === 'PENDING'}
              className="px-4 py-2 bg-[#10b981] hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              New Sale
            </button>

          </div>

        </header>

        {/* Work Area */}

        {activeTab === 'pending' ? (
          <PendingPayments businessId={businessId} socket={socket} />
        ) : activeTab === 'transactions' ? (
          <TransactionHistory
            businessId={businessId}
            socket={socket}
            onViewReceipt={(selectedTransactionId) => void viewReceipt(selectedTransactionId)}
          />
        ) : activeTab === 'whatsapp' ? (
          <WhatsAppOrders
            businessId={businessId}
            socket={socket}
            onViewReceipt={(selectedTransactionId) => void viewReceipt(selectedTransactionId)}
          />
        ) : (
        <div className="flex-1 flex overflow-hidden">

          {/* Product Grid & Order Table */}

          <div className="flex-1 flex flex-col p-6 overflow-y-auto">

            {/* Quick Product Grid */}

            <div className="mb-6">

              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Quick Select Products
              </h3>

              <div className="grid grid-cols-3 gap-3">

                {filteredProducts.map((prod) => (

                  <button
                    key={prod.id}
                    onClick={() =>
                      addToCart(prod)
                    }
                    disabled={
                      paymentStatus === 'PENDING'
                    }
                    className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-[#10b981] hover:shadow-md transition text-left flex justify-between items-center group disabled:opacity-60 disabled:cursor-not-allowed"
                  >

                    <div>

                      <p className="font-semibold text-slate-800 text-sm group-hover:text-[#10b981] transition-colors">
                        {prod.name}
                      </p>

                      <p className="text-xs text-slate-400 mt-0.5">
                        Barcode: {prod.barcode}
                      </p>

                    </div>

                    <span className="font-bold text-[#10b981] text-sm bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100">
                      KSh {prod.price}
                    </span>

                  </button>

                ))}

              </div>

            </div>

            {/* Current Order Table */}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">

              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">

                <h2 className="font-bold text-slate-800">
                  Current Order
                </h2>

                <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
                  Items:{' '}
                  {cart.reduce(
                    (sum, item) =>
                      sum + item.quantity,
                    0
                  )}
                </span>

              </div>

              <div className="flex-1 overflow-y-auto">

                {cart.length === 0 ? (

                  <div className="flex flex-col items-center justify-center h-full text-slate-400 py-12">

                    <ShoppingCart className="w-12 h-12 stroke-1 mb-2 text-slate-300" />

                    <p className="text-sm">
                      Cart is empty. Click items to add.
                    </p>

                  </div>

                ) : (

                  <table className="w-full text-left text-sm">

                    <thead className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase font-semibold">

                      <tr>

                        <th className="py-3.5 px-6">
                          #
                        </th>

                        <th className="py-3.5 px-6">
                          Item
                        </th>

                        <th className="py-3.5 px-6 text-center">
                          Qty
                        </th>

                        <th className="py-3.5 px-6 text-right">
                          Price
                        </th>

                        <th className="py-3.5 px-6 text-right">
                          Total
                        </th>

                        <th className="py-3.5 px-6 text-center">
                          Action
                        </th>

                      </tr>

                    </thead>

                    <tbody className="divide-y divide-slate-100">

                      {cart.map(
                        (item, index) => (

                          <tr
                            key={item.id}
                            className="hover:bg-slate-50/80 transition"
                          >

                            <td className="py-3.5 px-6 font-medium text-slate-400">
                              {index + 1}
                            </td>

                            <td className="py-3.5 px-6 font-semibold text-slate-800">
                              {item.name}
                            </td>

                            <td className="py-3.5 px-6">

                              <div className="flex items-center justify-center gap-2">

                                <button
                                  onClick={() =>
                                    updateQuantity(
                                      item.id,
                                      -1
                                    )
                                  }
                                  disabled={
                                    paymentStatus ===
                                    'PENDING'
                                  }
                                  className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 border border-slate-200 disabled:opacity-50"
                                >
                                  -
                                </button>

                                <span className="font-bold w-6 text-center">
                                  {item.quantity}
                                </span>

                                <button
                                  onClick={() =>
                                    updateQuantity(
                                      item.id,
                                      1
                                    )
                                  }
                                  disabled={
                                    paymentStatus ===
                                    'PENDING'
                                  }
                                  className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 border border-slate-200 disabled:opacity-50"
                                >
                                  +
                                </button>

                              </div>

                            </td>

                            <td className="py-3.5 px-6 text-right font-medium text-slate-600">
                              KSh {item.price}
                            </td>

                            <td className="py-3.5 px-6 text-right font-bold text-slate-900">
                              KSh{' '}
                              {item.price *
                                item.quantity}
                            </td>

                            <td className="py-3.5 px-6 text-center">

                              <button
                                onClick={() =>
                                  removeFromCart(
                                    item.id
                                  )
                                }
                                disabled={
                                  paymentStatus ===
                                  'PENDING'
                                }
                                className="text-slate-400 hover:text-red-500 transition disabled:opacity-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>

                            </td>

                          </tr>

                        )
                      )}

                    </tbody>

                  </table>

                )}

              </div>

            </div>

          </div>

          {/* 3. RIGHT PAYMENT PROCESSING PANEL */}

          <div className="w-96 bg-white border-l border-slate-200 p-6 flex flex-col justify-between shadow-sm">

            <div>

              <h2 className="text-lg font-bold text-slate-900 mb-6 border-b pb-3">
                Payment Processing
              </h2>

              {/* Total Box */}

              <div className="bg-[#0f172a] text-white rounded-2xl p-5 mb-6 text-center shadow-lg border border-slate-800">

                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  TOTAL AMOUNT
                </span>

                <p className="text-4xl font-black mt-1 text-[#10b981]">
                  KSh{' '}
                  {totalAmount.toLocaleString()}
                </p>

              </div>

              {/* Phone Input */}

              <div className="mb-6">

                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">

                  <Phone className="w-4 h-4 text-[#10b981]" />

                  Customer Phone Number

                </label>

                <input
                  type="text"
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value)
                  }
                  disabled={
                    paymentStatus === 'PENDING'
                  }
                  placeholder="0712 345 678"
                  className="w-full border border-slate-300 rounded-xl p-3 text-lg font-bold tracking-wide outline-none focus:ring-2 focus:ring-[#10b981] bg-slate-50 disabled:opacity-60"
                />

                <p className="text-xs text-slate-400 mt-1.5">
                  M-Pesa STK prompt will be sent
                  automatically.
                </p>

              </div>

              {/* PAYMENT PENDING */}

              {paymentStatus === 'PENDING' && (

                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center mb-6 animate-pulse">

                  <Clock className="w-8 h-8 text-amber-500 mx-auto mb-2" />

                  <p className="font-bold text-amber-900 text-sm">
                    STK Push Sent!
                  </p>

                  <p className="text-xs text-amber-700 mt-1">
                    Waiting for customer to
                    complete payment...
                  </p>

                  {transactionId && (
                    <p className="text-[10px] text-amber-600 mt-2 break-all">
                      Transaction:{' '}
                      {transactionId}
                    </p>
                  )}

                </div>

              )}

              {/* PAYMENT COMPLETED */}

              {paymentStatus === 'COMPLETED' && (

                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-6">

                  <div className="flex items-center gap-2 text-emerald-800 font-bold mb-2">

                    <CheckCircle2 className="w-5 h-5 text-[#10b981]" />

                    Payment Received!

                  </div>

                  <div className="text-xs space-y-1.5 text-slate-600 bg-white p-3 rounded-xl border border-emerald-100 font-medium">

                    <p className="flex justify-between">
                      <span>Amount:</span>

                      <strong>
                        KSh{' '}
                        {receiptDetails?.amount ??
                          totalAmount}
                      </strong>
                    </p>

                    <p className="flex justify-between">
                      <span>Phone:</span>

                      <strong>
                        {receiptDetails?.phone ||
                          phone}
                      </strong>
                    </p>

                    <p className="flex justify-between">
                      <span>M-Pesa Code:</span>

                      <strong className="text-[#10b981] font-bold">
                        {receiptDetails?.mpesa_receipt ||
                          'N/A'}
                      </strong>
                    </p>

                    <p className="flex justify-between">
                      <span>Invoice:</span>

                      <strong>
                        {receiptDetails?.invoice_no ||
                          'N/A'}
                      </strong>
                    </p>

                    <p className="flex justify-between">
                      <span>Date:</span>

                      <strong>
                        {new Date().toLocaleTimeString()}
                      </strong>
                    </p>

                  </div>

                  {receiptError && (
                    <p className="mt-3 text-xs font-medium text-red-600">{receiptError}</p>
                  )}

                </div>

              )}

              {/* PAYMENT FAILED */}

              {paymentStatus === 'FAILED' && (

                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">

                  <div className="flex items-center gap-2 text-red-800 font-bold mb-2">

                    <XCircle className="w-5 h-5 text-red-600" />

                    Payment Failed

                  </div>

                  <p className="text-xs text-red-700">

                    {receiptDetails?.result_description ||
                      'The payment was not completed. Ask the customer to try again.'}

                  </p>

                </div>

              )}

            </div>

            {/* ACTION BUTTONS */}

            <div className="space-y-3 pt-4 border-t border-slate-100">

              {/* COMPLETED */}

              {paymentStatus === 'COMPLETED' ? (

                <>

                  <button
                    onClick={() => void viewReceipt()}
                    disabled={isReceiptLoading}
                    className="w-full bg-[#0f172a] hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm shadow-md disabled:opacity-50"
                  >

                    <Printer className="w-4 h-4" />

                    {isReceiptLoading ? 'Loading Receipt...' : 'View / Print Receipt'}

                  </button>

                  <button
                    onClick={() =>
                      alert(
                        'WhatsApp receipt sent to ' +
                          phone
                      )
                    }
                    className="w-full bg-[#10b981] hover:bg-emerald-600 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm shadow-md shadow-emerald-600/20"
                  >

                    <MessageSquareShare className="w-4 h-4" />

                    Send WhatsApp Receipt

                  </button>

                  <button
                    onClick={clearCart}
                    className="w-full border border-slate-300 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-100 transition text-sm"
                  >
                    New Sale
                  </button>

                </>

              ) : paymentStatus === 'FAILED' ? (

                /* FAILED */

                <>

                  <button
                    onClick={retryPayment}
                    className="w-full bg-[#10b981] hover:bg-emerald-600 text-white font-bold py-3.5 rounded-xl transition shadow-md shadow-emerald-600/30 text-base"
                  >
                    Try Again
                  </button>

                  <button
                    onClick={clearCart}
                    className="w-full border border-red-200 text-red-600 hover:bg-red-50 font-bold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-1"
                  >

                    <X className="w-4 h-4" />

                    Cancel Sale

                  </button>

                </>

              ) : (

                /* IDLE / PENDING */

                <>

                  <button
                    disabled={
                      cart.length === 0 ||
                      paymentStatus ===
                        'PENDING'
                    }
                    onClick={handleSTKPush}
                    className="w-full bg-[#10b981] hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3.5 rounded-xl transition shadow-md shadow-emerald-600/30 text-base"
                  >

                    {paymentStatus ===
                    'PENDING'
                      ? 'Waiting for M-Pesa...'
                      : 'Send M-Pesa Prompt'}

                  </button>

                  <button
                    onClick={clearCart}
                    disabled={
                      paymentStatus ===
                      'PENDING'
                    }
                    className="w-full border border-red-200 text-red-600 hover:bg-red-50 font-bold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >

                    <X className="w-4 h-4" />

                    Cancel Sale

                  </button>

                </>

              )}

            </div>

          </div>

        </div>
        )}

      </main>

      {receipt && (
        <ReceiptPreview receipt={receipt} onClose={() => setReceipt(null)} />
      )}

    </div>
  );
}