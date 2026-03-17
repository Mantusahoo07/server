const Employee = require('../models/Employee');
const User = require('../models/User');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private
exports.getEmployees = catchAsync(async (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    role, 
    status, 
    department,
    search,
    locationId 
  } = req.query;

  const query = { locationId: locationId || req.user.location };

  if (role) query.role = role;
  if (status) query.status = status;
  if (department) query.department = department;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { employeeId: { $regex: search, $options: 'i' } }
    ];
  }

  const options = {
    skip: (page - 1) * limit,
    limit: parseInt(limit),
    sort: 'name'
  };

  const employees = await Employee.find(query, null, options);
  const total = await Employee.countDocuments(query);

  res.json({
    success: true,
    data: employees,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get active employees
// @route   GET /api/employees/active
// @access  Private
exports.getActiveEmployees = catchAsync(async (req, res) => {
  const { locationId } = req.query;

  const employees = await Employee.find({
    locationId: locationId || req.user.location,
    status: { $in: ['active', 'on-break'] }
  }).sort('name');

  res.json({
    success: true,
    data: employees
  });
});

// @desc    Get employee by ID
// @route   GET /api/employees/:id
// @access  Private
exports.getEmployeeById = catchAsync(async (req, res) => {
  const employee = await Employee.findById(req.params.id)
    .populate('userId', 'username email');

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  // Get today's time entry
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEntry = employee.timeEntries.find(entry => 
    new Date(entry.date).setHours(0, 0, 0, 0) === today.getTime()
  );

  res.json({
    success: true,
    data: {
      ...employee.toObject(),
      todayEntry
    }
  });
});

// @desc    Create employee
// @route   POST /api/employees
// @access  Private (Manager/Admin)
exports.createEmployee = catchAsync(async (req, res) => {
  const employeeData = {
    ...req.body,
    locationId: req.body.locationId || req.user.location,
    createdBy: req.user._id
  };

  // Check if employee ID already exists
  const existingEmployee = await Employee.findOne({
    locationId: employeeData.locationId,
    employeeId: employeeData.employeeId
  });

  if (existingEmployee) {
    throw new AppError('Employee ID already exists', 400);
  }

  const employee = await Employee.create(employeeData);

  // Create user account for employee
  if (req.body.createUser) {
    const User = require('../models/User');
    const user = await User.create({
      username: employeeData.email,
      email: employeeData.email,
      password: req.body.password || 'ChangeMe123!',
      name: employeeData.name,
      role: employeeData.role,
      employeeId: employee._id,
      location: employeeData.locationId,
      createdBy: req.user._id
    });

    employee.userId = user._id;
    await employee.save();
  }

  logger.audit('EMPLOYEE_CREATED', req.user._id, {
    employeeId: employee._id,
    name: employee.name
  });

  res.status(201).json({
    success: true,
    data: employee
  });
});

// @desc    Update employee
// @route   PATCH /api/employees/:id
// @access  Private (Manager/Admin)
exports.updateEmployee = catchAsync(async (req, res) => {
  const employee = await Employee.findById(req.params.id);

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  const allowedUpdates = [
    'name', 'email', 'phone', 'role', 'department', 'position',
    'hourlyRate', 'salary', 'payFrequency', 'shift', 'status',
    'emergencyContact', 'address', 'notes'
  ];

  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      employee[field] = req.body[field];
    }
  });

  await employee.save();

  // Update associated user if exists
  if (employee.userId) {
    const User = require('../models/User');
    await User.findByIdAndUpdate(employee.userId, {
      name: employee.name,
      email: employee.email,
      role: employee.role
    });
  }

  logger.audit('EMPLOYEE_UPDATED', req.user._id, {
    employeeId: employee._id,
    changes: req.body
  });

  res.json({
    success: true,
    data: employee
  });
});

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private (Manager/Admin)
exports.deleteEmployee = catchAsync(async (req, res) => {
  const employee = await Employee.findById(req.params.id);

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  // Delete associated user if exists
  if (employee.userId) {
    const User = require('../models/User');
    await User.findByIdAndDelete(employee.userId);
  }

  await employee.deleteOne();

  logger.audit('EMPLOYEE_DELETED', req.user._id, {
    employeeId: employee._id,
    name: employee.name
  });

  res.json({
    success: true,
    message: 'Employee deleted successfully'
  });
});

