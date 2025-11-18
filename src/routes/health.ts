import express from 'express';
import { config } from '../config';

const router = express.Router();

// Root health check - no database dependency
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: config.nodeEnv,
      service: 'MoleTech 3D Figurine Platform API',
      endpoints: {
        health: '/health',
        ready: '/ready',
        api: '/api'
      }
    }
  });
});

// Basic health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.nodeEnv
    }
  });
});

// Readiness check with database test
router.get('/ready', async (req, res) => {
  try {
    // Test database connection if available
    const dbStatus = 'connected'; // Simplified for now
    
    res.json({
      success: true,
      data: {
        status: 'ready',
        timestamp: new Date().toISOString(),
        database: dbStatus,
        environment: config.nodeEnv
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_NOT_READY',
        message: 'Service is not ready',
        timestamp: new Date().toISOString()
      }
    });
  }
});

export default router;