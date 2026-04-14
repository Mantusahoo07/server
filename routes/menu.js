import express from 'express';
import MenuItem from '../models/MenuItem.js';
import Category from '../models/Category.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const items = await MenuItem.find({}).sort({ sortOrder: 1, name: 1 });
    const categories = await Category.find({});
    const categoryMap = new Map(categories.map(c => [c._id.toString(), c]));
    
    const enriched = items.map(item => ({
      ...item.toObject(),
      categoryName: categoryMap.get(item.category?.toString())?.name || 'Uncategorized',
      categoryIcon: categoryMap.get(item.category?.toString())?.icon || '📦',
      categoryBgColor: categoryMap.get(item.category?.toString())?.bgColor || '#95a5a6'
    }));
    
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { name, price, category, prepTime, available, description } = req.body;
    const item = new MenuItem({ name, price, category, prepTime, available, description });
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const item = await MenuItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const item = await MenuItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;