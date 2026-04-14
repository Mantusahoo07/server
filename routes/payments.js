import express from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

router.post('/create-order', authenticate, async (req, res) => {
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
    console.error('Razorpay error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/verify', authenticate, async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

router.post('/credit-sale', authenticate, async (req, res) => {
  try {
    const { orderId, customerName, customerPhone, dueDate, amount } = req.body;
    
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    order.payment = {
      method: 'credit',
      status: 'credit_due',
      amount,
      transactionId: `CREDIT_${Date.now()}`,
      timestamp: new Date(),
      dueDate: dueDate ? new Date(dueDate) : null,
      customerName,
      customerPhone
    };
    order.status = 'completed';
    order.completedAt = new Date();
    await order.save();
    
    res.json({ success: true, transactionId: `CREDIT_${Date.now()}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;