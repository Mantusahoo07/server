// server-main/routes/notifications.js
import express from 'express';
import webpush from 'web-push';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Store subscriptions with user info (in memory - use database in production)
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

// Subscribe to notifications with user role
router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const subscription = req.body;
    const userId = req.userId;
    
    // Get user details from database
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
    if (!roleSubscriptions.has(user.role)) {
      roleSubscriptions.set(user.role, new Set());
    }
    roleSubscriptions.get(user.role).add(userId.toString());
    
    console.log(`✅ User ${user.username} (${user.role}) subscribed to notifications`);
    
    // Send a welcome notification
    const welcomePayload = JSON.stringify({
      title: 'POS System',
      body: `Notifications enabled for ${user.role} role!`,
      icon: '/icon-192.png',
      tag: 'welcome',
      sound: '/sounds/new-dine-in.mp3'
    });
    
    try {
      await webpush.sendNotification(subscription, welcomePayload);
    } catch (err) {
      console.error('Error sending welcome notification:', err);
    }
    
    res.json({ success: true, message: 'Subscribed successfully', role: user.role });
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
      // Remove from role subscriptions
      const roleSet = roleSubscriptions.get(userInfo.userRole);
      if (roleSet) {
        roleSet.delete(userId.toString());
        if (roleSet.size === 0) {
          roleSubscriptions.delete(userInfo.userRole);
        }
      }
      
      subscriptions.delete(userId.toString());
      console.log(`❌ User ${userId} (${userInfo.userRole}) unsubscribed from notifications`);
    }
    
    res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send test notification
