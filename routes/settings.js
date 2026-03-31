import express from 'express';
import Setting from '../models/Setting.js';

const router = express.Router();

// Get all settings (from database)
router.get('/', async (req, res) => {
  try {
    // Check if settings exist in database
    let settings = await Setting.findOne({ key: 'general' });
    
    if (!settings) {
      // Create default settings if not exists
      settings = new Setting({
        key: 'general',
        value: {
          taxRate: 10,
          serviceCharge: 0,
          kitchenPrint: true,
          autoAcceptOrders: false,
          soundEnabled: true,
          theme: 'light'
        }
      });
      await settings.save();
    }
    
    res.json(settings.value);
  } catch (error) {
    console.error('Error fetching settings:', error);
    // Return default settings on error
    res.json({
      taxRate: 10,
      serviceCharge: 0,
      kitchenPrint: true,
      autoAcceptOrders: false,
      soundEnabled: true,
      theme: 'light'
    });
  }
});

// Update settings
router.post('/', async (req, res) => {
  try {
    const updates = req.body;
    
    // Find and update or create
    let settings = await Setting.findOne({ key: 'general' });
    
    if (settings) {
      settings.value = { ...settings.value, ...updates };
      settings.updatedAt = new Date();
      await settings.save();
    } else {
      settings = new Setting({
        key: 'general',
        value: updates
      });
      await settings.save();
    }
    
    console.log('Settings saved to database:', settings.value);
    res.json(settings.value);
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize or reset settings
router.post('/initialize', async (req, res) => {
  try {
    const defaultSettings = {
      taxRate: 10,
      serviceCharge: 0,
      kitchenPrint: true,
      autoAcceptOrders: false,
      soundEnabled: true,
      theme: 'light'
    };
    
    // Find and update or create
    let settings = await Setting.findOne({ key: 'general' });
    
    if (settings) {
      settings.value = defaultSettings;
      settings.updatedAt = new Date();
      await settings.save();
    } else {
      settings = new Setting({
        key: 'general',
        value: defaultSettings
      });
      await settings.save();
    }
    
    console.log('Settings initialized:', defaultSettings);
    res.json({ message: 'Settings initialized', settings: defaultSettings });
  } catch (error) {
    console.error('Error initializing settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single setting
router.get('/:key', async (req, res) => {
  try {
    const settings = await Setting.findOne({ key: 'general' });
    if (settings && settings.value[req.params.key] !== undefined) {
      res.json({ [req.params.key]: settings.value[req.params.key] });
    } else {
      res.status(404).json({ error: 'Setting not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
