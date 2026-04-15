import express from 'express';
import webpush from 'web-push';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Store subscriptions with user info
let subscriptions = new Map();
let roleSubscriptions = new Map();

// Get VAPID public key (for frontend)
router.get('/vapid-public-key', (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  console.log('🔑 VAPID public key requested, present:', !!publicKey);
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
    
    console.log('📝 Subscription request for user:', userId);
    
    const User = await import('../models/User.js').then(m => m.default);
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    
    const userInfo = {
      subscription,
      userRole: user.role,
      username: user.username,
      subscribedAt: new Date()
    };
    
    subscriptions.set(userId.toString(), userInfo);
    
    // Add to role-based subscriptions
    if (user.role === 'kitchen') {
      if (!roleSubscriptions.has('kitchen')) {
        roleSubscriptions.set('kitchen', new Set());
      }
      roleSubscriptions.get('kitchen').add(userId.toString());
      console.log(`✅ Kitchen user ${user.username} subscribed`);
    }
    
    if (user.role === 'admin') {
      if (!roleSubscriptions.has('admin')) {
        roleSubscriptions.set('admin', new Set());
      }
      roleSubscriptions.get('admin').add(userId.toString());
      console.log(`✅ Admin user ${user.username} subscribed`);
    }
    
    res.json({ 
      success: true, 
      role: user.role,
      kitchenSubscribers: roleSubscriptions.get('kitchen')?.size || 0,
      adminSubscribers: roleSubscriptions.get('admin')?.size || 0
    });
  } catch (error) {
    console.error('Error subscribing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Unsubscribe
router.post('/unsubscribe', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const userInfo = subscriptions.get(userId.toString());
    
    if (userInfo) {
      if (userInfo.userRole === 'kitchen') {
        const kitchenSet = roleSubscriptions.get('kitchen');
        if (kitchenSet) {
          kitchenSet.delete(userId.toString());
        }
      }
      if (userInfo.userRole === 'admin') {
        const adminSet = roleSubscriptions.get('admin');
        if (adminSet) {
          adminSet.delete(userId.toString());
        }
      }
      subscriptions.delete(userId.toString());
      console.log(`❌ User ${userId} unsubscribed`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send notification to kitchen staff only
const notifyKitchen = async (title, body, sound, orderId, extraData = {}) => {
  const kitchenSubscribers = roleSubscriptions.get('kitchen');
  
  console.log(`📨 Kitchen subscribers: ${kitchenSubscribers?.size || 0}`);
  console.log(`📨 Title: ${title}`);
  console.log(`📨 Body: ${body}`);
  
  if (!kitchenSubscribers || kitchenSubscribers.size === 0) {
    console.log('❌ No kitchen staff subscribed');
    return { success: false, sent: 0 };
  }
  
  let soundPath = sound ? `/sounds/${sound}.mp3` : '/sounds/new-dine-in.mp3';
  
  const payload = JSON.stringify({
    title: title,
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-96.png',
    tag: `kitchen-${orderId || Date.now()}`,
    sound: soundPath,
    data: { url: '/kitchen', orderId, ...extraData },
    vibrate: [500, 200, 500],
    requireInteraction: true
  });
  
  let sent = 0;
  let failed = 0;
  
  for (const userId of kitchenSubscribers) {
    const userInfo = subscriptions.get(userId);
    if (userInfo && userInfo.subscription) {
      try {
        await webpush.sendNotification(userInfo.subscription, payload);
        sent++;
        console.log(`✅ Sent to kitchen: ${userInfo.username}`);
      } catch (error) {
        console.error(`❌ Failed to send to kitchen ${userId}:`, error.message);
        failed++;
        if (error.statusCode === 410) {
          subscriptions.delete(userId);
          kitchenSubscribers.delete(userId);
        }
      }
    }
  }
  
  return { success: true, sent, failed };
};

// Send notification to admin only
const notifyAdmin = async (title, body, sound, orderId, extraData = {}) => {
  const adminSubscribers = roleSubscriptions.get('admin');
  
  console.log(`📨 Admin subscribers: ${adminSubscribers?.size || 0}`);
  console.log(`📨 Title: ${title}`);
  console.log(`📨 Body: ${body}`);
  
  if (!adminSubscribers || adminSubscribers.size === 0) {
    console.log('❌ No admin subscribed');
    return { success: false, sent: 0 };
  }
  
  let soundPath = sound ? `/sounds/${sound}.mp3` : '/sounds/order-ready.mp3';
  
  const payload = JSON.stringify({
    title: title,
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-96.png',
    tag: `admin-${orderId || Date.now()}`,
    sound: soundPath,
    data: { url: '/orders', orderId, ...extraData },
    vibrate: [500, 200, 500],
    requireInteraction: true
  });
  
  let sent = 0;
  let failed = 0;
  
  for (const userId of adminSubscribers) {
    const userInfo = subscriptions.get(userId);
    if (userInfo && userInfo.subscription) {
      try {
        await webpush.sendNotification(userInfo.subscription, payload);
        sent++;
        console.log(`✅ Sent to admin: ${userInfo.username}`);
      } catch (error) {
        console.error(`❌ Failed to send to admin ${userId}:`, error.message);
        failed++;
        if (error.statusCode === 410) {
          subscriptions.delete(userId);
          adminSubscribers.delete(userId);
        }
      }
    }
  }
  
  return { success: true, sent, failed };
};

// ============ KITCHEN NOTIFICATIONS ============

// 1. New order received (Kitchen)
export const notifyKitchenNewOrder = async (order) => {
  const orderNumber = order.displayOrderNumber || order.orderNumber;
  let title = '';
  let body = '';
  let soundFile = 'new-dine-in';
  
  switch (order.orderType) {
    case 'dine-in':
      title = '🍽️ New Dine-In Order';
      body = `Table ${order.tableNumber} - Order #${orderNumber}`;
      soundFile = 'new-dine-in';
      break;
    case 'takeaway':
      title = '📦 New Takeaway Order';
      body = `Order #${orderNumber}`;
      soundFile = 'new-takeaway';
      break;
    case 'delivery':
      if (order.deliveryPlatform === 'zomato') {
        title = '🛍️ New Zomato Order';
        soundFile = 'new-zomato';
      } else if (order.deliveryPlatform === 'swiggy') {
        title = '🍔 New Swiggy Order';
        soundFile = 'new-swiggy';
      } else {
        title = '🚚 New Home Delivery Order';
        soundFile = 'new-delivery';
      }
      body = `Order #${orderNumber}`;
      break;
    default:
      title = '🍽️ New Order';
      body = `Order #${orderNumber}`;
  }
  
  return await notifyKitchen(title, body, soundFile, order._id, { orderType: order.orderType });
};

// 2. Order Modified (Kitchen) - Item added, quantity increased/decreased, item removed
export const notifyKitchenOrderModified = async (order, modificationType, itemName, quantityChange) => {
  const orderNumber = order.displayOrderNumber || order.orderNumber;
  let title = '✏️ Order Modified';
  let body = '';
  let soundFile = 'order-modified';
  
  if (modificationType === 'item_added') {
    body = `+${quantityChange}× ${itemName} added to Order #${orderNumber}`;
  } else if (modificationType === 'quantity_increased') {
    body = `${itemName} quantity increased in Order #${orderNumber}`;
  } else if (modificationType === 'quantity_decreased') {
    body = `${itemName} quantity decreased in Order #${orderNumber}`;
  } else if (modificationType === 'item_removed') {
    body = `${itemName} removed from Order #${orderNumber}`;
  } else {
    body = `Order #${orderNumber} has been modified`;
  }
  
  if (order.tableNumber) {
    body = `Table ${order.tableNumber} - ${body}`;
  }
  
  if (order.isRunningOrder) {
    title = '🔄 Running Order Modified';
  }
  
  return await notifyKitchen(title, body, soundFile, order._id, { modificationType });
};

// 3. Order Cancelled (Kitchen)
export const notifyKitchenOrderCancelled = async (order) => {
  const orderNumber = order.displayOrderNumber || order.orderNumber;
  const title = '❌ Order Cancelled';
  let body = `Order #${orderNumber} has been cancelled`;
  
  if (order.tableNumber) {
    body = `Table ${order.tableNumber} - ${body}`;
  }
  
  const soundFile = 'order-cancelled';
  
  return await notifyKitchen(title, body, soundFile, order._id);
};

// ============ ADMIN NOTIFICATIONS ============

// 1. Item marked ready (Admin)
export const notifyAdminItemReady = async (order, itemName, itemQuantity) => {
  const orderNumber = order.displayOrderNumber || order.orderNumber;
  const title = '✅ Item Ready';
  const body = `${itemQuantity}× ${itemName} is ready for Order #${orderNumber}`;
  const soundFile = 'order-ready';
  
  return await notifyAdmin(title, body, soundFile, order._id, { itemName, itemQuantity });
};

// 2. Order ready for billing (Admin)
export const notifyAdminOrderReady = async (order) => {
  const orderNumber = order.displayOrderNumber || order.orderNumber;
  const title = '💰 Order Ready for Billing';
  let body = `Order #${orderNumber} is ready for payment`;
  
  if (order.tableNumber) {
    body = `Table ${order.tableNumber} - ${body}`;
  }
  
  const soundFile = 'order-ready';
  
  return await notifyAdmin(title, body, soundFile, order._id);
};

// Test endpoints
router.post('/test-kitchen', authenticate, async (req, res) => {
  try {
    const result = await notifyKitchen('🔔 Test', 'Test notification for kitchen', 'new-dine-in', null);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/test-admin', authenticate, async (req, res) => {
  try {
    const result = await notifyAdmin('🔔 Test', 'Test notification for admin', 'order-ready', null);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stats endpoint
router.get('/stats', authenticate, async (req, res) => {
  try {
    const kitchenSubscribers = roleSubscriptions.get('kitchen') || new Set();
    const adminSubscribers = roleSubscriptions.get('admin') || new Set();
    const subscribers = [];
    
    for (const userId of kitchenSubscribers) {
      const info = subscriptions.get(userId);
      if (info) {
        subscribers.push({ userId, username: info.username, role: info.userRole });
      }
    }
    
    for (const userId of adminSubscribers) {
      const info = subscriptions.get(userId);
      if (info && !subscribers.find(s => s.userId === userId)) {
        subscribers.push({ userId, username: info.username, role: info.userRole });
      }
    }
    
    res.json({
      kitchenSubscribersCount: kitchenSubscribers.size,
      adminSubscribersCount: adminSubscribers.size,
      subscribers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
