import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:5000/api/v1' });

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface PendingPayment {
  transaction_id: number;
  invoice_no: string;
  amount: string | number;
  phone_number: string;
  status: PaymentStatus;
  payment_identifier: string | null;
  created_at: string;
}

export interface TransactionRecord {
  transaction_id: number;
  invoice_no: string;
  amount: string | number;
  status: PaymentStatus;
  phone_number: string | null;
  mpesa_receipt_number: string | null;
  payment_identifier: string | null;
  created_at: string;
  cashier_name: string | null;
}

export interface TransactionFilters {
  status?: PaymentStatus | '';
  from?: string;
  to?: string;
}
export interface WhatsAppOrder {
  transaction_id: number;
  invoice_no: string;
  amount: string | number;
  phone_number: string;
  status: PaymentStatus;
  mpesa_receipt_number: string | null;
  created_at: string;
  customer_name: string | null;
  whatsapp_message_id: string | null;
  confirmation_sent_at: string | null;
}
export interface ReceiptItem {
  product_name: string;
  quantity: number;
  unit_price: string | number;
  subtotal: string | number;
}

export interface Receipt {
  receipt_no: string;
  transaction_id: number;
  invoice_no: string;
  date: string;
  total_amount: string | number;
  payment_status: 'COMPLETED';
  phone: string | null;
  mpesa_receipt: string | null;
  items: ReceiptItem[];
}

export const getPendingPayments = async (businessId: string) => {
  const response = await api.get<PendingPayment[]>('/pending-payments', {
    params: { business_id: businessId },
  });
  return response.data;
};

export const getTransactions = async (
  businessId: string,
  filters: TransactionFilters = {}
) => {
  const response = await api.get<TransactionRecord[]>('/transactions', {
    params: { business_id: businessId, ...filters },
  });
  return response.data;
};
export const getWhatsAppOrders = async (businessId: string) => {
  const response = await api.get<WhatsAppOrder[]>('/whatsapp/orders', {
    params: { business_id: businessId },
  });
  return response.data;
};
export const getReceipt = async (transactionId: string | number) => {
  const response = await api.get<Receipt>(`/receipts/${transactionId}`);
  return response.data;
};

export default api;