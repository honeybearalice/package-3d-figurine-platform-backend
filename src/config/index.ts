import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config();

export const config = {
  // 服务器配置
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiUrl: process.env.API_URL || 'http://localhost:3001',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // 数据库配置
  database: {
    url: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/moletech_figurine_db',
  },

  // JWT 配置
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  // AWS S3 配置
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-west-2',
    bucketName: process.env.S3_BUCKET_NAME || 'moletech-figurine-uploads',
  },

  // 豆包 API 配置
  doubao: {
    endpoint: process.env.DOUBAO_API_URL || process.env.DOUBAO_API_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    apiKey: process.env.DOUBAO_API_KEY || '',
    model: process.env.DOUBAO_MODEL || 'doubao-seedream-4-0-250828',
  },

  // 支付配置
  payment: {
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    },
    paypal: {
      clientId: process.env.PAYPAL_CLIENT_ID,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET,
      mode: process.env.PAYPAL_MODE || 'sandbox', // sandbox or live
    },
  },

  // 邮件配置
  email: {
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY,
    },
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
      port: parseInt(process.env.SMTP_PORT || '587'),
      user: process.env.SMTP_USER || 'apikey',
      pass: process.env.SMTP_PASS,
    },
    from: {
      email: process.env.FROM_EMAIL || 'noreply@moletech.fun',
      name: process.env.FROM_NAME || 'MoleTech 3D Figurine Platform',
    },
  },

  // 短信配置
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  // 通知配置
  notification: {
    adminPhone: process.env.ADMIN_PHONE || '18664589852',
    adminEmail: process.env.ADMIN_EMAIL || '454757093@qq.com',
    companyName: process.env.COMPANY_NAME || 'moletech international trading Co., Ltd.',
    domain: process.env.DOMAIN || 'moletech.fun',
  },

  // Redis 配置
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },

  // 限流配置
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'), // 100 requests per windowMs
  },

  // 文件上传配置
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
    allowedTypes: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/webp').split(','),
  },

  // 业务配置
  business: {
    // 订单状态转换时间（天）
    orderStatusTimelines: {
      pending: 0,
      confirmed: 1,
      design_approved: 2,
      in_production: 3,
      quality_check: 7,
      packaging: 10,
      shipped: 14,
      delivered: 21,
    },
    // 订单完成预估时间（天）
    estimatedCompletionDays: 25,
    // 购物车商品最大数量
    maxCartItems: 100,
    // 购物车有效期（小时）
    cartExpiryHours: 24,
    // 支付超时时间（分钟）
    paymentTimeoutMinutes: 30,
    // 图片生成最大并发数
    maxImageGenerationConcurrency: 3,
    // 图像质量配置
    imageQuality: {
      low: { size: '1K', quality: 0.7 },
      medium: { size: '1K', quality: 0.8 },
      high: { size: '2K', quality: 0.9 },
    },
  },
};

// 验证必需的环境变量
export const validateConfig = () => {
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
};

// 导出默认配置对象
export default config;