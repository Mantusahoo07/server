import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Global variable for keep-alive interval
let keepAliveInterval = null;

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 60000,
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      retryReads: true
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Setup connection event handlers
    mongoose.connection.on('connected', () => {
      console.log('✅ MongoDB connection established');
      startKeepAlive();
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
      stopKeepAlive();
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected');
      startKeepAlive();
    });
    
    return conn;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    throw error;
  }
};

// Start keep-alive pings
const startKeepAlive = () => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
  
  console.log('🔥 Starting MongoDB keep-alive service...');
  
  keepAliveInterval = setInterval(async () => {
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.db.admin().command({ ping: 1 });
        console.log(`💓 MongoDB keep-alive ping at ${new Date().toLocaleTimeString()}`);
      } else {
        console.log(`⚠️ MongoDB not connected (state: ${mongoose.connection.readyState}), skipping keep-alive`);
      }
    } catch (error) {
      console.error('❌ MongoDB keep-alive ping failed:', error.message);
    }
  }, 3 * 60 * 1000);
};

// Stop keep-alive interval
const stopKeepAlive = () => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('⏹️ MongoDB keep-alive stopped');
  }
};

// Manual ping function
export const pingDatabase = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.admin().command({ ping: 1 });
      return { success: true, message: 'Database is awake' };
    } else {
      return { success: false, message: `Database not connected (state: ${mongoose.connection.readyState})` };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// Get connection status
export const getConnectionStatus = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
    99: 'uninitialized'
  };
  
  return {
    state: states[mongoose.connection.readyState] || 'unknown',
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    keepAliveActive: keepAliveInterval !== null
  };
};

export default connectDB;
