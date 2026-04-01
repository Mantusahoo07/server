import express from 'express';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get all categories (public)
router.get('/', async (req, res) => {
  try {
    console.log('Fetching all categories...');
    const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
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
    
    console.log('Creating category:', { name, icon, bgColor });
    
    // Check if category already exists
    const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existingCategory) {
      return res.status(400).json({ error: 'Category already exists' });
    }
    
    const category = new Category({
      name,
      description,
      icon: icon || '📦',
      bgColor: bgColor || '#95a5a6',
      sortOrder: sortOrder || 0
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

export default router;
