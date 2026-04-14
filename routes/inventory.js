import express from 'express';
const router = express.Router();

// Get out of stock items
router.get('/out-of-stock', (req, res) => {
  const outOfStock = global.menuItems.filter(item => !item.available);
  res.json(outOfStock);
});

// Update inventory
router.patch('/:id', (req, res) => {
  const { available } = req.body;
  const item = global.menuItems.find(i => i.id === req.params.id);
  
  if (item) {
    item.available = available;
    if (!available && !global.outOfStockItems.includes(item.id)) {
      global.outOfStockItems.push(item.id);
    } else if (available) {
      const index = global.outOfStockItems.indexOf(item.id);
      if (index !== -1) global.outOfStockItems.splice(index, 1);
    }
    res.json(item);
  } else {
    res.status(404).json({ error: 'Item not found' });
  }
});

export default router;