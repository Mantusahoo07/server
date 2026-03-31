import express from 'express';
import Cart from '../models/Cart.js';

const router = express.Router();

// Get or create cart for session
router.get('/:sessionId', async (req, res) => {
  try {
    let cart = await Cart.findOne({ sessionId: req.params.sessionId });
    
    if (!cart) {
      cart = new Cart({ sessionId: req.params.sessionId });
      await cart.save();
    }
    
    res.json(cart);
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save cart
router.post('/:sessionId', async (req, res) => {
  try {
    const { items, specialInstructions, orderType, deliveryPlatform, deliveryAddress, customerName, customerPhone, tableNumber } = req.body;
    
    let cart = await Cart.findOne({ sessionId: req.params.sessionId });
    
    if (!cart) {
      cart = new Cart({ sessionId: req.params.sessionId });
    }
    
    cart.items = items || [];
    cart.specialInstructions = specialInstructions || {};
    cart.orderType = orderType || cart.orderType;
    cart.deliveryPlatform = deliveryPlatform || cart.deliveryPlatform;
    cart.deliveryAddress = deliveryAddress || cart.deliveryAddress;
    cart.customerName = customerName || cart.customerName;
    cart.customerPhone = customerPhone || cart.customerPhone;
    cart.tableNumber = tableNumber || cart.tableNumber;
    cart.lastUpdated = new Date();
    
    await cart.save();
    res.json(cart);
  } catch (error) {
    console.error('Error saving cart:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add item to cart
router.post('/:sessionId/items', async (req, res) => {
  try {
    const { item } = req.body;
    let cart = await Cart.findOne({ sessionId: req.params.sessionId });
    
    if (!cart) {
      cart = new Cart({ sessionId: req.params.sessionId });
    }
    
    const existingItem = cart.items.find(i => i.id === item.id);
    if (existingItem) {
      existingItem.quantity += item.quantity;
    } else {
      cart.items.push(item);
    }
    
    cart.lastUpdated = new Date();
    await cart.save();
    
    res.json(cart);
  } catch (error) {
    console.error('Error adding item to cart:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update item quantity
router.patch('/:sessionId/items/:itemId', async (req, res) => {
  try {
    const { quantity } = req.body;
    let cart = await Cart.findOne({ sessionId: req.params.sessionId });
    
    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }
    
    const item = cart.items.find(i => i.id === req.params.itemId);
    if (item) {
      if (quantity <= 0) {
        cart.items = cart.items.filter(i => i.id !== req.params.itemId);
      } else {
        item.quantity = quantity;
      }
    }
    
    cart.lastUpdated = new Date();
    await cart.save();
    
    res.json(cart);
  } catch (error) {
    console.error('Error updating item quantity:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove item from cart
router.delete('/:sessionId/items/:itemId', async (req, res) => {
  try {
    let cart = await Cart.findOne({ sessionId: req.params.sessionId });
    
    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }
    
    cart.items = cart.items.filter(i => i.id !== req.params.itemId);
    cart.lastUpdated = new Date();
    await cart.save();
    
    res.json(cart);
  } catch (error) {
    console.error('Error removing item from cart:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear cart
router.delete('/:sessionId', async (req, res) => {
  try {
    await Cart.findOneAndDelete({ sessionId: req.params.sessionId });
    res.json({ message: 'Cart cleared' });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
