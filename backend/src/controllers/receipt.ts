import { Request, Response } from 'express';
import { pool } from '../config/db';

export const getReceipt = async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;

    const transactionResult = await pool.query(
      `SELECT
         id,
         invoice_no,
         amount,
         phone_number,
         status,
         mpesa_receipt_number,
         created_at
       FROM transactions
       WHERE id = $1`,
      [transactionId]
    );

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const transaction = transactionResult.rows[0];

    // A receipt is only valid after the M-Pesa callback marks this sale complete.
    if (transaction.status !== 'COMPLETED') {
      return res.status(409).json({
        error: 'A receipt is only available for completed payments',
        status: transaction.status,
      });
    }

    const itemsResult = await pool.query(
      `SELECT
         product_name,
         quantity,
         unit_price,
         total_price AS subtotal
       FROM transaction_items
       WHERE transaction_id = $1
       ORDER BY id ASC`,
      [transactionId]
    );

    return res.json({
      receipt_no: `REC-${transaction.id}`,
      transaction_id: transaction.id,
      invoice_no: transaction.invoice_no,
      date: transaction.created_at,
      total_amount: transaction.amount,
      payment_status: transaction.status,
      phone: transaction.phone_number,
      mpesa_receipt: transaction.mpesa_receipt_number,
      items: itemsResult.rows,
    });
  } catch (error: any) {
    console.error('Unable to load receipt:', error);
    return res.status(500).json({ success: false, error: 'Unable to load receipt' });
  }
};