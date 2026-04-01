import BusinessDetail from '../models/BusinessDetail.js';

// Get business details
export const getBusinessDetails = async (req, res) => {
  try {
    let businessDetails = await BusinessDetail.findOne({ key: 'business-details' });
    
    if (!businessDetails) {
      // Create default business details
      businessDetails = new BusinessDetail({ key: 'business-details' });
      await businessDetails.save();
    }
    
    res.json(businessDetails);
  } catch (error) {
    console.error('Error fetching business details:', error);
    res.status(500).json({ error: error.message });
  }
};

// Save/Update business details
export const saveBusinessDetails = async (req, res) => {
  try {
    const updates = req.body;
    
    let businessDetails = await BusinessDetail.findOne({ key: 'business-details' });
    
    if (businessDetails) {
      // Update existing
      Object.assign(businessDetails, updates);
      businessDetails.updatedAt = new Date();
      await businessDetails.save();
    } else {
      // Create new
      businessDetails = new BusinessDetail({
        key: 'business-details',
        ...updates
      });
      await businessDetails.save();
    }
    
    console.log('Business details saved:', businessDetails.name);
    res.json(businessDetails);
  } catch (error) {
    console.error('Error saving business details:', error);
    res.status(500).json({ error: error.message });
  }
};

// Initialize business details
export const initializeBusinessDetails = async (req, res) => {
  try {
    const defaultDetails = {
      key: 'business-details',
      name: 'RESTAURANT NAME',
      address: '123 Main Street, City, State - 123456',
      phone: '+91 9876543210',
      email: 'info@restaurant.com',
      gst: '27ABCDE1234F1Z5',
      fssai: '12345678901234',
      upiId: 'paytm.s1yxcay@pty',
      logo: '',
      currencySymbol: '₹',
      taxLabel: 'GST',
      footerMessage: 'Thank you for your business! Visit Again!',
      printBusinessName: true,
      printAddress: true,
      printPhone: true,
      printEmail: true,
      printGst: true,
      printFssai: true,
      printHeaderDivider: true,
      printItems: true,
      printTaxBreakdown: true,
      printServiceCharge: true,
      printGatewayCharges: true,
      printFooter: true,
      printQrCode: true
    };
    
    let businessDetails = await BusinessDetail.findOne({ key: 'business-details' });
    
    if (businessDetails) {
      // Update existing
      Object.assign(businessDetails, defaultDetails);
      businessDetails.updatedAt = new Date();
      await businessDetails.save();
    } else {
      // Create new
      businessDetails = new BusinessDetail(defaultDetails);
      await businessDetails.save();
    }
    
    console.log('Business details initialized');
    res.json({ message: 'Business details initialized', businessDetails });
  } catch (error) {
    console.error('Error initializing business details:', error);
    res.status(500).json({ error: error.message });
  }
};
