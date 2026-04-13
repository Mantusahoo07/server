// server-main/routes/notifications.js
import express from 'express';
import webpush from 'web-push';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Store subscriptions in memory (use database in production)
let subscriptions = new Map();

// Get VAPID public key (for frontend)
router.get('/vapid-public-key', (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }
  res.json({ publicKey });
});

// Subscribe to notifications
router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const subscription = req.body;
    const userId = req.userId;
    
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    
    subscriptions.set(userId.toString(), subscription);
    
    console.log(`✅ User ${userId} subscribed to notifications`);
    
    // Send a welcome notification
    const welcomePayload = JSON.stringify({
      title: 'POS System',
      body: 'Notifications enabled! You will now receive real-time updates.',
      icon: '/icon-192.png',
      tag: 'welcome'
    });
    
    try {
      await webpush.sendNotification(subscription, welcomePayload);
    } catch (err) {
      console.error('Error sending welcome notification:', err);
    }
    
    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Error subscribing to notifications:', error);
    res.status(500).json({ error: error.message });
  }
});

// Unsubscribe from notifications
router.post('/unsubscribe', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    subscriptions.delete(userId.toString());
    console.log(`❌ User ${userId} unsubscribed from notifications`);
    res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send test notification
router.post('/test', authenticate, async (req, res) => {
  try {
    const { title, body } = req.body;
    const userId = req.userId;
    
    const subscription = subscriptions.get(userId.toString());
    if (!subscription) {
      return res.status(404).json({ error: 'No subscription found for this user' });
    }
    
    const payload = JSON.stringify({
      title: title || 'Test Notification',
      body: body || 'This is a test notification from your POS System!',
      icon: '/icon-192.png',
      tag: 'test'
    });
    
    await webpush.sendNotification(subscription, payload);
    
    res.json({ success: true, message: 'Test notification sent' });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get subscription stats (admin only)
router.get('/stats', authenticate, async (req, res) => {
  try {
    const user = await import('../models/User.js').then(m => m.default);
    const currentUser = await user.findById(req.userId);
    
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    res.json({
      totalSubscriptions: subscriptions.size,
      users: Array.from(subscriptions.keys())
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper functions for other routes
const sendNotificationToUser = async (userId, payload) => {
  const subscription = subscriptions.get(userId.toString());
  if (!subscription) return false;
  
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (error) {
    if (error.statusCode === 410) {
      subscriptions.delete(userId.toString());
    }
    return false;
  }
};

const sendNotificationToAll = async (payload) => {
  const results = [];
  for (const [userId, subscription] of subscriptions) {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      results.push({ userId, success: true });
    } catch (error) {
      results.push({ userId, success: false, error: error.message });
      if (error.statusCode === 410) {
        subscriptions.delete(userId);
      }
    }
  }
  return results;
};

const notifyNewOrder = async (order) => {
  const payload = {
    title: '🔔 New Order Received!',
    body: `Order #${order.displayOrderNumber || order.orderNumber} - ${order.items.length} items`,
    icon: '/icon-192.png',
    tag: `new-order-${order._id}`,
    data: { url: '/kitchen', orderId: order._id },
    vibrate: [500, 200, 500]
  };
  return await sendNotificationToAll(payload);
};

const notifyOrderReady = async (order) => {
  const payload = {
    title: '💰 Order Ready for Billing!',
    body: `Order #${order.displayOrderNumber || order.orderNumber} is ready for payment`,
    icon: '/icon-192.png',
    tag: `order-ready-${order._id}`,
    data: { url: '/orders', orderId: order._id },
    vibrate: [200, 100, 200]
  };
  return await sendNotificationToAll(payload);
};

const notifyCancellationRequest = async (order, item) => {
  const payload = {
    title: '❌ Cancellation Requested',
    body: `${item.name} from Order #${order.displayOrderNumber || order.orderNumber} needs approval`,
    icon: '/icon-192.png',
    tag: `cancellation-${order._id}`,
    data: { url: '/orders', orderId: order._id },
    vibrate: [300, 100, 300]
  };
  return await sendNotificationToAll(payload);
};

const notifyInstantOrder = async (order) => {
  const payload = {
    title: '⚡ INSTANT ORDER REQUIRED!',
    body: `Order #${order.displayOrderNumber || order.orderNumber} needs immediate attention`,
    icon: '/icon-192.png',
    tag: `instant-order-${order._id}`,
    data: { url: '/kitchen', orderId: order._id },
    vibrate: [500, 200, 500, 200, 500]
  };
  return await sendNotificationToAll(payload);
};

export default router;
export {
  sendNotificationToUser,
  sendNotificationToAll,
  notifyNewOrder,
  notifyOrderReady,
  notifyCancellationRequest,
  notifyInstantOrder
};
