// server-main/routes/notifications.js

import express from 'express';
import webpush from 'web-push';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Store subscriptions with user info
let subscriptions = new Map();
let roleSubscriptions = new Map();

// Get VAPID public key
router.get('/vapid-public-key', (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }
  res.json({ publicKey });
});

// Check notification status
router.get('/status', authenticate, (req, res) => {
  res.json({
    webPushConfigured: !!process.env.VAPID_PUBLIC_KEY,
    kitchenSubscribers: roleSubscriptions.get('kitchen')?.size || 0,
    totalSubscribers: subscriptions.size,
    environment: process.env.NODE_ENV
  });
});

// Subscribe to notifications
router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const subscription = req.body;
    const userId = req.userId;
    
    console.log('📝 Subscription request for user:', userId);
    console.log('Subscription endpoint:', subscription.endpoint?.substring(0, 50) + '...');
    
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
    
    // Only track kitchen users for role-based notifications
    if (user.role === 'kitchen') {
      if (!roleSubscriptions.has('kitchen')) {
        roleSubscriptions.set('kitchen', new Set());
      }
      roleSubscriptions.get('kitchen').add(userId.toString());
      console.log(`✅ Kitchen user ${user.username} subscribed`);
      console.log(`📊 Total kitchen subscribers: ${roleSubscriptions.get('kitchen').size}`);
      
      // Send welcome notification
      try {
        const welcomePayload = JSON.stringify({
          title: '🔔 Kitchen Notifications Active',
          body: 'You will receive real-time order updates!',
          icon: '/icon-192.png',
          tag: 'kitchen-welcome',
          sound: '/sounds/new-dine-in.mp3'
        });
        await webpush.sendNotification(subscription, welcomePayload);
        console.log('✅ Welcome notification sent');
      } catch (err) {
        console.error('Welcome notification error:', err.message);
      }
    }
    
    res.json({ 
      success: true, 
      role: user.role,
      kitchenSubscribers: roleSubscriptions.get('kitchen')?.size || 0
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
          console.log(`❌ Kitchen user ${userId} unsubscribed`);
        }
      }
      subscriptions.delete(userId.toString());
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send notification to kitchen staff ONLY
const notifyKitchenStaff = async (title, body, sound, orderId, extraData = {}) => {
  const kitchenSubscribers = roleSubscriptions.get('kitchen');
  
  console.log(`📨 Kitchen subscribers: ${kitchenSubscribers?.size || 0}`);
  
  if (!kitchenSubscribers || kitchenSubscribers.size === 0) {
    console.log('❌ No kitchen staff subscribed');
    return { success: false, sent: 0 };
  }
  
  let soundPath = sound;
  if (sound && !sound.includes('/sounds/')) {
    soundPath = `/sounds/${sound}.mp3`;
  } else if (!sound) {
    soundPath = '/sounds/new-dine-in.mp3';
  }
  
  console.log(`📨 Sending: ${title}`);
  console.log(`🔊 Sound: ${soundPath}`);
  
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
        console.log(`✅ Sent to ${userInfo.username}`);
      } catch (error) {
        console.error(`❌ Failed to send to ${userId}:`, error.message);
        failed++;
        if (error.statusCode === 410) {
          console.log(`Removing expired subscription for ${userId}`);
          subscriptions.delete(userId);
          kitchenSubscribers.delete(userId);
        }
      }
    }
  }
  
  console.log(`📊 Result: ${sent} sent, ${failed} failed`);
  return { success: true, sent, failed };
};

// Kitchen notification for new order
export const notifyKitchenNewOrder = async (order) => {
  let soundFile = 'new-dine-in';
  let title = '';
  let body = '';
  
  const orderNumber = order.displayOrderNumber || order.orderNumber;
  
  console.log(`📦 New order: ${order.orderType}, Platform: ${order.deliveryPlatform}`);
  
  switch (order.orderType) {
    case 'dine-in':
      soundFile = 'new-dine-in';
      title = '🍽️ New Dine-In Order';
      body = `Table ${order.tableNumber} - Order #${orderNumber}`;
      break;
    case 'takeaway':
      soundFile = 'new-takeaway';
      title = '📦 New Takeaway Order';
      body = `Order #${orderNumber}`;
      break;
    case 'delivery':
      if (order.deliveryPlatform === 'zomato') {
        soundFile = 'new-zomato';
        title = '🛍️ New Zomato Order';
      } else if (order.deliveryPlatform === 'swiggy') {
        soundFile = 'new-swiggy';
        title = '🍔 New Swiggy Order';
      } else {
        soundFile = 'new-delivery';
        title = '🚚 New Home Delivery Order';
      }
      body = `Order #${orderNumber}`;
      break;
    default:
      soundFile = 'new-dine-in';
      title = '🍽️ New Order';
      body = `Order #${orderNumber}`;
  }
  
  return await notifyKitchenStaff(title, body, soundFile, order._id, {
    orderType: order.orderType,
    tableNumber: order.tableNumber,
    deliveryPlatform: order.deliveryPlatform
  });
};

// Kitchen notification for order modification
export const notifyKitchenOrderModified = async (order, isRunningOrder = false) => {
  const soundFile = 'order-modified';
  let title = '✏️ Order Modified';
  let body = `Order #${order.displayOrderNumber || order.orderNumber}`;
  
  if (order.tableNumber) {
    body = `Table ${order.tableNumber} - Order #${order.displayOrderNumber || order.orderNumber}`;
  }
  
  if (isRunningOrder) {
    title = '🔄 Running Order Modified';
    body = `Table ${order.tableNumber} - Running Order #${order.displayOrderNumber || order.orderNumber}`;
  }
  
  return await notifyKitchenStaff(title, body, soundFile, order._id, { isRunningOrder });
};

// Test endpoint
router.post('/test-kitchen', authenticate, async (req, res) => {
  try {
    const result = await notifyKitchenStaff(
      '🔔 Test Kitchen Notification',
      'This is a test notification!',
      'new-dine-in',
      null,
      { test: true }
    );
    res.json({ success: true, result });
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stats endpoint
router.get('/stats', authenticate, async (req, res) => {
  try {
    const kitchenSubscribers = roleSubscriptions.get('kitchen') || new Set();
    const subscribers = [];
    
    for (const userId of kitchenSubscribers) {
      const info = subscriptions.get(userId);
      if (info) {
        subscribers.push({
          userId,
          username: info.username,
          role: info.userRole,
          subscribedAt: info.subscribedAt
        });
      }
    }
    
    res.json({
      webPushConfigured: !!process.env.VAPID_PUBLIC_KEY,
      kitchenSubscribers: kitchenSubscribers.size,
      subscribers: subscribers,
      totalSubscriptions: subscriptions.size,
      environment: process.env.NODE_ENV
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
export { notifyKitchenNewOrder, notifyKitchenOrderModified };
