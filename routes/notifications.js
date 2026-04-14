// server-main/routes/notifications.js

import express from 'express';
import webpush from 'web-push';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Store subscriptions with user info
let subscriptions = new Map(); // userId -> { subscription, userRole, username }
let roleSubscriptions = new Map(); // role -> Set of userIds

// Get VAPID public key (for frontend)
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

// Subscribe to notifications (any authenticated user)
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
    
    // Add to role-based subscriptions (only for kitchen role)
    if (user.role === 'kitchen') {
      if (!roleSubscriptions.has('kitchen')) {
        roleSubscriptions.set('kitchen', new Set());
      }
      roleSubscriptions.get('kitchen').add(userId.toString());
      console.log(`✅ Kitchen user ${user.username} subscribed to notifications`);
      console.log(`📊 Total kitchen subscribers: ${roleSubscriptions.get('kitchen').size}`);
      
      // Send a welcome notification to kitchen users only
      const welcomePayload = JSON.stringify({
        title: '🔔 Kitchen Notifications Active',
        body: 'You will now receive real-time order updates!',
        icon: '/icon-192.png',
        tag: 'kitchen-welcome',
        sound: '/sounds/new-dine-in.mp3'
      });
      
      try {
        await webpush.sendNotification(subscription, welcomePayload);
        console.log('✅ Welcome notification sent to kitchen user');
      } catch (err) {
        console.error('Error sending welcome notification:', err.message);
      }
    } else {
      console.log(`User ${user.username} (${user.role}) - Not a kitchen user, no notifications will be sent`);
    }
    
    res.json({ 
      success: true, 
      message: 'Subscribed successfully', 
      role: user.role,
      kitchenSubscribers: roleSubscriptions.get('kitchen')?.size || 0
    });
  } catch (error) {
    console.error('Error subscribing to notifications:', error);
    res.status(500).json({ error: error.message });
  }
});

// Unsubscribe from notifications
router.post('/unsubscribe', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const userInfo = subscriptions.get(userId.toString());
    
    if (userInfo) {
      // Remove from kitchen role subscriptions if they were a kitchen user
      if (userInfo.userRole === 'kitchen') {
        const kitchenSet = roleSubscriptions.get('kitchen');
        if (kitchenSet) {
          kitchenSet.delete(userId.toString());
          if (kitchenSet.size === 0) {
            roleSubscriptions.delete('kitchen');
          }
        }
      }
      
      subscriptions.delete(userId.toString());
      console.log(`❌ User ${userId} unsubscribed from notifications`);
    }
    
    res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send notification to kitchen staff ONLY
const notifyKitchenStaff = async (title, body, sound, orderId, extraData = {}) => {
  const kitchenSubscribers = roleSubscriptions.get('kitchen');
  
  console.log(`📨 Kitchen subscribers count: ${kitchenSubscribers?.size || 0}`);
  
  if (!kitchenSubscribers || kitchenSubscribers.size === 0) {
    console.log('No kitchen staff subscribed to notifications');
    return { success: false, count: 0 };
  }
  
  // Ensure sound path is correct
  let soundPath = sound;
  if (sound && !sound.includes('/sounds/')) {
    soundPath = `/sounds/${sound}.mp3`;
  } else if (!sound) {
    soundPath = '/sounds/new-dine-in.mp3';
  }
  
  console.log(`📨 Sending to kitchen: ${title}`);
  console.log(`📨 Sound path: ${soundPath}`);
  
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
    requireInteraction: true,
    renotify: true
  });
  
  let successCount = 0;
  let failCount = 0;
  
  for (const userId of kitchenSubscribers) {
    const userInfo = subscriptions.get(userId);
    if (userInfo && userInfo.subscription) {
      try {
        await webpush.sendNotification(userInfo.subscription, payload);
        successCount++;
        console.log(`✅ Kitchen notification sent to ${userInfo.username}`);
      } catch (error) {
        console.error(`Failed to send to kitchen user ${userId}:`, error.message);
        failCount++;
        if (error.statusCode === 410) {
          // Subscription expired, remove it
          console.log(`Removing expired subscription for ${userId}`);
          subscriptions.delete(userId);
          kitchenSubscribers.delete(userId);
        }
      }
    }
  }
  
  console.log(`📊 Kitchen notifications: ${successCount} sent, ${failCount} failed`);
  return { success: true, sent: successCount, failed: failCount };
};

// Kitchen notification for new order
const notifyKitchenNewOrder = async (order) => {
  let soundFile = 'new-dine-in';
  let title = '';
  let body = '';
  
  const orderNumber = order.displayOrderNumber || order.orderNumber;
  
  console.log(`📦 New order notification for kitchen: Type=${order.orderType}, Platform=${order.deliveryPlatform}`);
  
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
        body = `Order #${orderNumber}`;
      } else if (order.deliveryPlatform === 'swiggy') {
        soundFile = 'new-swiggy';
        title = '🍔 New Swiggy Order';
        body = `Order #${orderNumber}`;
      } else {
        soundFile = 'new-delivery';
        title = '🚚 New Home Delivery Order';
        body = `Order #${orderNumber}`;
      }
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
const notifyKitchenOrderModified = async (order, isRunningOrder = false) => {
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

// Kitchen notification for instant order
const notifyKitchenInstantOrder = async (order) => {
  const soundFile = 'instant-order';
  const title = '⚡ INSTANT ORDER REQUIRED!';
  const body = `Order #${order.displayOrderNumber || order.orderNumber} needs immediate attention`;
  
  return await notifyKitchenStaff(title, body, soundFile, order._id, { urgent: true });
};

// Kitchen notification for order ready (for billing)
const notifyOrderReady = async (order) => {
  const soundFile = 'order-ready';
  const title = '💰 Order Ready for Billing';
  const body = `Order #${order.displayOrderNumber || order.orderNumber} is ready for payment`;
  
  return await notifyKitchenStaff(title, body, soundFile, order._id);
};

// Kitchen notification for cancellation request
const notifyCancellationRequest = async (order, item) => {
  const soundFile = 'cancellation-request';
  const title = '❌ Cancellation Requested';
  const body = `${item.name} from Order #${order.displayOrderNumber || order.orderNumber} needs approval`;
  
  return await notifyKitchenStaff(title, body, soundFile, order._id, { itemName: item.name });
};

// Get kitchen subscription stats (for debugging)
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
      kitchenSubscribersCount: kitchenSubscribers.size,
      subscribers: subscribers
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to send a test notification to kitchen (for debugging)
router.post('/test-kitchen', authenticate, async (req, res) => {
  try {
    const result = await notifyKitchenStaff(
      'Test Kitchen Notification',
      'This is a test notification for kitchen staff',
      'new-dine-in',
      null,
      { test: true }
    );
    
    res.json({ 
      success: true, 
      message: `Test notification sent to ${result.sent} kitchen staff`,
      result 
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export all notification functions
export { 
  notifyKitchenNewOrder, 
  notifyKitchenOrderModified,
  notifyKitchenInstantOrder,
  notifyOrderReady,
  notifyCancellationRequest
};

export default router;
