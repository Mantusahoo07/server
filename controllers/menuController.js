import MenuItem from '../models/MenuItem.js';
import Category from '../models/Category.js';

export const getMenuItems = async (req, res) => {
  try {
    const { category, available } = req.query;
    const query = {};
    
    if (category) query.category = category;
    if (available !== undefined) query.available = available === 'true';
    
    const menuItems = await MenuItem.find(query).sort({ sortOrder: 1, name: 1 });
    
    // Populate category names for response
    const categories = await Category.find({});
    const categoryMap = new Map();
    categories.forEach(cat => {
      categoryMap.set(cat._id.toString(), cat);
    });
    
    const enrichedItems = menuItems.map(item => {
      const itemObj = item.toObject();
      const category = categoryMap.get(item.category?.toString());
      if (category) {
        itemObj.categoryName = category.name;
        itemObj.categoryIcon = category.icon;
        itemObj.categoryBgColor = category.bgColor;
      }
      return itemObj;
    });
    
    res.json(enrichedItems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createMenuItem = async (req, res) => {
  try {
    const { name, price, category, prepTime, available, description, ingredients, calories } = req.body;
    
    // Verify category exists
    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({ error: 'Invalid category' });
      }
    }
    
    const menuItem = new MenuItem({
      name,
      price,
      category,
      prepTime: prepTime || 10,
      available: available !== undefined ? available : true,
      description,
      ingredients,
      calories
    });
    
    await menuItem.save();
    
    // Return with category info
    const categoryInfo = await Category.findById(category);
    const responseItem = menuItem.toObject();
    if (categoryInfo) {
      responseItem.categoryName = categoryInfo.name;
      responseItem.categoryIcon = categoryInfo.icon;
      responseItem.categoryBgColor = categoryInfo.bgColor;
    }
    
    res.status(201).json(responseItem);
  } catch (error) {
    console.error('Error creating menu item:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateMenuItem = async (req, res) => {
  try {
    const { name, price, category, prepTime, available, description, ingredients, calories } = req.body;
    
    const menuItem = await MenuItem.findById(req.params.id);
    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    
    // Verify category exists if changing
    if (category && category !== menuItem.category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({ error: 'Invalid category' });
      }
    }
    
    menuItem.name = name || menuItem.name;
    menuItem.price = price !== undefined ? price : menuItem.price;
    menuItem.category = category || menuItem.category;
    menuItem.prepTime = prepTime !== undefined ? prepTime : menuItem.prepTime;
    menuItem.available = available !== undefined ? available : menuItem.available;
    menuItem.description = description || menuItem.description;
    menuItem.ingredients = ingredients || menuItem.ingredients;
    menuItem.calories = calories || menuItem.calories;
    menuItem.updatedAt = new Date();
    
    await menuItem.save();
    
    // Return with category info
    const categoryInfo = await Category.findById(menuItem.category);
    const responseItem = menuItem.toObject();
    if (categoryInfo) {
      responseItem.categoryName = categoryInfo.name;
      responseItem.categoryIcon = categoryInfo.icon;
      responseItem.categoryBgColor = categoryInfo.bgColor;
    }
    
    res.json(responseItem);
  } catch (error) {
    console.error('Error updating menu item:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteMenuItem = async (req, res) => {
  try {
    const menuItem = await MenuItem.findByIdAndDelete(req.params.id);
    
    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    
    res.json({ message: 'Menu item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const bulkUpdateAvailability = async (req, res) => {
  try {
    const { itemIds, available } = req.body;
    
    await MenuItem.updateMany(
      { _id: { $in: itemIds } },
      { available, updatedAt: new Date() }
    );
    
    res.json({ message: 'Bulk update completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
