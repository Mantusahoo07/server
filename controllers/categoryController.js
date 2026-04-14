import Category from '../models/Category.js';
import MenuItem from '../models/MenuItem.js';

export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createCategory = async (req, res) => {
  try {
    const { name, icon, bgColor, sortOrder, showInKitchen, showInMenu } = req.body;
    
    const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existingCategory) {
      return res.status(400).json({ error: 'Category already exists' });
    }
    
    const category = new Category({
      name,
      icon: icon || '📦',
      bgColor: bgColor || '#95a5a6',
      sortOrder: sortOrder || 0,
      showInKitchen: showInKitchen !== undefined ? showInKitchen : true,
      showInMenu: showInMenu !== undefined ? showInMenu : true
    });
    
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    const { name, icon, bgColor, sortOrder, isActive, showInKitchen, showInMenu } = req.body;
    
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
    category.icon = icon || category.icon;
    category.bgColor = bgColor || category.bgColor;
    category.sortOrder = sortOrder !== undefined ? sortOrder : category.sortOrder;
    category.isActive = isActive !== undefined ? isActive : category.isActive;
    category.showInKitchen = showInKitchen !== undefined ? showInKitchen : category.showInKitchen;
    category.showInMenu = showInMenu !== undefined ? showInMenu : category.showInMenu;
    category.updatedAt = new Date();
    
    await category.save();
    res.json(category);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    const itemsCount = await MenuItem.countDocuments({ category: req.params.id });
    if (itemsCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete category with ${itemsCount} items. Move or delete items first.` 
      });
    }
    
    await category.deleteOne();
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: error.message });
  }
};

export const reorderCategories = async (req, res) => {
  try {
    const { categories } = req.body;
    
    for (const cat of categories) {
      await Category.findByIdAndUpdate(cat.id, { sortOrder: cat.sortOrder });
    }
    
    res.json({ message: 'Categories reordered successfully' });
  } catch (error) {
    console.error('Error reordering categories:', error);
    res.status(500).json({ error: error.message });
  }
};