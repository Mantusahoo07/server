import express from 'express';
import Category from '../models/Category.js';
import MenuItem from '../models/MenuItem.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { name, icon, bgColor, sortOrder, showInKitchen, showInMenu } = req.body;
    const existing = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) return res.status(400).json({ error: 'Category already exists' });
    
    const category = new Category({ name, icon, bgColor, sortOrder, showInKitchen, showInMenu });
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const itemsCount = await MenuItem.countDocuments({ category: req.params.id });
    if (itemsCount > 0) {
      return res.status(400).json({ error: `Cannot delete category with ${itemsCount} items` });
    }
    await Category.findByIdAndDelete(req.params.id);
    res.json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reorder', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { categories } = req.body;
    for (const cat of categories) {
      await Category.findByIdAndUpdate(cat.id, { sortOrder: cat.sortOrder });
    }
    res.json({ message: 'Categories reordered' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;