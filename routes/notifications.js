import express from 'express';
import webpush from 'web-push';
import { authenticate } from '../middleware/auth.js';
import User from '../models/User.js';

const router = express.Router();

let subscriptions = new Map();
let roleSubscriptions = new Map();

// Sound mapping for different order types
const getSoundForOrderType = (order) => {
  switch (order.orderType) {
    case 'dine-in':
      return '/sounds/new-dine-in.mp3';
    case 'takeaway':
      return '/sounds/new-takeaway.mp3';
    case 'delivery':
      if (order.deliveryPlatform === 'zomato') return '/sounds/new-zomato.mp3';
      if (order.deliveryPlatform === 'swiggy') return '/sounds/new-swiggy.mp3';
      return '/sounds/new-delivery.mp3';
    default:
      return '/sounds/new-dine-in.mp3';
  }
};

// Send notification to kitchen staff with custom sound
export const notifyKitchen = async (title, body, sound, orderId, extraData = {}) => {
  const kitchenSubscribers = roleSubscriptions.get('kitchen');
  
  if (!kitchenSubscribers || kitchenSubscribers.size === 0) {
    console.log('No kitchen staff subscribed');
    return { success: false, sent: 0 };
  }
  
  // For browsers that support custom sound (Firefox, Safari)
  const payload = JSON.stringify({
    title: title,
    body: body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    tag: `kitchen-${orderId || Date.now()}`,
    sound: sound,  // This works in Firefox!
    data: { url: '/kitchen', orderId, ...extraData },
    vibrate: extraData.isReady ? [200, 100, 200] : [500, 200, 500],
    requireInteraction: true,
    urgency: 'high',
    priority: 10
  });
  
  let sent = 0;
  let failed = 0;
  
  for (const userId of kitchenSubscribers) {
    const userInfo = subscriptions.get(userId);
    if (userInfo && userInfo.subscription) {
      try {
        await webpush.sendNotification(userInfo.subscription, payload);
        sent++;
        console.log(`✅ Notification sent to ${userInfo.username}`);
      } catch (error) {
        console.error(`Failed to send to ${userId}:`, error.message);
        failed++;
        if (error.statusCode === 410) {
          subscriptions.delete(userId);
          kitchenSubscribers.delete(userId);
        }
      }
    }
  }
  
  console.log(`📊 Result: ${sent} sent, ${failed} failed`);
  return { success: true, sent, failed };
};

// Notification for new order with custom sound
export const notifyKitchenNewOrder = async (order) => {
  const sound = getSoundForOrderType(order);
  let title = '', body = '';
  const orderNumber = order.displayOrderNumber || order.orderNumber;
  
  switch (order.orderType) {
    case 'dine-in':
      title = '🍽️ New Dine-In Order';
      body = `Table ${order.tableNumber} - Order #${orderNumber}`;
      break;
    case 'takeaway':
      title = '📦 New Takeaway Order';
      body = `Order #${orderNumber}`;
      break;
    case 'delivery':
      if (order.deliveryPlatform === 'zomato') {
        title = '🛍️ New Zomato Order';
      } else if (order.deliveryPlatform === 'swiggy') {
        title = '🍔 New Swiggy Order';
      } else {
        title = '🚚 New Home Delivery Order';
      }
      body = `Order #${orderNumber}`;
      break;
  }
  
  return await notifyKitchen(title, body, sound, order._id, { orderType: order.orderType });
};

// Notification for order ready with custom sound
export const notifyOrderReady = async (order) => {
  const sound = '/sounds/order-ready.mp3';
  const title = '💰 Order Ready for Billing';
  const body = `Order #${order.displayOrderNumber || order.orderNumber} is ready for payment`;
  
  return await notifyKitchen(title, body, sound, order._id, { isReady: true });
};

// Notification for order modified with custom sound
export const notifyKitchenOrderModified = async (order) => {
  const sound = '/sounds/order-modified.mp3';
  const title = '✏️ Order Modified';
  const body = `Order #${order.displayOrderNumber || order.orderNumber} has been modified`;
  
  return await notifyKitchen(title, body, sound, order._id, { isModified: true });
};

// Notification for instant order with custom sound
export const notifyKitchenInstantOrder = async (order) => {
  const sound = '/sounds/instant-order.mp3';
  const title = '⚡ INSTANT ORDER REQUIRED!';
  const body = `Order #${order.displayOrderNumber || order.orderNumber} needs immediate attention`;
  
  return await notifyKitchen(title, body, sound, order._id, { urgent: true });
};

// Routes
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const subscription = req.body;
    const user = await User.findById(req.userId);
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Detect browser from user agent
    const userAgent = req.headers['user-agent'] || '';
    const isFirefox = userAgent.includes('Firefox');
    const isSafari = userAgent.includes('Safari') && !userAgent.includes('Chrome');
    
    subscriptions.set(req.userId.toString(), { 
      subscription, 
      userRole: user.role,
      username: user.username,
      browser: isFirefox ? 'firefox' : (isSafari ? 'safari' : 'other')
    });
    
    if (user.role === 'kitchen') {
      if (!roleSubscriptions.has('kitchen')) roleSubscriptions.set('kitchen', new Set());
      roleSubscriptions.get('kitchen').add(req.userId.toString());
    }
    
    console.log(`✅ ${user.username} (${user.role}) subscribed from ${isFirefox ? 'Firefox' : (isSafari ? 'Safari' : 'other')} browser`);
    
    res.json({ 
      success: true, 
      browser: isFirefox ? 'firefox' : (isSafari ? 'safari' : 'other'),
      soundSupported: isFirefox || isSafari
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/unsubscribe', authenticate, async (req, res) => {
  try {
    subscriptions.delete(req.userId.toString());
    const kitchenSet = roleSubscriptions.get('kitchen');
    if (kitchenSet) kitchenSet.delete(req.userId.toString());
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', authenticate, async (req, res) => {
  try {
    const kitchenSubscribers = roleSubscriptions.get('kitchen') || new Set();
    const browserStats = { firefox: 0, safari: 0, other: 0 };
    
    for (const userId of kitchenSubscribers) {
      const info = subscriptions.get(userId);
      if (info) {
        if (info.browser === 'firefox') browserStats.firefox++;
        else if (info.browser === 'safari') browserStats.safari++;
        else browserStats.other++;
      }
    }
    
    res.json({
      kitchenSubscribers: kitchenSubscribers.size,
      totalSubscriptions: subscriptions.size,
      browserStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
