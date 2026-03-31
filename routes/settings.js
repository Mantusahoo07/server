import express from 'express';

const router = express.Router();

// In-memory storage for settings
let settings = {
  taxRate: 10,
  serviceCharge: 0,
  kitchenPrint: true,
  autoAcceptOrders: false,
  soundEnabled: true,
  theme: 'light'
};

// Get all settings
router.get('/', async (req, res) => {
  res.json(settings);
});

// Update settings
router.post('/', async (req, res) => {
  settings = { ...settings, ...req.body };
  res.json(settings);
});

// Initialize default settings
router.post('/initialize', async (req, res) => {
  settings = {
    taxRate: 10,
    serviceCharge: 0,
    kitchenPrint: true,
    autoAcceptOrders: false,
    soundEnabled: true,
    theme: 'light'
  };
  res.json({ message: 'Settings initialized', settings });
});

export default router;
