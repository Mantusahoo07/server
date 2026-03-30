import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

// Category Schema
const categorySchema = new mongoose.Schema({
  name: String,
  description: String,
  icon: String,
  bgColor: String,
  createdAt: Date,
  updatedAt: Date
});

const Category = mongoose.model('Category', categorySchema, 'categories');

// Get all categories
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({});
    res.json(categories);
  } catch (error) {
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
    res.status(500).json({ error: error.message });
  }
});

export default router;
