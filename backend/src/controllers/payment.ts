import { Request, Response } from 'express';
import axios from 'axios';
import { pool } from '../config/db';
import { getMpesaToken } from '../config/mpesa';
import { getIO } from '../sockets/socket';


// =======================================================
// INITIATE STK PUSH
// =======================================================

export const initiateStkPush = async (req: Request, res: Response) => {

  const {
    business_id,
    branch_id,
    cashier_id,
    phone,
    amount,
    items
  } = req.body;

  let createdTransactionId: number | null = null;

  try {

    // ---------------------------------------------------
    // FORMAT PHONE NUMBER
    // Example:
    // 0712345678 -> 254712345678
    // ---------------------------------------------------

    const formattedPhone = phone.startsWith('0')
      ? `254${phone.slice(1)}`
      : phone;


    // ---------------------------------------------------
    // CREATE UNIQUE INVOICE NUMBER
    // ---------------------------------------------------

    const invoiceNo = `INV-${Date.now()}`;


    // ---------------------------------------------------
    // 1. SAVE PENDING TRANSACTION
    // ---------------------------------------------------

    const newTx = await pool.query(
      `INSERT INTO transactions
       (
         business_id,
         branch_id,
         cashier_id,
         invoice_no,
         amount,
         phone_number,
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
       RETURNING id`,
      [
        business_id,
        branch_id,
        cashier_id,
        invoiceNo,
        amount,
        formattedPhone
      ]
    );


    const transactionId = newTx.rows[0].id;
    createdTransactionId = transactionId;


    console.log(
      '📝 [Transaction Created]',
      {
        transactionId,
        invoiceNo,
        amount,
        phone: formattedPhone
      }
    );


    // ---------------------------------------------------
    // 2. SAVE TRANSACTION ITEMS
    // ---------------------------------------------------

    if (items && Array.isArray(items)) {

      for (const item of items) {

        await pool.query(
          `INSERT INTO transaction_items
           (
             transaction_id,
             product_name,
             quantity,
             unit_price,
             total_price
           )
           VALUES ($1, $2, $3, $4, $5)`,
          [
            transactionId,
            item.product_name,
            item.quantity,
            item.unit_price,
            item.quantity * item.unit_price
          ]
        );

      }

    }


    // ---------------------------------------------------
    // 3. GET M-PESA ACCESS TOKEN
    // ---------------------------------------------------

    const token = await getMpesaToken();


    // ---------------------------------------------------
    // 4. GENERATE M-PESA PASSWORD
    // ---------------------------------------------------

    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, '')
      .slice(0, 14);


    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;


    const password = Buffer
      .from(`${shortcode}${passkey}${timestamp}`)
      .toString('base64');


    // ---------------------------------------------------
    // 5. SELECT M-PESA ENVIRONMENT
    // ---------------------------------------------------

    const stkUrl =
      process.env.MPESA_ENVIRONMENT === 'live'
        ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
        : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';


    // ---------------------------------------------------
    // 6. SEND STK PUSH TO M-PESA
    // ---------------------------------------------------

    const stkResponse = await axios.post(
      stkUrl,
      {
        BusinessShortCode: shortcode,

        Password: password,

        Timestamp: timestamp,

        TransactionType: 'CustomerPayBillOnline',

        Amount: amount,

        PartyA: formattedPhone,

        PartyB: shortcode,

        PhoneNumber: formattedPhone,

        CallBackURL: process.env.MPESA_CALLBACK_URL,

        AccountReference: invoiceNo,

        TransactionDesc: `Payment for Invoice ${invoiceNo}`,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );


    // ---------------------------------------------------
    // 7. GET CHECKOUT REQUEST ID
    // ---------------------------------------------------

    const checkoutRequestId =
      stkResponse.data.CheckoutRequestID;


    console.log(
      '📲 [STK Push Created]',
      {
        transactionId,
        invoiceNo,
        checkoutRequestId
      }
    );


    // ---------------------------------------------------
    // 8. SAVE CHECKOUT REQUEST ID
    //
    // This is VERY IMPORTANT.
    //
    // M-Pesa will later send this same ID inside
    // the callback.
    //
    // We use it to identify the correct transaction.
    // ---------------------------------------------------

    await pool.query(
      `UPDATE transactions
       SET mpesa_checkout_request_id = $1
       WHERE id = $2`,
      [
        checkoutRequestId,
        transactionId
      ]
    );


    // ---------------------------------------------------
    // 9. RETURN RESPONSE TO FRONTEND
    // ---------------------------------------------------

    return res.status(200).json({

      success: true,

      message: 'STK Push initiated successfully',

      transaction_id: transactionId,

      invoice_no: invoiceNo,

      checkout_request_id: checkoutRequestId

    });

  } catch (error: any) {

    if (createdTransactionId !== null) {
      await pool.query(
        `UPDATE transactions
         SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'PENDING'`,
        [createdTransactionId]
      );
    }

    console.error(
      '❌ [STK Push Error]:',
      error.response?.data || error.message
    );


    return res.status(500).json({

      success: false,

      error: 'Payment initialization failed'

    });

  }

};



