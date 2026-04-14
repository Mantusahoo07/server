// server-main/controllers/notificationController.js
import webpush from 'web-push';

// Store subscriptions - only for kitchen users
let kitchenSubscriptions = new Map(); // userId -> subscription

// Initialize VAPID keys
const initializeVAPID = () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  
  if (publicKey && privateKey) {
    webpush.setVapidDetails(
      'mailto:kitchen@pos-system.com',
      publicKey,
      privateKey
    );
    console.log('✅ Web Push initialized for kitchen notifications');
    return true;
  }
  console.log('❌ VAPID keys missing - kitchen notifications disabled');
  return false;
};

// Get VAPID public key for frontend
export const getVapidPublicKey = (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(500).json({ error: 'VAPID public key not configured' });
  }
  res.json({ publicKey });
};

// Subscribe kitchen user to push notifications
export const subscribeKitchenUser = async (req, res) => {
  try {
    const subscription = req.body;
    const userId = req.userId;
    
    // Get user role
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Only allow kitchen users to subscribe
    if (user.role !== 'kitchen' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Only kitchen staff can receive notifications' });
    }
    
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    
    kitchenSubscriptions.set(userId.toString(), {
      subscription,
      userId: userId.toString(),
      username: user.username,
      role: user.role,
      subscribedAt: new Date()
    });
    
    console.log(`✅ Kitchen user ${user.username} subscribed to notifications`);
    console.log(`📊 Total kitchen subscribers: ${kitchenSubscriptions.size}`);
    
    res.json({ 
      success: true, 
      message: 'Subscribed to kitchen notifications',
      subscriberCount: kitchenSubscriptions.size
    });
  } catch (error) {
    console.error('Error subscribing kitchen user:', error);
    res.status(500).json({ error: error.message });
  }
};

// Unsubscribe kitchen user
export const unsubscribeKitchenUser = async (req, res) => {
  try {
    const userId = req.userId;
    
    if (kitchenSubscriptions.has(userId.toString())) {
      kitchenSubscriptions.delete(userId.toString());
      console.log(`❌ Kitchen user ${userId} unsubscribed`);
    }
    
    res.json({ success: true, message: 'Unsubscribed from notifications' });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get kitchen subscription status
export const getKitchenSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.userId;
    const isSubscribed = kitchenSubscriptions.has(userId.toString());
    const subscription = kitchenSubscriptions.get(userId.toString());
    
    res.json({ 
      isSubscribed,
      subscriberCount: kitchenSubscriptions.size,
      subscriptionDetails: subscription ? {
        subscribedAt: subscription.subscribedAt,
        username: subscription.username
      } : null
    });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({ error: error.message });
  }
};

// Send notification to all kitchen staff
export const sendKitchenNotification = async (title, body, sound, orderData = {}) => {
  console.log(`🔔 Sending kitchen notification: ${title}`);
  console.log(`📊 Kitchen subscribers: ${kitchenSubscriptions.size}`);
  
  if (kitchenSubscriptions.size === 0) {
    console.log('⚠️ No kitchen staff subscribed to notifications');
    return { success: false, sent: 0, message: 'No kitchen subscribers' };
  }
  
  // Map sound names to file paths
  const soundMap = {
    'new-dine-in': '/sounds/new-dine-in.mp3',
    'new-takeaway': '/sounds/new-takeaway.mp3',
    'new-delivery': '/sounds/new-delivery.mp3',
    'new-zomato': '/sounds/new-zomato.mp3',
    'new-swiggy': '/sounds/new-swiggy.mp3',
    'order-modified': '/sounds/order-modified.mp3',
    'order-cancelled': '/sounds/order-cancelled.mp3',
    'order-ready': '/sounds/order-ready.mp3',
    'cancellation-request': '/sounds/cancellation-request.mp3',
    'instant-order': '/sounds/instant-order.mp3'
  };
  
  const soundPath = soundMap[sound] || '/sounds/new-dine-in.mp3';
  
  const payload = JSON.stringify({
    title: title,
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-96.png',
    tag: `kitchen-${Date.now()}`,
    sound: soundPath,
    vibrate: [500, 300, 500],
    requireInteraction: true,
    data: {
      url: '/kitchen',
      orderId: orderData.orderId,
      orderNumber: orderData.orderNumber,
      orderType: orderData.orderType,
      tableNumber: orderData.tableNumber,
      timestamp: new Date().toISOString()
    }
  });
  
  let sent = 0;
  let failed = 0;
  
  for (const [userId, userData] of kitchenSubscriptions) {
    try {
      await webpush.sendNotification(userData.subscription, payload);
      sent++;
      console.log(`✅ Notification sent to ${userData.username} (${userId})`);
    } catch (error) {
      console.error(`❌ Failed to send to ${userId}:`, error.message);
      failed++;
      
      // Remove invalid subscription
      if (error.statusCode === 410 || error.statusCode === 404) {
        console.log(`Removing expired subscription for ${userId}`);
        kitchenSubscriptions.delete(userId);
      }
    }
  }
  
  console.log(`📊 Notification result: ${sent} sent, ${failed} failed`);
  return { success: true, sent, failed, total: kitchenSubscriptions.size };
};

