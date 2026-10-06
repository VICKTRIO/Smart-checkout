import { Request, Response } from 'express';
import axios from 'axios';
import { pool } from '../config/db';

interface WhatsAppOrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
}

const sendOrderConfirmation = async (phone: string, invoiceNo: string, amount: number) => {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v20.0';

  if (!accessToken || !phoneNumberId) {
    return { accepted: false, reason: 'not_configured' };
  }

  try {
    const response = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: {
          body: `Smart Checkout order ${invoiceNo} received. Total: KSh ${amount.toLocaleString()}. Payment is pending confirmation.`,
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    // Meta accepts an outbound request before it confirms delivery through a status webhook.
    return { accepted: true, messageId: response.data?.messages?.[0]?.id as string | undefined };
  } catch (error: any) {
    console.error('WhatsApp order confirmation failed:', error.response?.data || error.message);
    return { accepted: false, reason: 'delivery_request_failed' };
  }
};

export const createWhatsAppOrder = async (req: Request, res: Response) => {
  const { business_id, branch_id, customer_phone, customer_name, items } = req.body;

  if (!business_id || !branch_id || !customer_phone || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'business_id, branch_id, customer_phone, and at least one item are required' });
  }

  const validatedItems: WhatsAppOrderItem[] = items.map((item: any) => ({
    product_name: typeof item?.product_name === 'string' ? item.product_name.trim() : '',
    quantity: Number(item?.quantity),
    unit_price: Number(item?.unit_price),
  }));

  if (validatedItems.some((item) => !item.product_name || !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unit_price) || item.unit_price <= 0)) {
    return res.status(400).json({ error: 'Each item must include product_name, a positive whole quantity, and a positive unit_price' });
  }

  const total = validatedItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const invoiceNo = `WA-${Date.now()}`;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const transactionResult = await client.query(
      `INSERT INTO transactions
        (business_id, branch_id, invoice_no, amount, phone_number, status, source, receipt_channel)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', 'WHATSAPP', 'WHATSAPP')
       RETURNING id, invoice_no, amount, status, created_at`,
      [business_id, branch_id, invoiceNo, total, customer_phone]
    );

    const transaction = transactionResult.rows[0];
    for (const item of validatedItems) {
      await client.query(
        `INSERT INTO transaction_items (transaction_id, product_name, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [transaction.id, item.product_name, item.quantity, item.unit_price, item.quantity * item.unit_price]
      );
    }

    await client.query(
      `INSERT INTO whatsapp_orders (transaction_id, customer_name)
       VALUES ($1, $2)`,
      [transaction.id, typeof customer_name === 'string' && customer_name.trim() ? customer_name.trim() : null]
    );
    await client.query('COMMIT');

    const confirmation = await sendOrderConfirmation(customer_phone, transaction.invoice_no, Number(transaction.amount));
    if (confirmation.accepted) {
      await pool.query(
        `UPDATE whatsapp_orders
         SET whatsapp_message_id = $1
         WHERE transaction_id = $2`,
        [confirmation.messageId ?? null, transaction.id]
      );
    }

    return res.status(201).json({
      success: true,
      order: {
        transaction_id: transaction.id,
        invoice_no: transaction.invoice_no,
        total_amount: transaction.amount,
        payment_status: transaction.status,
        created_at: transaction.created_at,
        customer_phone,
        customer_name: customer_name ?? null,
        items: validatedItems.map((item) => ({ ...item, subtotal: item.quantity * item.unit_price })),
      },
      whatsapp: confirmation,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Unable to create WhatsApp order:', error);
    return res.status(500).json({ success: false, error: 'Unable to create WhatsApp order' });
  } finally {
    client.release();
  }
};

export const getWhatsAppOrders = async (req: Request, res: Response) => {
  try {
    const businessId = typeof req.query.business_id === 'string' ? req.query.business_id : '';
    const result = await pool.query(
      `SELECT
         t.id AS transaction_id,
         t.invoice_no,
         t.amount,
         t.phone_number,
         t.status,
         t.mpesa_receipt_number,
         t.created_at,
         w.customer_name,
         w.whatsapp_message_id,
         w.confirmation_sent_at
       FROM transactions t
       JOIN whatsapp_orders w ON w.transaction_id = t.id
       WHERE t.source = 'WHATSAPP'
         AND (NULLIF($1, '')::integer IS NULL OR t.business_id = NULLIF($1, '')::integer)
       ORDER BY t.created_at DESC`,
      [businessId]
    );
    return res.json(result.rows);
  } catch (error: any) {
    console.error('Unable to load WhatsApp orders:', error);
    return res.status(500).json({ success: false, error: 'Unable to load WhatsApp orders' });
  }
};