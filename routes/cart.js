import express from 'express';
import Cart from '../models/Cart.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get user's cart (authenticated)
router.get('/', authenticate, async (req, res) => {
  try {
    console.log('Fetching cart for user:', req.userId);
    
    let cart = await Cart.findOne({ userId: req.userId });
    
    if (!cart) {
      // Create empty cart for user
      cart = new Cart({ 
        userId: req.userId,
        items: [],
        specialInstructions: {}
      });
      await cart.save();
      console.log('Created new empty cart for user:', req.userId);
    }
    
    res.json(cart);
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save entire cart
router.post('/', authenticate, async (req, res) => {
  try {
    const { items, specialInstructions, orderType, deliveryPlatform, deliveryAddress, customerName, customerPhone, tableNumber } = req.body;
    
    console.log('Saving cart for user:', req.userId);
    
    let cart = await Cart.findOne({ userId: req.userId });
    
    if (!cart) {
      cart = new Cart({ userId: req.userId });
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
    console.log('Cart saved successfully for user:', req.userId);
    res.json(cart);
  } catch (error) {
    console.error('Error saving cart:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add item to cart
router.post('/items', authenticate, async (req, res) => {
  try {
    const { item } = req.body;
    
    if (!item || !item.id) {
      return res.status(400).json({ error: 'Item ID is required' });
    }
    
    console.log('Adding item to cart for user:', req.userId, item);
    
    let cart = await Cart.findOne({ userId: req.userId });
    
    if (!cart) {
      cart = new Cart({ userId: req.userId, items: [] });
    }
    
    const existingItem = cart.items.find(i => i.id === item.id);
    if (existingItem) {
      existingItem.quantity += (item.quantity || 1);
    } else {
      cart.items.push({
        id: item.id,
        name: item.name,
        fullName: item.fullName || item.name,
        price: item.price,
        quantity: item.quantity || 1,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        categorySortOrder: item.categorySortOrder || 0,
        prepTime: item.prepTime || 10
      });
    }
    
    cart.lastUpdated = new Date();
    await cart.save();
    
    console.log('Item added successfully');
    res.json(cart);
  } catch (error) {
    console.error('Error adding item to cart:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update item quantity
router.patch('/items/:itemId', authenticate, async (req, res) => {
  try {
    const { quantity } = req.body;
    console.log('Updating item quantity for user:', req.userId, 'item:', req.params.itemId, 'quantity:', quantity);
    
    const cart = await Cart.findOne({ userId: req.userId });
    
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
router.delete('/items/:itemId', authenticate, async (req, res) => {
  try {
    console.log('Removing item from cart for user:', req.userId, 'item:', req.params.itemId);
    
    const cart = await Cart.findOne({ userId: req.userId });
    
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
router.delete('/clear', authenticate, async (req, res) => {
  try {
    console.log('Clearing cart for user:', req.userId);
    
    const cart = await Cart.findOne({ userId: req.userId });
    
    if (cart) {
      cart.items = [];
      cart.specialInstructions = {};
      cart.orderType = 'dine-in';
      cart.deliveryPlatform = null;
      cart.deliveryAddress = '';
      cart.customerName = '';
      cart.customerPhone = '';
      cart.tableNumber = null;
      cart.lastUpdated = new Date();
      await cart.save();
    }
    
    res.json({ message: 'Cart cleared successfully' });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
