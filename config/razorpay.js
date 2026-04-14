import Razorpay from 'razorpay';

let razorpayInstance = null;

export const getRazorpayInstance = () => {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return razorpayInstance;
};

export const validateWebhookSignature = (body, signature, secret) => {
  const crypto = await import('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
  return expectedSignature === signature;
};