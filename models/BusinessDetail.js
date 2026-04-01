import mongoose from 'mongoose';

const businessDetailSchema = new mongoose.Schema({
  key: {
    type: String,
    default: 'business-details',
    unique: true
  },
  name: { type: String, default: '' },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  gst: { type: String, default: '' },
  fssai: { type: String, default: '' },
  upiId: { type: String, default: '' },
  logo: { type: String, default: '' },
  currencySymbol: { type: String, default: '₹' },
  taxLabel: { type: String, default: 'GST' },
  footerMessage: { type: String, default: '' },
  // Print options
  printBusinessName: { type: Boolean, default: true },
  printAddress: { type: Boolean, default: true },
  printPhone: { type: Boolean, default: true },
  printEmail: { type: Boolean, default: true },
  printGst: { type: Boolean, default: true },
  printFssai: { type: Boolean, default: true },
  printHeaderDivider: { type: Boolean, default: true },
  printItems: { type: Boolean, default: true },
  printTaxBreakdown: { type: Boolean, default: true },
  printServiceCharge: { type: Boolean, default: true },
  printGatewayCharges: { type: Boolean, default: true },
  printFooter: { type: Boolean, default: true },
  printQrCode: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const BusinessDetail = mongoose.models.BusinessDetail || mongoose.model('BusinessDetail', businessDetailSchema);

export default BusinessDetail;