// @desc    Clock in
// @route   POST /api/employees/:id/clock-in
// @access  Private
exports.clockIn = catchAsync(async (req, res) => {
  const employee = await Employee.findById(req.params.id);

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  const entry = await employee.clockIn();

  // Emit socket event
  req.app.get('io').to(`location:${employee.locationId}`).emit('employee:clocked-in', {
    employeeId: employee._id,
    name: employee.name,
    time: entry.clockIn
  });

  res.json({
    success: true,
    data: entry
  });
});

// @desc    Clock out
// @route   POST /api/employees/:id/clock-out
// @access  Private
exports.clockOut = catchAsync(async (req, res) => {
  const employee = await Employee.findById(req.params.id);

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  const entry = await employee.clockOut();

  // Emit socket event
  req.app.get('io').to(`location:${employee.locationId}`).emit('employee:clocked-out', {
    employeeId: employee._id,
    name: employee.name,
    entry
  });

  res.json({
    success: true,
    data: entry
  });
});

// @desc    Start break
// @route   POST /api/employees/:id/break/start
// @access  Private
exports.startBreak = catchAsync(async (req, res) => {
  const employee = await Employee.findById(req.params.id);

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  const entry = await employee.startBreak();

  // Emit socket event
  req.app.get('io').to(`location:${employee.locationId}`).emit('employee:break-started', {
    employeeId: employee._id,
    name: employee.name
  });

  res.json({
    success: true,
    data: entry
  });
});

// @desc    End break
// @route   POST /api/employees/:id/break/end
// @access  Private
exports.endBreak = catchAsync(async (req, res) => {
  const employee = await Employee.findById(req.params.id);

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  const entry = await employee.endBreak();

  // Emit socket event
  req.app.get('io').to(`location:${employee.locationId}`).emit('employee:break-ended', {
    employeeId: employee._id,
    name: employee.name
  });

  res.json({
    success: true,
    data: entry
  });
});

// @desc    Get time entries
// @route   GET /api/employees/:id/time-entries
// @access  Private
exports.getTimeEntries = catchAsync(async (req, res) => {
  const { startDate, endDate, page = 1, limit = 50 } = req.query;

  const employee = await Employee.findById(req.params.id);

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  let entries = employee.timeEntries;

  if (startDate || endDate) {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    entries = entries.filter(entry => 
      entry.date >= start && entry.date <= end
    );
  }

  // Paginate
  const startIndex = (page - 1) * limit;
  const paginatedEntries = entries.slice(startIndex, startIndex + parseInt(limit));

  res.json({
    success: true,
    data: paginatedEntries,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: entries.length
    }
  });
});

// @desc    Get schedule
// @route   GET /api/employees/schedule
// @access  Private
exports.getSchedule = catchAsync(async (req, res) => {
  const { startDate, endDate, locationId } = req.query;

  const query = { locationId: locationId || req.user.location };

  const employees = await Employee.find(query).select('name role schedule');

  let scheduleData = [];

  employees.forEach(employee => {
    if (employee.schedule && employee.schedule.length > 0) {
      let schedule = employee.schedule;
      
      if (startDate && endDate) {
        schedule = employee.schedule.filter(s => 
          s.date >= new Date(startDate) && s.date <= new Date(endDate)
        );
      }

      scheduleData.push({
        employeeId: employee._id,
        employeeName: employee.name,
        role: employee.role,
        schedule
      });
    }
  });

  res.json({
    success: true,
    data: scheduleData
  });
});

// @desc    Create schedule
// @route   POST /api/employees/schedule
// @access  Private (Manager/Admin)
exports.createSchedule = catchAsync(async (req, res) => {
  const { employeeId, schedule } = req.body;

  const employee = await Employee.findById(employeeId);

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  // Add new schedule entries
  employee.schedule.push(...schedule);
  await employee.save();

  res.json({
    success: true,
    data: employee.schedule
  });
});

