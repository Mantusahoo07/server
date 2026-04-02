import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order.js';

// Initialize Razorpay with error handling
let razorpay;
try {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
  console.log('Razorpay initialized successfully');
} catch (error) {
  console.error('Razorpay initialization error:', error);
}

export const createOrder = async (req, res) => {
  try {
    const { amount, currency, receipt } = req.body;
    
    console.log('Creating Razorpay order with params:', { amount, currency, receipt });
    console.log('Razorpay Key ID:', process.env.RAZORPAY_KEY_ID ? 'Present' : 'Missing');
    console.log('Razorpay Key Secret:', process.env.RAZORPAY_KEY_SECRET ? 'Present' : 'Missing');
    
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('Razorpay credentials missing');
      return res.status(500).json({ 
        error: 'Payment gateway not configured',
        details: 'Razorpay credentials missing'
      });
    }
    
    const options = {
      amount: Number(amount), // amount in paise
      currency: currency || 'INR',
      receipt: receipt,
      payment_capture: 1
    };
    
    console.log('Razorpay order options:', options);
    
    const order = await razorpay.orders.create(options);
    console.log('Razorpay order created successfully:', order.id);
    res.json(order);
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    console.error('Error details:', error.error);
    res.status(500).json({ 
      error: error.error?.description || error.message || 'Failed to create payment order',
      details: error.error
    });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;
    
    console.log('Verifying payment:', { orderId, paymentId });
    
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');
    
    const isAuthentic = expectedSignature === signature;
    
    if (isAuthentic) {
      console.log('Payment verified successfully for order:', orderId);
      res.json({ success: true });
    } else {
      console.log('Invalid signature for payment:', paymentId);
      res.status(400).json({ success: false, error: 'Invalid signature' });
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const refundPayment = async (req, res) => {
  try {
    const { paymentId, amount, reason } = req.body;
    
    const refund = await razorpay.payments.refund(paymentId, {
      amount: amount,
      notes: {
        reason: reason || 'Customer refund'
      }
    });
    
    res.json({ success: true, refund });
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getPaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const payment = await razorpay.payments.fetch(paymentId);
    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const creditSale = async (req, res) => {
  try {
    const { orderId, customerName, customerPhone, customerEmail, dueDate, amount } = req.body;
    
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    order.payment = {
      method: 'credit',
      status: 'pending',
      amount: amount,
      customerName,
      customerPhone,
      customerEmail,
      dueDate: new Date(dueDate),
      timestamp: new Date()
    };
    order.status = 'completed';
    
    await order.save();
    
    res.json({ 
      success: true, 
      transactionId: `CREDIT_${Date.now()}`,
      message: 'Credit sale recorded successfully'
    });
  } catch (error) {
    console.error('Credit sale error:', error);
    res.status(500).json({ error: error.message });
  }
};
