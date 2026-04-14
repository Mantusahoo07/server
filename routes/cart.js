import express from 'express';
import Cart from '../models/Cart.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    let cart = await Cart.findOne({ userId: req.userId });
    if (!cart) {
      cart = new Cart({ userId: req.userId, items: [] });
      await cart.save();
    }
    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { items, specialInstructions, orderType, deliveryPlatform, tableNumber } = req.body;
    
    let cart = await Cart.findOne({ userId: req.userId });
    if (!cart) cart = new Cart({ userId: req.userId });
    
    cart.items = items || [];
    cart.specialInstructions = specialInstructions || {};
    cart.orderType = orderType || cart.orderType;
    cart.deliveryPlatform = deliveryPlatform;
    cart.tableNumber = tableNumber;
    cart.lastUpdated = new Date();
    
    await cart.save();
    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/items', authenticate, async (req, res) => {
  try {
    const { item } = req.body;
    let cart = await Cart.findOne({ userId: req.userId });
    if (!cart) cart = new Cart({ userId: req.userId, items: [] });
    
    const existing = cart.items.find(i => i.id === item.id);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      cart.items.push(item);
    }
    
    await cart.save();
    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/items/:itemId', authenticate, async (req, res) => {
  try {
    const { quantity } = req.body;
    const cart = await Cart.findOne({ userId: req.userId });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    
    const item = cart.items.find(i => i.id === req.params.itemId);
    if (item) {
      if (quantity <= 0) {
        cart.items = cart.items.filter(i => i.id !== req.params.itemId);
      } else {
        item.quantity = quantity;
      }
    }
    
    await cart.save();
    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/items/:itemId', authenticate, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.userId });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    
    cart.items = cart.items.filter(i => i.id !== req.params.itemId);
    await cart.save();
    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/clear', authenticate, async (req, res) => {
  try {
    await Cart.findOneAndUpdate(
      { userId: req.userId },
      { items: [], specialInstructions: {}, lastUpdated: new Date() }
    );
    res.json({ message: 'Cart cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;