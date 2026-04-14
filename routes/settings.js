import express from 'express';
import Setting from '../models/Setting.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Default settings with taxRate = 0
const DEFAULT_SETTINGS = {
  taxRate: 0,  // Changed from 10 to 0
  serviceCharge: 0,
  kitchenPrint: true,
  autoAcceptOrders: false,
  soundEnabled: true,
  theme: 'light'
};

// Get all settings (from database)
router.get('/', async (req, res) => {
  try {
    // Check if settings exist in database
    let settings = await Setting.findOne({ key: 'general' });
    
    if (!settings) {
      // Create default settings if not exists
      settings = new Setting({
        key: 'general',
        value: DEFAULT_SETTINGS
      });
      await settings.save();
      console.log('Created default settings with taxRate=0');
    }
    
    // Ensure taxRate is a number and set to 0 if missing
    const settingsValue = settings.value;
    if (settingsValue.taxRate === undefined || settingsValue.taxRate === null || isNaN(settingsValue.taxRate)) {
      settingsValue.taxRate = 0;
    }
    if (settingsValue.serviceCharge === undefined || settingsValue.serviceCharge === null || isNaN(settingsValue.serviceCharge)) {
      settingsValue.serviceCharge = 0;
    }
    
    res.json(settingsValue);
  } catch (error) {
    console.error('Error fetching settings:', error);
    // Return default settings on error
    res.json(DEFAULT_SETTINGS);
  }
});

// Update settings - Now protected with authentication
router.post('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const updates = req.body;
    
    // Validate and sanitize numeric fields
    const sanitizedUpdates = {};
    
    // Handle taxRate - ensure it's a number and not negative
    if (updates.taxRate !== undefined) {
      let taxRate = parseFloat(updates.taxRate);
      if (isNaN(taxRate)) taxRate = 0;
      if (taxRate < 0) taxRate = 0;
      sanitizedUpdates.taxRate = taxRate;
    }
    
    // Handle serviceCharge
    if (updates.serviceCharge !== undefined) {
      let serviceCharge = parseFloat(updates.serviceCharge);
      if (isNaN(serviceCharge)) serviceCharge = 0;
      if (serviceCharge < 0) serviceCharge = 0;
      sanitizedUpdates.serviceCharge = serviceCharge;
    }
    
    // Handle boolean fields
    const booleanFields = ['kitchenPrint', 'autoAcceptOrders', 'soundEnabled'];
    booleanFields.forEach(field => {
      if (updates[field] !== undefined) {
        sanitizedUpdates[field] = updates[field] === true || updates[field] === 'true';
      }
    });
    
    // Handle theme
    if (updates.theme !== undefined) {
      sanitizedUpdates.theme = updates.theme === 'dark' ? 'dark' : 'light';
    }
    
    // Find and update or create
    let settings = await Setting.findOne({ key: 'general' });
    
    if (settings) {
      settings.value = { ...settings.value, ...sanitizedUpdates };
      settings.updatedAt = new Date();
      await settings.save();
    } else {
      settings = new Setting({
        key: 'general',
        value: { ...DEFAULT_SETTINGS, ...sanitizedUpdates }
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

// Initialize or reset settings - Protected route
router.post('/initialize', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Find and update or create
    let settings = await Setting.findOne({ key: 'general' });
    
    if (settings) {
      settings.value = { ...DEFAULT_SETTINGS };
      settings.updatedAt = new Date();
      await settings.save();
    } else {
      settings = new Setting({
        key: 'general',
        value: DEFAULT_SETTINGS
      });
      await settings.save();
    }
    
    console.log('Settings initialized with taxRate=0:', DEFAULT_SETTINGS);
    res.json({ message: 'Settings initialized', settings: DEFAULT_SETTINGS });
  } catch (error) {
    console.error('Error initializing settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single setting
router.get('/:key', async (req, res) => {
  try {
    const settings = await Setting.findOne({ key: 'general' });
    
    if (!settings) {
      // Return default value if settings don't exist
      if (DEFAULT_SETTINGS[req.params.key] !== undefined) {
        return res.json({ [req.params.key]: DEFAULT_SETTINGS[req.params.key] });
      }
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    const value = settings.value[req.params.key];
    if (value !== undefined) {
      // Ensure numeric values are numbers
      if (req.params.key === 'taxRate' || req.params.key === 'serviceCharge') {
        const numValue = parseFloat(value);
        res.json({ [req.params.key]: isNaN(numValue) ? 0 : numValue });
      } else {
        res.json({ [req.params.key]: value });
      }
    } else {
      // Check if it's a default setting
      if (DEFAULT_SETTINGS[req.params.key] !== undefined) {
        res.json({ [req.params.key]: DEFAULT_SETTINGS[req.params.key] });
      } else {
        res.status(404).json({ error: 'Setting not found' });
      }
    }
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update single setting - Protected route
router.patch('/:key', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    let settings = await Setting.findOne({ key: 'general' });
    
    if (!settings) {
      settings = new Setting({
        key: 'general',
        value: DEFAULT_SETTINGS
      });
    }
    
    // Validate based on field
    let validatedValue = value;
    
    if (key === 'taxRate') {
      let numValue = parseFloat(value);
      if (isNaN(numValue)) numValue = 0;
      if (numValue < 0) numValue = 0;
      validatedValue = numValue;
    } else if (key === 'serviceCharge') {
      let numValue = parseFloat(value);
      if (isNaN(numValue)) numValue = 0;
      if (numValue < 0) numValue = 0;
      validatedValue = numValue;
    } else if (key === 'kitchenPrint' || key === 'autoAcceptOrders' || key === 'soundEnabled') {
      validatedValue = value === true || value === 'true';
    } else if (key === 'theme') {
      validatedValue = value === 'dark' ? 'dark' : 'light';
    }
    
    settings.value[key] = validatedValue;
    settings.updatedAt = new Date();
    await settings.save();
    
    res.json({ [key]: settings.value[key] });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get settings with validation (ensures all fields exist)
router.get('/validated/all', async (req, res) => {
  try {
    let settings = await Setting.findOne({ key: 'general' });
    
    if (!settings) {
      settings = new Setting({
        key: 'general',
        value: DEFAULT_SETTINGS
      });
      await settings.save();
    }
    
    // Merge with defaults to ensure all fields exist
    const validatedSettings = { ...DEFAULT_SETTINGS, ...settings.value };
    
    // Ensure numeric fields are numbers
    validatedSettings.taxRate = parseFloat(validatedSettings.taxRate) || 0;
    validatedSettings.serviceCharge = parseFloat(validatedSettings.serviceCharge) || 0;
    
    res.json(validatedSettings);
  } catch (error) {
    console.error('Error fetching validated settings:', error);
    res.json(DEFAULT_SETTINGS);
  }
});

export default router;
