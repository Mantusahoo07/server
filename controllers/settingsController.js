import Setting from '../models/Setting.js';

// Get all settings
export const getSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne({ key: 'general' });
    
    if (!settings) {
      // Create default settings
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
    res.status(500).json({ error: error.message });
  }
};

// Update settings
export const updateSettings = async (req, res) => {
  try {
    const updates = req.body;
    
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
};

// Initialize settings
export const initializeSettings = async (req, res) => {
  try {
    const defaultSettings = {
      taxRate: 10,
      serviceCharge: 0,
      kitchenPrint: true,
      autoAcceptOrders: false,
      soundEnabled: true,
      theme: 'light'
    };
    
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
    
    res.json({ message: 'Settings initialized', settings: defaultSettings });
  } catch (error) {
    console.error('Error initializing settings:', error);
    res.status(500).json({ error: error.message });
  }
};
