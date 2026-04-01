import express from 'express';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get all categories sorted by sortOrder
router.get('/', async (req, res) => {
  try {
    console.log('Fetching all categories sorted by sortOrder...');
    const categories = await Category.find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 });  // Sort by sortOrder first, then by name
    console.log(`Found ${categories.length} categories`);
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get category by ID
router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new category (admin/manager only)
router.post('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { name, description, icon, bgColor, sortOrder } = req.body;
    
    console.log('Creating category:', { name, icon, bgColor, sortOrder });
    
    // Check if category already exists
    const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existingCategory) {
      return res.status(400).json({ error: 'Category already exists' });
    }
    
    // If no sortOrder provided, get the max sortOrder and add 1
    let finalSortOrder = sortOrder;
    if (finalSortOrder === undefined || finalSortOrder === null) {
      const maxSortOrder = await Category.findOne().sort({ sortOrder: -1 }).select('sortOrder');
      finalSortOrder = maxSortOrder ? maxSortOrder.sortOrder + 1 : 0;
    }
    
    const category = new Category({
      name,
      description,
      icon: icon || '📦',
      bgColor: bgColor || '#95a5a6',
      sortOrder: finalSortOrder
    });
    
    await category.save();
    console.log('Category created:', category);
    res.status(201).json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update category
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { name, description, icon, bgColor, sortOrder, isActive } = req.body;
    
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Check if new name conflicts with another category
    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: req.params.id }
      });
      if (existingCategory) {
        return res.status(400).json({ error: 'Category name already exists' });
      }
    }
    
    category.name = name || category.name;
    category.description = description !== undefined ? description : category.description;
    category.icon = icon || category.icon;
    category.bgColor = bgColor || category.bgColor;
    category.sortOrder = sortOrder !== undefined ? sortOrder : category.sortOrder;
    category.isActive = isActive !== undefined ? isActive : category.isActive;
    category.updatedAt = new Date();
    
    await category.save();
    console.log('Category updated:', category);
    res.json(category);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete category (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Check if category has items
    const MenuItem = await import('../models/MenuItem.js').then(m => m.default);
    const itemsCount = await MenuItem.countDocuments({ category: req.params.id });
    if (itemsCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete category with ${itemsCount} items. Move or delete items first.` 
      });
    }
    
    await category.deleteOne();
    console.log('Category deleted:', category.name);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reorder categories - Bulk update sort orders
router.post('/reorder', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { categories } = req.body; // Array of { id, sortOrder }
    
    if (!categories || !Array.isArray(categories)) {
      return res.status(400).json({ error: 'Invalid categories data' });
    }
    
    const updatePromises = categories.map(cat => 
      Category.findByIdAndUpdate(cat.id, { sortOrder: cat.sortOrder, updatedAt: new Date() })
    );
    
    await Promise.all(updatePromises);
    
    const updatedCategories = await Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
    console.log('Categories reordered successfully');
    res.json({ message: 'Categories reordered successfully', categories: updatedCategories });
  } catch (error) {
    console.error('Error reordering categories:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get category order for display
router.get('/order/list', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .select('_id name icon sortOrder')
      .sort({ sortOrder: 1, name: 1 });
    res.json(categories);
  } catch (error) {
    console.error('Error fetching category order:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
