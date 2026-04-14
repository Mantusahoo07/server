import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order.js';

let razorpay;
try {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
  console.log('Razorpay initialized');
} catch (error) {
  console.error('Razorpay initialization error:', error);
}

export const createOrder = async (req, res) => {
  try {
    const { amount, currency, receipt } = req.body;
    
    const options = {
      amount: Number(amount),
      currency: currency || 'INR',
      receipt: receipt || `order_${Date.now()}`,
      payment_capture: 1
    };
    
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;
    
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');
    
    if (expectedSignature === signature) {
      res.json({ success: true });
    } else {
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
      notes: { reason: reason || 'Customer refund' }
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
    console.error('Payment status error:', error);
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
      status: 'credit_due',
      amount: amount,
      transactionId: `CREDIT_${Date.now()}`,
      timestamp: new Date(),
      dueDate: dueDate ? new Date(dueDate) : null,
      customerName,
      customerPhone,
      customerEmail: customerEmail || ''
    };
    order.status = 'completed';
    order.completedAt = new Date();
    
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