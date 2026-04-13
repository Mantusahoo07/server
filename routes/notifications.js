import express from 'express';
import webpush from 'web-push';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Store subscriptions in memory (use database in production)
let subscriptions = new Map();

// Generate VAPID keys (run once and save to .env)
const generateVapidKeys = () => {
  const vapidKeys = webpush.generateVAPIDKeys();
  console.log('VAPID Public Key:', vapidKeys.publicKey);
  console.log('VAPID Private Key:', vapidKeys.privateKey);
  return vapidKeys;
};

// Initialize web-push with VAPID keys
const initializeWebPush = () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  
  if (!publicKey || !privateKey) {
    console.log('⚠️ VAPID keys not found. Generating new keys...');
    const keys = generateVapidKeys();
    console.log('⚠️ Please add these to your .env file:');
    console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
    console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
    return false;
  }
  
  webpush.setVapidDetails(
    'mailto:admin@pos-system.com',
    publicKey,
    privateKey
  );
  return true;
};

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
    
    // Validate subscription object
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    
    // Store subscription (in memory - use database in production)
    subscriptions.set(userId, subscription);
    
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
    subscriptions.delete(userId);
    console.log(`❌ User ${userId} unsubscribed from notifications`);
    res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send notification to specific user
const sendNotificationToUser = async (userId, payload) => {
  const subscription = subscriptions.get(userId);
  if (!subscription) {
    console.log(`No subscription found for user ${userId}`);
    return false;
  }
  
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    console.log(`✅ Notification sent to user ${userId}`);
    return true;
  } catch (error) {
    console.error(`Error sending notification to user ${userId}:`, error);
    
    // If subscription expired, remove it
    if (error.statusCode === 410) {
      subscriptions.delete(userId);
      console.log(`Removed expired subscription for user ${userId}`);
    }
    return false;
  }
};

// Send notification to all subscribed users
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

// Send test notification (for debugging)
router.post('/test', authenticate, async (req, res) => {
  try {
    const { title, body } = req.body;
    const userId = req.userId;
    
    const payload = {
      title: title || 'Test Notification',
      body: body || 'This is a test notification from your POS System!',
      icon: '/icon-192.png',
      tag: 'test'
    };
    
    const sent = await sendNotificationToUser(userId, payload);
    
    if (sent) {
      res.json({ success: true, message: 'Test notification sent' });
    } else {
      res.status(404).json({ error: 'No subscription found for this user' });
    }
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Broadcast order notification to all kitchen staff
const notifyNewOrder = async (order) => {
  const payload = {
    title: '🔔 New Order Received!',
    body: `Order #${order.displayOrderNumber || order.orderNumber} - ${order.items.length} items`,
    icon: '/icon-192.png',
    tag: `new-order-${order._id}`,
    data: { url: '/kitchen', orderId: order._id },
    vibrate: [500, 200, 500]
  };
  
  // Send to kitchen staff (you can filter by role in production)
  return await sendNotificationToAll(payload);
};

// Notify order ready for billing
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

// Notify cancellation request
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

// Notify instant order
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

// Get subscription count
router.get('/stats', authenticate, async (req, res) => {
  res.json({
    totalSubscriptions: subscriptions.size,
    users: Array.from(subscriptions.keys())
  });
});

export default router;
export { 
  notifyNewOrder, 
  notifyOrderReady, 
  notifyCancellationRequest, 
  notifyInstantOrder,
  sendNotificationToUser,
  sendNotificationToAll
};
