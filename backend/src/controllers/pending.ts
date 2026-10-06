import { Request, Response } from 'express';
import { pool } from '../config/db';

export const getPendingPayments = async (req: Request, res: Response) => {
  try {
    const businessId = typeof req.query.business_id === 'string' ? req.query.business_id : '';
    const result = await pool.query(
      `SELECT
         t.id AS transaction_id,
         t.invoice_no,
         t.amount,
         t.phone_number,
         t.status,
         t.mpesa_checkout_request_id AS payment_identifier,
         t.created_at
       FROM transactions t
       WHERE t.status = 'PENDING'
         AND (NULLIF($1, '')::integer IS NULL OR t.business_id = NULLIF($1, '')::integer)
       ORDER BY t.created_at DESC`,
      [businessId]
    );

    return res.json(result.rows);
  } catch (error: any) {
    console.error('Unable to load pending payments:', error);
    return res.status(500).json({ success: false, error: 'Unable to load pending payments' });
  }
};