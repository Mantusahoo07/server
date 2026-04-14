import express from 'express';
import webpush from 'web-push';
import { authenticate } from '../middleware/auth.js';
import User from '../models/User.js';

const router = express.Router();

let subscriptions = new Map();
let roleSubscriptions = new Map();

router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const subscription = req.body;
    const user = await User.findById(req.userId);
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    subscriptions.set(req.userId.toString(), { subscription, userRole: user.role });
    
    if (user.role === 'kitchen') {
      if (!roleSubscriptions.has('kitchen')) roleSubscriptions.set('kitchen', new Set());
      roleSubscriptions.get('kitchen').add(req.userId.toString());
    }
    
    res.json({ success: true });
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

router.post('/test-kitchen', authenticate, async (req, res) => {
  try {
    const kitchenSubs = roleSubscriptions.get('kitchen') || new Set();
    let sent = 0;
    
    const payload = JSON.stringify({
      title: '🔔 Test Notification',
      body: 'This is a test notification from the POS system!',
      icon: '/icon-192.png',
      sound: '/sounds/new-dine-in.mp3'
    });
    
    for (const userId of kitchenSubs) {
      const sub = subscriptions.get(userId);
      if (sub) {
        await webpush.sendNotification(sub.subscription, payload);
        sent++;
      }
    }
    
    res.json({ success: true, sent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', authenticate, async (req, res) => {
  try {
    res.json({
      kitchenSubscribers: (roleSubscriptions.get('kitchen') || new Set()).size,
      totalSubscriptions: subscriptions.size
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;