// @desc    Update schedule
// @route   PATCH /api/employees/schedule/:id
// @access  Private (Manager/Admin)
exports.updateSchedule = catchAsync(async (req, res) => {
  const { employeeId, scheduleId } = req.params;
  const updates = req.body;

  const employee = await Employee.findById(employeeId);

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  const schedule = employee.schedule.id(scheduleId);
  if (!schedule) {
    throw new AppError('Schedule entry not found', 404);
  }

  Object.assign(schedule, updates);
  await employee.save();

  res.json({
    success: true,
    data: schedule
  });
});

// @desc    Get performance
// @route   GET /api/employees/:id/performance
// @access  Private
exports.getPerformance = catchAsync(async (req, res) => {
  const { period = 'month' } = req.query;
  const employee = await Employee.findById(req.params.id);

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  // Get order data for this employee
  const Order = require('../models/Order');
  
  let startDate = new Date();
  switch (period) {
    case 'week':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case 'quarter':
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case 'year':
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
  }

  const orders = await Order.find({
    serverId: employee._id,
    'timing.orderedAt': { $gte: startDate }
  });

  const performance = {
    period,
    totalOrders: orders.length,
    totalSales: orders.reduce((sum, o) => sum + o.total, 0),
    averageOrderValue: orders.length ? 
      orders.reduce((sum, o) => sum + o.total, 0) / orders.length : 0,
    totalTips: orders.reduce((sum, o) => 
      sum + o.payments.reduce((s, p) => s + (p.tip || 0), 0), 0
    )
  };

  res.json({
    success: true,
    data: performance
  });
});

// @desc    Get payroll
// @route   GET /api/employees/payroll
// @access  Private (Manager/Admin)
exports.getPayroll = catchAsync(async (req, res) => {
  const { startDate, endDate, locationId } = req.query;

  const employees = await Employee.find({
    locationId: locationId || req.user.location,
    status: { $ne: 'terminated' }
  });

  const start = startDate ? new Date(startDate) : new Date(new Date().setDate(1));
  const end = endDate ? new Date(endDate) : new Date();

  const payroll = [];

  for (const employee of employees) {
    // Get time entries for period
    const timeEntries = employee.timeEntries.filter(entry => 
      entry.date >= start && entry.date <= end && entry.status === 'completed'
    );

    const totalHours = timeEntries.reduce((sum, e) => sum + (e.totalHours || 0), 0);
    const regularHours = timeEntries.reduce((sum, e) => sum + (e.regularHours || 0), 0);
    const overtimeHours = timeEntries.reduce((sum, e) => sum + (e.overtimeHours || 0), 0);

    let grossPay = 0;
    if (employee.payFrequency === 'hourly') {
      grossPay = (regularHours * employee.hourlyRate) + 
                 (overtimeHours * employee.hourlyRate * 1.5);
    } else {
      grossPay = employee.salary || 0;
    }

    payroll.push({
      employeeId: employee._id,
      employeeName: employee.name,
      employeeId: employee.employeeId,
      role: employee.role,
      payFrequency: employee.payFrequency,
      hourlyRate: employee.hourlyRate,
      salary: employee.salary,
      timeEntries: timeEntries.length,
      totalHours,
      regularHours,
      overtimeHours,
      grossPay
    });
  }

  res.json({
    success: true,
    data: payroll
  });
});

// @desc    Process payroll
// @route   POST /api/employees/payroll/process
// @access  Private (Manager/Admin)
exports.processPayroll = catchAsync(async (req, res) => {
  const { startDate, endDate, employeeIds } = req.body;

  // This would integrate with a payroll system
  // For now, just log it
  logger.audit('PAYROLL_PROCESSED', req.user._id, {
    startDate,
    endDate,
    employeeCount: employeeIds?.length || 'all'
  });

  res.json({
    success: true,
    message: 'Payroll processed successfully'
  });
});