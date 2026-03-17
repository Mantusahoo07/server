const mongoose = require('mongoose');

const timeEntrySchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  clockIn: Date,
  clockOut: Date,
  breakStart: Date,
  breakEnd: Date,
  totalHours: Number,
  regularHours: Number,
  overtimeHours: Number,
  status: {
    type: String,
    enum: ['active', 'completed'],
    default: 'active'
  }
});

const scheduleSchema = new mongoose.Schema({
  date: Date,
  shift: {
    type: String,
    enum: ['morning', 'evening', 'night', 'off']
  },
  startTime: String,
  endTime: String,
  notes: String
});

const performanceSchema = new mongoose.Schema({
  period: String,
  sales: Number,
  orders: Number,
  tips: Number,
  rating: Number,
  attendance: Number,
  punctuality: Number
});

const employeeSchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  employeeId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  phone: String,
  role: {
    type: String,
    enum: ['admin', 'manager', 'cashier', 'server', 'chef', 'kitchen', 'host', 'bartender'],
    required: true
  },
  department: String,
  position: String,
  hireDate: {
    type: Date,
    default: Date.now
  },
  employmentType: {
    type: String,
    enum: ['full-time', 'part-time', 'contract'],
    default: 'full-time'
  },
  hourlyRate: Number,
  salary: Number,
  payFrequency: {
    type: String,
    enum: ['hourly', 'weekly', 'biweekly', 'monthly'],
    default: 'hourly'
  },
  shift: {
    type: String,
    enum: ['morning', 'evening', 'night', 'rotating']
  },
  status: {
    type: String,
    enum: ['active', 'on-break', 'offline', 'on-leave', 'terminated'],
    default: 'offline'
  },
  timeEntries: [timeEntrySchema],
  schedule: [scheduleSchema],
  performance: [performanceSchema],
  documents: [{
    name: String,
    type: String,
    url: String,
    uploadedAt: Date
  }],
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String
  },
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
employeeSchema.index({ locationId: 1, employeeId: 1 });
employeeSchema.index({ locationId: 1, role: 1 });
employeeSchema.index({ locationId: 1, status: 1 });

// Methods
employeeSchema.methods.clockIn = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let timeEntry = this.timeEntries.find(e => 
    new Date(e.date).setHours(0, 0, 0, 0) === today.getTime() && e.status === 'active'
  );
  
  if (!timeEntry) {
    timeEntry = {
      date: today,
      clockIn: new Date(),
      status: 'active'
    };
    this.timeEntries.push(timeEntry);
  } else {
    timeEntry.clockIn = new Date();
  }
  
  this.status = 'active';
  await this.save();
  return timeEntry;
};

employeeSchema.methods.clockOut = async function() {
  const activeEntry = this.timeEntries.find(e => e.status === 'active');
  
  if (activeEntry) {
    activeEntry.clockOut = new Date();
    const hours = (activeEntry.clockOut - activeEntry.clockIn) / (1000 * 60 * 60);
    activeEntry.totalHours = hours;
    activeEntry.regularHours = Math.min(hours, 8);
    activeEntry.overtimeHours = Math.max(0, hours - 8);
    activeEntry.status = 'completed';
    
    this.status = 'offline';
    await this.save();
  }
  
  return activeEntry;
};

employeeSchema.methods.startBreak = async function() {
  const activeEntry = this.timeEntries.find(e => e.status === 'active');
  if (activeEntry) {
    activeEntry.breakStart = new Date();
    this.status = 'on-break';
    await this.save();
  }
  return activeEntry;
};

employeeSchema.methods.endBreak = async function() {
  const activeEntry = this.timeEntries.find(e => e.status === 'active');
  if (activeEntry && activeEntry.breakStart) {
    activeEntry.breakEnd = new Date();
    this.status = 'active';
    await this.save();
  }
  return activeEntry;
};

const Employee = mongoose.model('Employee', employeeSchema);
module.exports = Employee;