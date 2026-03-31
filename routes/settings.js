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
  try {
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update settings
router.post('/', async (req, res) => {
  try {
    const updates = req.body;
    settings = { ...settings, ...updates };
    console.log('Settings updated:', settings);
    res.json(settings);
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Initialize default settings
router.post('/initialize', async (req, res) => {
  try {
    settings = {
      taxRate: 10,
      serviceCharge: 0,
      kitchenPrint: true,
      autoAcceptOrders: false,
      soundEnabled: true,
      theme: 'light'
    };
    res.json({ 
      message: 'Settings initialized', 
      settings,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error initializing settings:', error);
    res.status(500).json({ error: 'Failed to initialize settings' });
  }
});

// Get specific setting
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    if (settings.hasOwnProperty(key)) {
      res.json({ [key]: settings[key] });
    } else {
      res.status(404).json({ error: 'Setting not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

export default router;
