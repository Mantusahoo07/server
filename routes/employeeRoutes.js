const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const employeeController = require('../controllers/employeeController');
const { checkPermission } = require('../middleware/auth');

// Employee routes
router.get('/',
  checkPermission('view_employees'),
  employeeController.getEmployees
);

router.get('/active',
  checkPermission('view_employees'),
  employeeController.getActiveEmployees
);

router.get('/:id',
  checkPermission('view_employees'),
  param('id').isMongoId(),
  employeeController.getEmployeeById
);

router.post('/',
  checkPermission('create_employees'),
  employeeController.createEmployee
);

router.patch('/:id',
  checkPermission('update_employees'),
  param('id').isMongoId(),
  employeeController.updateEmployee
);

router.delete('/:id',
  checkPermission('delete_employees'),
  param('id').isMongoId(),
  employeeController.deleteEmployee
);

// Time clock routes
router.post('/:id/clock-in',
  checkPermission('manage_time_clock'),
  param('id').isMongoId(),
  employeeController.clockIn
);

router.post('/:id/clock-out',
  checkPermission('manage_time_clock'),
  param('id').isMongoId(),
  employeeController.clockOut
);

router.post('/:id/break/start',
  checkPermission('manage_time_clock'),
  param('id').isMongoId(),
  employeeController.startBreak
);

router.post('/:id/break/end',
  checkPermission('manage_time_clock'),
  param('id').isMongoId(),
  employeeController.endBreak
);

// Time entries routes
router.get('/:id/time-entries',
  checkPermission('view_time_clock'),
  param('id').isMongoId(),
  employeeController.getTimeEntries
);

// Schedule routes
router.get('/schedule',
  checkPermission('view_schedule'),
  employeeController.getSchedule
);

router.post('/schedule',
  checkPermission('manage_schedule'),
  employeeController.createSchedule
);

router.patch('/schedule/:id',
  checkPermission('manage_schedule'),
  param('id').isMongoId(),
  employeeController.updateSchedule
);

// Performance routes
router.get('/:id/performance',
  checkPermission('view_performance'),
  param('id').isMongoId(),
  employeeController.getPerformance
);

// Payroll routes
router.get('/payroll',
  checkPermission('view_payroll'),
  employeeController.getPayroll
);

router.post('/payroll/process',
  checkPermission('process_payroll'),
  employeeController.processPayroll
);

module.exports = router;