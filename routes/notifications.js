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
      console.log(`✅ Kitchen user ${user.username} subscribed to notifications`);
      console.log(`📊 Total kitchen subscribers: ${roleSubscriptions.get('kitchen').size}`);
    }
    
    // Add admin subscriptions
    if (user.role === 'admin') {
      if (!roleSubscriptions.has('admin')) {
        roleSubscriptions.set('admin', new Set());
      }
      roleSubscriptions.get('admin').add(userId.toString());
      console.log(`✅ Admin user ${user.username} subscribed to notifications`);
      console.log(`📊 Total admin subscribers: ${roleSubscriptions.get('admin').size}`);
      
      // Send welcome notification to admin
      const welcomePayload = JSON.stringify({
        title: '🔔 Admin Notifications Active',
        body: 'You will receive order ready and item ready alerts!',
        icon: '/icon-192.png',
        tag: 'admin-welcome',
        sound: '/sounds/new-dine-in.mp3'
      });
      
      try {
        await webpush.sendNotification(subscription, welcomePayload);
        console.log('✅ Welcome notification sent to admin user');
      } catch (err) {
        console.error('Error sending welcome notification:', err.message);
      }
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

// Send notification to kitchen staff
const notifyKitchenStaff = async (title, body, sound, orderId, extraData = {}) => {
  const kitchenSubscribers = roleSubscriptions.get('kitchen');
  
  console.log(`📨 Kitchen subscribers count: ${kitchenSubscribers?.size || 0}`);
  console.log(`📨 Title: ${title}`);
  console.log(`📨 Body: ${body}`);
  
  if (!kitchenSubscribers || kitchenSubscribers.size === 0) {
    console.log('❌ No kitchen staff subscribed to notifications');
    return { success: false, sent: 0 };
  }
  
  let soundPath = sound;
  if (sound && !sound.includes('/sounds/')) {
    soundPath = `/sounds/${sound}.mp3`;
  } else if (!sound) {
    soundPath = '/sounds/new-dine-in.mp3';
  }
  
  const payload = JSON.stringify({
    title: title,
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-96.png',
    tag: `kitchen-${orderId || Date.now()}`,
    sound: soundPath,
    data: { 
      url: '/kitchen', 
      orderId, 
      ...extraData 
    },
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
        console.log(`✅ Notification sent to kitchen ${userInfo.username} (${userId})`);
      } catch (error) {
        console.error(`❌ Failed to send to kitchen ${userId}:`, error.message);
        failed++;
        if (error.statusCode === 410) {
          console.log(`Removing expired subscription for ${userId}`);
          subscriptions.delete(userId);
          kitchenSubscribers.delete(userId);
        }
      }
    }
  }
  
  console.log(`📊 Kitchen notification result: ${sent} sent, ${failed} failed`);
  return { success: true, sent, failed };
};

// Send notification to admins
const notifyAdmins = async (title, body, sound, orderId, extraData = {}) => {
  const adminSubscribers = roleSubscriptions.get('admin');
  
  console.log(`📨 Admin subscribers count: ${adminSubscribers?.size || 0}`);
  console.log(`📨 Title: ${title}`);
  console.log(`📨 Body: ${body}`);
  
  if (!adminSubscribers || adminSubscribers.size === 0) {
    console.log('❌ No admin subscribed to notifications');
    return { success: false, sent: 0 };
  }
  
  let soundPath = sound;
  if (sound && !sound.includes('/sounds/')) {
    soundPath = `/sounds/${sound}.mp3`;
  } else if (!sound) {
    soundPath = '/sounds/new-dine-in.mp3';
  }
  
  const payload = JSON.stringify({
    title: title,
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-96.png',
    tag: `admin-${orderId || Date.now()}`,
    sound: soundPath,
    data: { 
      url: '/orders', 
      orderId, 
      ...extraData 
    },
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
        console.log(`✅ Notification sent to admin ${userInfo.username} (${userId})`);
      } catch (error) {
        console.error(`❌ Failed to send to admin ${userId}:`, error.message);
        failed++;
        if (error.statusCode === 410) {
          console.log(`Removing expired subscription for ${userId}`);
          subscriptions.delete(userId);
          adminSubscribers.delete(userId);
        }
      }
    }
  }
  
  console.log(`📊 Admin notification result: ${sent} sent, ${failed} failed`);
  return { success: true, sent, failed };
};

