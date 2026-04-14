import MenuItem from '../models/MenuItem.js';
import Category from '../models/Category.js';

export const getMenuItems = async (req, res) => {
  try {
    const { category, available } = req.query;
    const query = {};
    
    if (category) query.category = category;
    if (available !== undefined) query.available = available === 'true';
    
    const menuItems = await MenuItem.find(query).sort({ sortOrder: 1, name: 1 });
    
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
      } else {
        itemObj.categoryName = 'Uncategorized';
        itemObj.categoryIcon = '📦';
        itemObj.categoryBgColor = '#95a5a6';
      }
      return itemObj;
    });
    
    res.json(enrichedItems);
  } catch (error) {
    console.error('Error fetching menu items:', error);
    res.status(500).json({ error: error.message });
  }
};

export const createMenuItem = async (req, res) => {
  try {
    const { name, price, category, prepTime, available, description, sortOrder } = req.body;
    
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
      sortOrder: sortOrder || 0
    });
    
    await menuItem.save();
    res.status(201).json(menuItem);
  } catch (error) {
    console.error('Error creating menu item:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateMenuItem = async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id);
    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    
    const { name, price, category, prepTime, available, description, sortOrder } = req.body;
    
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
    menuItem.description = description !== undefined ? description : menuItem.description;
    menuItem.sortOrder = sortOrder !== undefined ? sortOrder : menuItem.sortOrder;
    menuItem.updatedAt = new Date();
    
    await menuItem.save();
    res.json(menuItem);
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
    console.error('Error deleting menu item:', error);
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
    console.error('Error bulk updating availability:', error);
    res.status(500).json({ error: error.message });
  }
};