// Helper function to send order notifications
export const notifyKitchenNewOrder = async (order) => {
  let title = '';
  let body = '';
  let sound = '';
  
  const orderNumber = order.displayOrderNumber || order.orderNumber;
  
  switch (order.orderType) {
    case 'dine-in':
      sound = 'new-dine-in';
      title = '🍽️ NEW DINE-IN ORDER';
      body = `Table ${order.tableNumber} - Order #${orderNumber}`;
      break;
    case 'takeaway':
      sound = 'new-takeaway';
      title = '📦 NEW TAKEAWAY ORDER';
      body = `Order #${orderNumber}`;
      break;
    case 'delivery':
      if (order.deliveryPlatform === 'zomato') {
        sound = 'new-zomato';
        title = '🛍️ NEW ZOMATO ORDER';
      } else if (order.deliveryPlatform === 'swiggy') {
        sound = 'new-swiggy';
        title = '🍔 NEW SWIGGY ORDER';
      } else {
        sound = 'new-delivery';
        title = '🚚 NEW DELIVERY ORDER';
      }
      body = `Order #${orderNumber}`;
      break;
    default:
      sound = 'new-dine-in';
      title = '🍽️ NEW ORDER';
      body = `Order #${orderNumber}`;
  }
  
  return await sendKitchenNotification(title, body, sound, {
    orderId: order._id,
    orderNumber: orderNumber,
    orderType: order.orderType,
    tableNumber: order.tableNumber
  });
};

export const notifyKitchenOrderModified = async (order) => {
  const orderNumber = order.displayOrderNumber || order.orderNumber;
  const title = '✏️ ORDER MODIFIED';
  const body = order.tableNumber 
    ? `Table ${order.tableNumber} - Order #${orderNumber} has been modified`
    : `Order #${orderNumber} has been modified`;
  
  return await sendKitchenNotification(title, body, 'order-modified', {
    orderId: order._id,
    orderNumber: orderNumber,
    orderType: order.orderType,
    tableNumber: order.tableNumber
  });
};

export const notifyKitchenOrderReady = async (order) => {
  const orderNumber = order.displayOrderNumber || order.orderNumber;
  const title = '✅ ORDER READY FOR BILLING';
  const body = order.tableNumber 
    ? `Table ${order.tableNumber} - Order #${orderNumber} is ready`
    : `Order #${orderNumber} is ready for billing`;
  
  return await sendKitchenNotification(title, body, 'order-ready', {
    orderId: order._id,
    orderNumber: orderNumber,
    orderType: order.orderType,
    tableNumber: order.tableNumber
  });
};

export const notifyKitchenInstantOrder = async (order) => {
  const orderNumber = order.displayOrderNumber || order.orderNumber;
  const title = '⚡ INSTANT ORDER REQUIRED!';
  const body = `Order #${orderNumber} needs immediate attention - Priority!`;
  
  return await sendKitchenNotification(title, body, 'instant-order', {
    orderId: order._id,
    orderNumber: orderNumber,
    orderType: order.orderType,
    tableNumber: order.tableNumber,
    urgent: true
  });
};

export const notifyKitchenCancellationRequest = async (order, item) => {
  const orderNumber = order.displayOrderNumber || order.orderNumber;
  const title = '❌ CANCELLATION REQUESTED';
  const body = `${item.name} from Order #${orderNumber} needs approval`;
  
  return await sendKitchenNotification(title, body, 'cancellation-request', {
    orderId: order._id,
    orderNumber: orderNumber,
    itemName: item.name,
    itemId: item.id
  });
};

// Get all kitchen subscribers (admin only)
export const getKitchenSubscribers = async (req, res) => {
  try {
    const subscribers = [];
    for (const [userId, data] of kitchenSubscriptions) {
      subscribers.push({
        userId: data.userId,
        username: data.username,
        role: data.role,
        subscribedAt: data.subscribedAt
      });
    }
    
    res.json({
      count: subscribers.length,
      subscribers,
      vapidConfigured: !!process.env.VAPID_PUBLIC_KEY
    });
  } catch (error) {
    console.error('Error getting subscribers:', error);
    res.status(500).json({ error: error.message });
  }
};

// Test notification (for debugging)
export const sendTestNotification = async (req, res) => {
  try {
    const result = await sendKitchenNotification(
      '🔔 TEST KITCHEN NOTIFICATION',
      'This is a test notification for kitchen staff!',
      'new-dine-in',
      { test: true }
    );
    res.json(result);
  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Initialize VAPID on server start
initializeVAPID();