// Kitchen notification for new order
export const notifyKitchenNewOrder = async (order) => {
  console.log('🔔 notifyKitchenNewOrder called with order:', order.orderType, order.orderNumber);
  
  let soundFile = 'new-dine-in';
  let title = '';
  let body = '';
  
  const orderNumber = order.displayOrderNumber || order.orderNumber;
  
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
  
  console.log(`📤 Sending notification to kitchen: ${title}`);
  const result = await notifyKitchenStaff(title, body, soundFile, order._id, {
    orderType: order.orderType,
    tableNumber: order.tableNumber,
    deliveryPlatform: order.deliveryPlatform
  });
  
  return result;
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
  }
  
  return await notifyKitchenStaff(title, body, soundFile, order._id, { isRunningOrder });
};

// Kitchen notification for instant order
export const notifyKitchenInstantOrder = async (order) => {
  const soundFile = 'instant-order';
  const title = '⚡ INSTANT ORDER REQUIRED!';
  const body = `Order #${order.displayOrderNumber || order.orderNumber} needs immediate attention`;
  
  return await notifyKitchenStaff(title, body, soundFile, order._id, { urgent: true });
};

// Kitchen notification for cancellation request
export const notifyCancellationRequest = async (order, item) => {
  const soundFile = 'cancellation-request';
  const title = '❌ Cancellation Requested';
  const body = `${item.name} from Order #${order.displayOrderNumber || order.orderNumber} needs approval`;
  
  return await notifyKitchenStaff(title, body, soundFile, order._id, { itemName: item.name });
};

// Admin notification for order ready for billing
export const notifyAdminOrderReady = async (order) => {
  const soundFile = 'order-ready';
  const title = '💰 Order Ready for Billing';
  const body = `Order #${order.displayOrderNumber || order.orderNumber} is ready for payment`;
  
  console.log(`📤 Sending order ready notification to admin for order: ${order.displayOrderNumber || order.orderNumber}`);
  return await notifyAdmins(title, body, soundFile, order._id);
};

// Admin notification for item marked ready
export const notifyAdminItemReady = async (order, itemName, itemQuantity) => {
  const soundFile = 'order-ready';
  const title = '✅ Item Ready';
  const body = `${itemQuantity}× ${itemName} is ready for Order #${order.displayOrderNumber || order.orderNumber}`;
  
  console.log(`📤 Sending item ready notification to admin: ${itemQuantity}× ${itemName}`);
  return await notifyAdmins(title, body, soundFile, order._id, { itemName, itemQuantity });
};

// Test endpoint
router.post('/test-kitchen', authenticate, async (req, res) => {
  try {
    console.log('🔔 Test kitchen notification requested');
    const result = await notifyKitchenStaff(
      '🔔 Test Kitchen Notification',
      'This is a test notification for kitchen staff!',
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

// Test admin notification endpoint
router.post('/test-admin', authenticate, async (req, res) => {
  try {
    console.log('🔔 Test admin notification requested');
    const result = await notifyAdmins(
      '🔔 Test Admin Notification',
      'This is a test notification for admin!',
      'order-ready',
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
    const adminSubscribers = roleSubscriptions.get('admin') || new Set();
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
    
    for (const userId of adminSubscribers) {
      const info = subscriptions.get(userId);
      if (info && !subscribers.find(s => s.userId === userId)) {
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
      kitchenSubscribersCount: kitchenSubscribers.size,
      adminSubscribersCount: adminSubscribers.size,
      subscribers: subscribers,
      totalSubscriptions: subscriptions.size,
      allRoles: Array.from(roleSubscriptions.keys()).map(r => ({ role: r, count: roleSubscriptions.get(r).size }))
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