router.post('/test', authenticate, async (req, res) => {
  try {
    const { title, body, sound } = req.body;
    const userId = req.userId;
    
    const userInfo = subscriptions.get(userId.toString());
    if (!userInfo) {
      return res.status(404).json({ error: 'No subscription found for this user' });
    }
    
    const payload = JSON.stringify({
      title: title || 'Test Notification',
      body: body || 'This is a test notification from your POS System!',
      icon: '/icon-192.png',
      tag: 'test',
      sound: sound ? `/sounds/${sound}.mp3` : '/sounds/new-dine-in.mp3',
      data: { url: '/' },
      vibrate: [200]
    });
    
    await webpush.sendNotification(userInfo.subscription, payload);
    
    res.json({ success: true, message: 'Test notification sent' });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send notification to specific role (kitchen, admin, cashier, etc.)
router.post('/send-to-role', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { role, title, body, sound, url, orderId, ...extraData } = req.body;
    const roleSet = roleSubscriptions.get(role);
    
    if (!roleSet || roleSet.size === 0) {
      console.log(`No subscribers found for role: ${role}`);
      return res.json({ success: true, message: `No subscribers for role ${role}`, count: 0 });
    }
    
    const payload = JSON.stringify({
      title: title || `Notification for ${role}`,
      body: body || 'You have a new notification',
      icon: '/icon-192.png',
      badge: '/icon-96.png',
      tag: `role-${role}-${Date.now()}`,
      sound: sound ? `/sounds/${sound}.mp3` : '/sounds/new-order.mp3',
      data: { url: url || '/', orderId, role, ...extraData },
      vibrate: [200, 100, 200]
    });
    
    let successCount = 0;
    let failCount = 0;
    
    for (const userId of roleSet) {
      const userInfo = subscriptions.get(userId);
      if (userInfo && userInfo.subscription) {
        try {
          await webpush.sendNotification(userInfo.subscription, payload);
          successCount++;
        } catch (error) {
          console.error(`Failed to send to user ${userId}:`, error);
          failCount++;
          if (error.statusCode === 410) {
            subscriptions.delete(userId);
            roleSet.delete(userId);
          }
        }
      }
    }
    
    console.log(`Sent to ${role} role: ${successCount} success, ${failCount} failed`);
    res.json({ success: true, sent: successCount, failed: failCount, role });
    
  } catch (error) {
    console.error('Error sending role notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send notification to specific user
router.post('/send-to-user', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { userId, title, body, sound, url, orderId, ...extraData } = req.body;
    const userInfo = subscriptions.get(userId.toString());
    
    if (!userInfo) {
      return res.status(404).json({ error: 'User not subscribed' });
    }
    
    const payload = JSON.stringify({
      title: title || 'POS System Notification',
      body: body || 'You have a new notification',
      icon: '/icon-192.png',
      badge: '/icon-96.png',
      tag: `user-${userId}-${Date.now()}`,
      sound: sound ? `/sounds/${sound}.mp3` : '/sounds/new-order.mp3',
      data: { url: url || '/', orderId, ...extraData },
      vibrate: [200, 100, 200]
    });
    
    await webpush.sendNotification(userInfo.subscription, payload);
    res.json({ success: true, message: 'Notification sent to user' });
    
  } catch (error) {
    console.error('Error sending user notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get subscription stats (admin only)
router.get('/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    const stats = {
      totalSubscriptions: subscriptions.size,
      byRole: {}
    };
    
    for (const [role, users] of roleSubscriptions) {
      stats.byRole[role] = users.size;
    }
    
    const users = [];
    for (const [userId, info] of subscriptions) {
      users.push({
        userId,
        username: info.username,
        role: info.userRole,
        subscribedAt: info.subscribedAt
      });
    }
    
    res.json({ stats, users });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Kitchen-specific notification helper
const notifyKitchenRole = async (title, body, sound, orderId, extraData = {}) => {
  const roleSet = roleSubscriptions.get('kitchen');
  if (!roleSet || roleSet.size === 0) {
    console.log('No kitchen staff subscribed to notifications');
    return { success: false, count: 0 };
  }
  
  const payload = JSON.stringify({
    title: title,
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-96.png',
    tag: `kitchen-${Date.now()}`,
    sound: sound ? `/sounds/${sound}.mp3` : '/sounds/new-order.mp3',
    data: { url: '/kitchen', orderId, ...extraData },
    vibrate: [500, 200, 500]
  });
  
  let successCount = 0;
  for (const userId of roleSet) {
    const userInfo = subscriptions.get(userId);
    if (userInfo && userInfo.subscription) {
      try {
        await webpush.sendNotification(userInfo.subscription, payload);
        successCount++;
      } catch (error) {
        console.error(`Failed to send to kitchen user ${userId}:`, error);
        if (error.statusCode === 410) {
          subscriptions.delete(userId);
          roleSet.delete(userId);
        }
      }
    }
  }
  
  return { success: true, count: successCount };
};

// Helper functions for other routes
const sendNotificationToUser = async (userId, payload) => {
  const userInfo = subscriptions.get(userId.toString());
  if (!userInfo) return false;
  
  try {
    await webpush.sendNotification(userInfo.subscription, JSON.stringify(payload));
    return true;
  } catch (error) {
    if (error.statusCode === 410) {
      subscriptions.delete(userId.toString());
      const roleSet = roleSubscriptions.get(userInfo.userRole);
      if (roleSet) roleSet.delete(userId.toString());
    }
    return false;
  }
};

const sendNotificationToRole = async (role, payload) => {
  const roleSet = roleSubscriptions.get(role);
  if (!roleSet || roleSet.size === 0) return { success: false, count: 0 };
  
  let successCount = 0;
  for (const userId of roleSet) {
    const userInfo = subscriptions.get(userId);
    if (userInfo && userInfo.subscription) {
      try {
        await webpush.sendNotification(userInfo.subscription, JSON.stringify(payload));
        successCount++;
      } catch (error) {
        console.error(`Failed to send to user ${userId}:`, error);
        if (error.statusCode === 410) {
          subscriptions.delete(userId);
          roleSet.delete(userId);
        }
      }
    }
  }
  return { success: true, count: successCount };
};

const sendNotificationToAll = async (payload) => {
  const results = [];
  for (const [userId, userInfo] of subscriptions) {
    if (userInfo && userInfo.subscription) {
      try {
        await webpush.sendNotification(userInfo.subscription, JSON.stringify(payload));
        results.push({ userId, success: true });
      } catch (error) {
        results.push({ userId, success: false, error: error.message });
        if (error.statusCode === 410) {
          subscriptions.delete(userId);
          const roleSet = roleSubscriptions.get(userInfo.userRole);
          if (roleSet) roleSet.delete(userId);
        }
      }
    }
  }
  return results;
};

// Kitchen-specific notification helpers
const notifyKitchenNewOrder = async (order) => {
  let soundFile = 'new-dine-in';
  let title = '🍽️ New Order for Kitchen!';
  let body = `Order #${order.displayOrderNumber || order.orderNumber}`;
  
  if (order.orderType === 'dine-in') {
    soundFile = 'new-dine-in';
    title = '🍽️ New Dine-In Order for Kitchen!';
    body = `Table ${order.tableNumber} - Order #${order.displayOrderNumber || order.orderNumber}`;
  } else if (order.orderType === 'takeaway') {
    soundFile = 'new-takeaway';
    title = '📦 New Takeaway Order for Kitchen!';
    body = `Order #${order.displayOrderNumber || order.orderNumber}`;
  } else if (order.orderType === 'delivery') {
    if (order.deliveryPlatform === 'zomato') {
      soundFile = 'new-zomato';
      title = '🛍️ New Zomato Order for Kitchen!';
    } else if (order.deliveryPlatform === 'swiggy') {
      soundFile = 'new-swiggy';
      title = '🍔 New Swiggy Order for Kitchen!';
    } else {
      soundFile = 'new-delivery';
      title = '🚚 New Delivery Order for Kitchen!';
    }
    body = `Order #${order.displayOrderNumber || order.orderNumber}`;
  }
  
  return await notifyKitchenRole(title, body, soundFile, order._id, {
    orderType: order.orderType,
    tableNumber: order.tableNumber,
    deliveryPlatform: order.deliveryPlatform
  });
};

const notifyKitchenOrderModified = async (order, isRunningOrder = false) => {
  const soundFile = 'order-modified';
  let title = '✏️ Order Modified - Kitchen';
  let body = `Order #${order.displayOrderNumber || order.orderNumber}`;
  
  if (order.tableNumber) {
    body = `Table ${order.tableNumber} - Order #${order.displayOrderNumber || order.orderNumber}`;
  }
  
  if (isRunningOrder) {
    title = '🔄 Running Order Modified - Kitchen!';
    body = `Table ${order.tableNumber} - Running Order #${order.displayOrderNumber || order.orderNumber}`;
  }
  
  return await notifyKitchenRole(title, body, soundFile, order._id, { isRunningOrder });
};

const notifyKitchenInstantOrder = async (order) => {
  return await notifyKitchenRole(
    '⚡ INSTANT ORDER FOR KITCHEN!',
    `Order #${order.displayOrderNumber || order.orderNumber} needs immediate attention`,
    'instant-order',
    order._id,
    { urgent: true }
  );
};

const notifyKitchenItemReady = async (orderId, itemName, orderNumber) => {
  return await notifyKitchenRole(
    '✓ Item Ready - Kitchen',
    `${itemName} is ready for Order #${orderNumber}`,
    'order-ready',
    orderId,
    { itemName }
  );
};

// General notification helpers (send to all)
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
  sendNotificationToRole,
  sendNotificationToAll,
  notifyNewOrder,
  notifyOrderReady,
  notifyCancellationRequest,
  notifyInstantOrder,
  notifyKitchenNewOrder,
  notifyKitchenOrderModified,
  notifyKitchenInstantOrder,
  notifyKitchenItemReady,
  notifyKitchenRole
};
