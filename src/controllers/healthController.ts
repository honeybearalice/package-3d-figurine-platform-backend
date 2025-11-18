import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';

const prisma = new PrismaClient();

export const healthCheck = async (req: Request, res: Response) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check environment variables
    const requiredEnvVars = [
      'DATABASE_URL',
      'JWT_SECRET',
      'DOUBAO_API_KEY'
    ];
    
    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.nodeEnv,
      database: 'connected',
      services: {
        database: 'healthy',
        ai: config.doubao.apiKey ? 'configured' : 'missing_api_key',
        storage: config.aws.accessKeyId ? 'configured' : 'missing_credentials'
      },
      config: {
        apiUrl: config.apiUrl,
        frontendUrl: config.frontendUrl,
        awsRegion: config.aws.region,
        s3Bucket: config.aws.bucketName
      }
    };

    if (missingEnvVars.length > 0) {
      healthStatus.status = 'warning';
      healthStatus.services.config = 'incomplete';
      healthStatus.missingEnvVars = missingEnvVars;
    }

    res.status(200).json(healthStatus);
  } catch (error) {
    console.error('Health check failed:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const readinessCheck = async (req: Request, res: Response) => {
  try {
    // More comprehensive readiness check
    await prisma.$queryRaw`SELECT 1`;
    
    // Test a more complex query
    const userCount = await prisma.user.count();
    
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'connected',
        users: userCount,
        environment: config.nodeEnv
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: 'Service not ready',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};