import BusinessDetail from '../models/BusinessDetail.js';

export const getBusinessDetails = async (req, res) => {
  try {
    let businessDetails = await BusinessDetail.findOne({ key: 'business-details' });
    
    if (!businessDetails) {
      businessDetails = new BusinessDetail({ key: 'business-details' });
      await businessDetails.save();
    }
    
    res.json(businessDetails);
  } catch (error) {
    console.error('Error fetching business details:', error);
    res.status(500).json({ error: error.message });
  }
};

export const saveBusinessDetails = async (req, res) => {
  try {
    const updates = req.body;
    
    let businessDetails = await BusinessDetail.findOne({ key: 'business-details' });
    
    if (businessDetails) {
      Object.assign(businessDetails, updates);
      businessDetails.updatedAt = new Date();
      await businessDetails.save();
    } else {
      businessDetails = new BusinessDetail({
        key: 'business-details',
        ...updates
      });
      await businessDetails.save();
    }
    
    res.json(businessDetails);
  } catch (error) {
    console.error('Error saving business details:', error);
    res.status(500).json({ error: error.message });
  }
};
