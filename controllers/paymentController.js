import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order.js';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

export const createOrder = async (req, res) => {
  try {
    const { amount, currency, receipt } = req.body;
    
    console.log('Creating Razorpay order:', { amount, currency, receipt });
    
    const options = {
      amount: amount, // amount in paise
      currency: currency || 'INR',
      receipt: receipt,
      payment_capture: 1
    };
    
    const order = await razorpay.orders.create(options);
    console.log('Razorpay order created:', order);
    res.json(order);
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;
    
    console.log('Verifying payment:', { orderId, paymentId, signature });
    
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');
    
    const isAuthentic = expectedSignature === signature;
    
    if (isAuthentic) {
      // Update order with payment details
      await Order.findOneAndUpdate(
        { 'payment.orderId': orderId },
        {
          'payment.status': 'completed',
          'payment.paymentId': paymentId,
          'payment.verifiedAt': new Date(),
          'payment.method': 'card'
        }
      );
      
      console.log('Payment verified successfully');
      res.json({ success: true });
    } else {
      console.log('Invalid signature');
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
    
    await Order.findOneAndUpdate(
      { 'payment.paymentId': paymentId },
      {
        status: 'refunded',
        'payment.refundId': refund.id,
        'payment.refundAmount': amount,
        'payment.refundedAt': new Date()
      }
    );
    
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

// Credit sale endpoint
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
