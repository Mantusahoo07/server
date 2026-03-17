const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const socketIO = require('socket.io');
const http = require('http');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');
const menuRoutes = require('./routes/menuRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const customerRoutes = require('./routes/customerRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const reportRoutes = require('./routes/reportRoutes');
const locationRoutes = require('./routes/locationRoutes');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');

// Import utils
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use('/api/', limiter);

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/reports', express.static(path.join(__dirname, 'reports')));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/restaurant-pos', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  logger.info('Connected to MongoDB');
})
.catch(err => {
  logger.error('MongoDB connection error:', err);
  process.exit(1);
});

// Make io accessible to routes
app.set('io', io);

// WebSocket connection for real-time updates
io.on('connection', (socket) => {
  logger.info('New client connected:', socket.id);
  
  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.join(`user:${decoded.userId}`);
      socket.join(`location:${decoded.locationId}`);
      logger.info('Client authenticated:', socket.id);
    } catch (error) {
      logger.error('Authentication failed:', error);
    }
  });
  
  socket.on('join-location', (locationId) => {
    socket.join(`location:${locationId}`);
  });
  
  socket.on('disconnect', () => {
    logger.info('Client disconnected:', socket.id);
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', authenticate, orderRoutes);
app.use('/api/menu', authenticate, menuRoutes);
app.use('/api/inventory', authenticate, inventoryRoutes);
app.use('/api/customers', authenticate, customerRoutes);
app.use('/api/employees', authenticate, employeeRoutes);
app.use('/api/reports', authenticate, reportRoutes);
app.use('/api/locations', authenticate, locationRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
  logger.info('Received shutdown signal');
  
  // Close database connection
  await mongoose.connection.close();
  logger.info('Database connection closed');
  
  // Close server
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}

module.exports = { app, server, io };