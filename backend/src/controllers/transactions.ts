import { Request, Response } from 'express';
import { pool } from '../config/db';

const paymentStatuses = new Set(['PENDING', 'COMPLETED', 'FAILED']);

export const getTransactions = async (req: Request, res: Response) => {
  try {
    const { business_id, status, from, to } = req.query;
    const values: string[] = [];
    const conditions: string[] = [];

    if (typeof business_id === 'string' && business_id.trim()) {
      values.push(business_id);
      conditions.push(`t.business_id = $${values.length}`);
    }

    if (typeof status === 'string' && paymentStatuses.has(status)) {
      values.push(status);
      conditions.push(`t.status = $${values.length}`);
    }

    if (typeof from === 'string' && from.trim()) {
      values.push(from);
      conditions.push(`t.created_at >= $${values.length}::timestamptz`);
    }

    if (typeof to === 'string' && to.trim()) {
      values.push(to);
      conditions.push(`t.created_at < ($${values.length}::date + INTERVAL '1 day')`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT
         t.id AS transaction_id,
         t.invoice_no,
         t.amount,
         t.status,
         t.phone_number,
         t.mpesa_receipt_number,
         t.mpesa_checkout_request_id AS payment_identifier,
         t.created_at,
         c.name AS cashier_name
       FROM transactions t
       LEFT JOIN cashiers c ON c.id = t.cashier_id
       ${where}
       ORDER BY t.created_at DESC`,
      values
    );

    return res.json(result.rows);
  } catch (error: any) {
    console.error('Unable to load transaction history:', error);
    return res.status(500).json({ success: false, error: 'Unable to load transaction history' });
  }
};