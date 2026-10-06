import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export const getMpesaToken = async (): Promise<string> => {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  const url = process.env.MPESA_ENVIRONMENT === 'live'
    ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
    : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });
    return response.data.access_token;
  } catch (error: any) {
    console.error('❌ [M-Pesa Token Error]:', error.response?.data || error.message);
    throw new Error('Failed to generate M-Pesa Access Token');
  }
};