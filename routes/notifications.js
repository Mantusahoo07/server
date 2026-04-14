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

// Send notification to kitchen staff with custom sound (Firefox optimized)
export const notifyKitchen = async (title, body, sound, orderId, extraData = {}) => {
  const kitchenSubscribers = roleSubscriptions.get('kitchen');
  
  if (!kitchenSubscribers || kitchenSubscribers.size === 0) {
    console.log('No kitchen staff subscribed');
    return { success: false, sent: 0 };
  }
  
  // Firefox supports custom sound with this payload structure
  const payload = JSON.stringify({
    title: title,
    body: body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    tag: `kitchen-${orderId || Date.now()}`,
    sound: sound,  // Works perfectly in Firefox!
    data: { url: '/kitchen', orderId, ...extraData },
    vibrate: extraData.isReady ? [200, 100, 200] : [500, 200, 500],
    requireInteraction: true,
    urgency: 'high',
    priority: 10,
    // Firefox specific options
    actions: [
      { action: 'open', title: 'Open Kitchen' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    silent: false
  });
  
  let sent = 0;
  let failed = 0;
  
  for (const userId of kitchenSubscribers) {
    const userInfo = subscriptions.get(userId);
    if (userInfo && userInfo.subscription) {
      try {
        await webpush.sendNotification(userInfo.subscription, payload);
        sent++;
        console.log(`✅ Notification sent to ${userInfo.username} (${userInfo.browser})`);
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

// New Dine-In Order
export const notifyKitchenNewOrder = async (order) => {
  const sound = getSoundForOrderType(order);
  const orderNumber = order.displayOrderNumber || order.orderNumber;
  
  let title = '', body = '';
  
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
    default:
      title = '🍽️ New Order';
      body = `Order #${orderNumber}`;
  }
  
  return await notifyKitchen(title, body, sound, order._id, { 
    orderType: order.orderType,
    tableNumber: order.tableNumber,
    deliveryPlatform: order.deliveryPlatform
  });
};

// Order Ready for Billing
export const notifyOrderReady = async (order) => {
  const sound = '/sounds/order-ready.mp3';
  const title = '💰 Order Ready for Billing';
  const body = `Order #${order.displayOrderNumber || order.orderNumber} is ready for payment`;
  
  return await notifyKitchen(title, body, sound, order._id, { isReady: true });
};

// Order Modified
export const notifyKitchenOrderModified = async (order, isRunningOrder = false) => {
  const sound = '/sounds/order-modified.mp3';
  let title = '✏️ Order Modified';
  let body = `Order #${order.displayOrderNumber || order.orderNumber}`;
  
  if (order.tableNumber) {
    body = `Table ${order.tableNumber} - Order #${order.displayOrderNumber || order.orderNumber}`;
  }
  
  if (isRunningOrder) {
    title = '🔄 Running Order Modified';
    body = `Table ${order.tableNumber} - Running Order #${order.displayOrderNumber || order.orderNumber}`;
  }
  
  return await notifyKitchen(title, body, sound, order._id, { isModified: true, isRunningOrder });
};

// Instant Order (Urgent)
export const notifyKitchenInstantOrder = async (order) => {
  const sound = '/sounds/instant-order.mp3';
  const title = '⚡ INSTANT ORDER REQUIRED!';
  const body = `Order #${order.displayOrderNumber || order.orderNumber} needs immediate attention`;
  
  return await notifyKitchen(title, body, sound, order._id, { urgent: true });
};

// Cancellation Request
export const notifyCancellationRequest = async (order, item) => {
  const sound = '/sounds/cancellation-request.mp3';
  const title = '❌ Cancellation Requested';
  const body = `${item.name} from Order #${order.displayOrderNumber || order.orderNumber} needs approval`;
  
  return await notifyKitchen(title, body, sound, order._id, { 
    itemName: item.name,
    isCancellation: true 
  });
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
    const browser = isFirefox ? 'Firefox' : (isSafari ? 'Safari' : 'Other');
    
    subscriptions.set(req.userId.toString(), { 
      subscription, 
      userRole: user.role,
      username: user.username,
      browser: browser
    });
    
    if (user.role === 'kitchen') {
      if (!roleSubscriptions.has('kitchen')) roleSubscriptions.set('kitchen', new Set());
      roleSubscriptions.get('kitchen').add(req.userId.toString());
    }
    
    console.log(`✅ ${user.username} (${user.role}) subscribed from ${browser}`);
    
    // Send welcome notification with sound (Firefox will play it!)
    if (isFirefox && user.role === 'kitchen') {
      const welcomePayload = JSON.stringify({
        title: '🔔 Kitchen Notifications Active',
        body: 'You will now receive real-time order updates with sound!',
        icon: '/icons/icon-192.png',
        tag: 'welcome',
        sound: '/sounds/order-ready.mp3',
        vibrate: [200, 100, 200],
        requireInteraction: false
      });
      
      try {
        await webpush.sendNotification(subscription, welcomePayload);
        console.log('✅ Welcome notification sent with sound');
      } catch (err) {
        console.error('Welcome notification error:', err.message);
      }
    }
    
    res.json({ 
      success: true, 
      browser: browser,
      soundSupported: isFirefox,
      message: isFirefox ? 'Custom sounds enabled!' : 'For best experience, use Firefox browser'
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/unsubscribe', authenticate, async (req, res) => {
  try {
    subscriptions.delete(req.userId.toString());
    const kitchenSet = roleSubscriptions.get('kitchen');
    if (kitchenSet) kitchenSet.delete(req.userId.toString());
    console.log(`❌ User ${req.userId} unsubscribed`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/test-kitchen', authenticate, async (req, res) => {
  try {
    const result = await notifyKitchen(
      '🔔 Test Notification',
      'This is a test notification with custom sound!',
      '/sounds/order-ready.mp3',
      null,
      { test: true }
    );
    res.json({ success: true, result });
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', authenticate, async (req, res) => {
  try {
    const kitchenSubscribers = roleSubscriptions.get('kitchen') || new Set();
    const browserStats = { Firefox: 0, Safari: 0, Other: 0 };
    
    for (const userId of kitchenSubscribers) {
      const info = subscriptions.get(userId);
      if (info) {
        if (info.browser === 'Firefox') browserStats.Firefox++;
        else if (info.browser === 'Safari') browserStats.Safari++;
        else browserStats.Other++;
      }
    }
    
    res.json({
      kitchenSubscribers: kitchenSubscribers.size,
      totalSubscriptions: subscriptions.size,
      browserStats,
      recommendedBrowser: 'Firefox',
      soundSupported: true
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