// =======================================================
// M-PESA CALLBACK
// =======================================================

export const mpesaCallback = async (
  req: Request,
  res: Response
) => {

  try {

    // ---------------------------------------------------
    // DEBUG - SHOW CALLBACK
    // ---------------------------------------------------

    console.log(
      '📥 [M-Pesa Callback Received]'
    );

    console.log(
      JSON.stringify(req.body, null, 2)
    );


    // ---------------------------------------------------
    // EXTRACT CALLBACK DATA
    // ---------------------------------------------------

    const callbackData =
      req.body.Body.stkCallback;


    const checkoutRequestId =
      callbackData.CheckoutRequestID;


    const resultCode =
      callbackData.ResultCode;


    // ---------------------------------------------------
    // LOG IMPORTANT VALUES
    // ---------------------------------------------------

    console.log(
      '🔎 [Callback Details]'
    );

    console.log(
      'CheckoutRequestID:',
      checkoutRequestId
    );

    console.log(
      'ResultCode:',
      resultCode
    );

    console.log(
      'ResultDesc:',
      callbackData.ResultDesc
    );



    // ===================================================
    // PAYMENT SUCCESS
    // ===================================================

    if (resultCode === 0) {

      // -------------------------------------------------
      // GET CALLBACK METADATA
      // -------------------------------------------------

      const items =
        callbackData.CallbackMetadata?.Item || [];


      // -------------------------------------------------
      // FIND M-PESA RECEIPT
      // -------------------------------------------------

      const mpesaReceipt =
        items.find(
          (item: any) =>
            item.Name === 'MpesaReceiptNumber'
        )?.Value;



      // -------------------------------------------------
      // UPDATE TRANSACTION
      // -------------------------------------------------

      const updatedTx = await pool.query(
        `UPDATE transactions
         SET
           status = 'COMPLETED',
           mpesa_receipt_number = $1,
           updated_at = CURRENT_TIMESTAMP
         WHERE mpesa_checkout_request_id = $2
         RETURNING *`,
        [
          mpesaReceipt,
          checkoutRequestId
        ]
      );


      // -------------------------------------------------
      // DATABASE DEBUG
      // -------------------------------------------------

      console.log(
        '🔎 [Payment Success] Rows updated:',
        updatedTx.rows.length
      );


      // -------------------------------------------------
      // TRANSACTION FOUND
      // -------------------------------------------------

      if (updatedTx.rows.length > 0) {

        const tx = updatedTx.rows[0];


        // -------------------------------------------------
        // SOCKET ROOM
        // -------------------------------------------------

        const room =
          `business_${tx.business_id}`;


        // -------------------------------------------------
        // GET SOCKET SERVER
        // -------------------------------------------------

        const io = getIO();


        // -------------------------------------------------
        // CHECK CLIENTS CURRENTLY IN ROOM
        // -------------------------------------------------

        const roomSockets =
          io.sockets.adapter.rooms.get(room);


        console.log(
          '📡 [Socket.io] Success Room:',
          room
        );

        console.log(
          '👥 [Socket.io] Clients in room:',
          roomSockets
            ? Array.from(roomSockets)
            : []
        );


        // -------------------------------------------------
        // SEND SUCCESS EVENT
        // -------------------------------------------------

        console.log(
          '📡 [Socket.io] Sending payment_completed'
        );


        io
          .to(room)
          .emit(
            'payment_completed',
            {

              transaction_id:
                tx.id,

              // IMPORTANT:
              // Frontend can use this to identify
              // exactly which payment completed.
              checkout_request_id:
                tx.mpesa_checkout_request_id,

              invoice_no:
                tx.invoice_no,

              mpesa_receipt:
                mpesaReceipt,

              amount:
                tx.amount,

              phone:
                tx.phone_number,

              status:
                'COMPLETED'

            }
          );


        console.log(
          '✅ [Socket.io] payment_completed emitted'
        );


      } else {

        // -------------------------------------------------
        // NO TRANSACTION FOUND
        // -------------------------------------------------

        console.log(
          '⚠️ [Payment Success] No transaction found for CheckoutRequestID:',
          checkoutRequestId
        );

      }

    }



    // ===================================================
    // PAYMENT FAILED
    // ===================================================

    else {

      // -------------------------------------------------
      // UPDATE TRANSACTION AS FAILED
      // -------------------------------------------------

      const updatedTx = await pool.query(
        `UPDATE transactions
         SET
           status = 'FAILED',
           updated_at = CURRENT_TIMESTAMP
         WHERE mpesa_checkout_request_id = $1
         RETURNING *`,
        [
          checkoutRequestId
        ]
      );


      // -------------------------------------------------
      // DATABASE DEBUG
      // -------------------------------------------------

      console.log(
        '🔎 [Payment Failure] Rows updated:',
        updatedTx.rows.length
      );


      // -------------------------------------------------
      // TRANSACTION FOUND
      // -------------------------------------------------

      if (updatedTx.rows.length > 0) {

        const tx = updatedTx.rows[0];


        // -------------------------------------------------
        // SOCKET ROOM
        // -------------------------------------------------

        const room =
          `business_${tx.business_id}`;


        // -------------------------------------------------
        // GET SOCKET SERVER
        // -------------------------------------------------

        const io = getIO();


        // -------------------------------------------------
        // CHECK CLIENTS CURRENTLY IN ROOM
        // -------------------------------------------------

        const roomSockets =
          io.sockets.adapter.rooms.get(room);


        console.log(
          '📡 [Socket.io] Failure Room:',
          room
        );


        console.log(
          '👥 [Socket.io] Clients in room:',
          roomSockets
            ? Array.from(roomSockets)
            : []
        );


        // -------------------------------------------------
        // SEND FAILURE EVENT
        // -------------------------------------------------

        console.log(
          '📡 [Socket.io] Sending payment_failed'
        );


        io
          .to(room)
          .emit(
            'payment_failed',
            {

              transaction_id:
                tx.id,

              // IMPORTANT:
              // Identifies exactly which payment failed.
              checkout_request_id:
                tx.mpesa_checkout_request_id,

              invoice_no:
                tx.invoice_no,

              amount:
                tx.amount,

              phone:
                tx.phone_number,

              status:
                'FAILED',

              // Safaricom result code
              result_code:
                resultCode,

              // Actual reason from M-Pesa
              result_description:
                callbackData.ResultDesc ||
                'The payment was not completed.'

            }
          );


        console.log(
          '❌ [Socket.io] payment_failed emitted'
        );


      } else {

        // -------------------------------------------------
        // NO TRANSACTION FOUND
        // -------------------------------------------------

        console.log(
          '⚠️ [Payment Failure] No transaction found for CheckoutRequestID:',
          checkoutRequestId
        );

      }

    }



    // ===================================================
    // ACKNOWLEDGE CALLBACK TO M-PESA
    // ===================================================

    return res.status(200).json({

      ResultCode: 0,

      ResultDesc: 'Accepted'

    });


  } catch (error: any) {


    // ---------------------------------------------------
    // CALLBACK PROCESSING ERROR
    // ---------------------------------------------------

    console.error(
      '❌ [Callback Processing Error]:',
      error.response?.data ||
      error.message
    );


    return res.status(500).json({

      error: 'Callback processing error'

    });

  }

};