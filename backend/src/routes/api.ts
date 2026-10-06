import { Router } from 'express';
import { initiateStkPush, mpesaCallback } from '../controllers/payment';
import { getPendingPayments } from '../controllers/pending';
import { getReceipt } from '../controllers/receipt';
import { getTransactions } from '../controllers/transactions';
import { createWhatsAppOrder, getWhatsAppOrders } from '../controllers/whatsapp';

const router = Router();

// Payment endpoints
router.post('/payments/stkpush', initiateStkPush);
router.post('/payments/callback', mpesaCallback);
router.get( '/receipts/:transactionId', getReceipt);
router.get('/transactions', getTransactions);
router.post('/whatsapp/orders', createWhatsAppOrder);
router.get('/whatsapp/orders', getWhatsAppOrders);
router.get( '/pending-payments', getPendingPayments);

export default router;