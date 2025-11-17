import express from 'express';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import path from 'path';
import { config, validateConfig } from './config';
import { connectDatabase } from './config/database';
import { logger } from './utils/logger';
import routes from './routes';
import { 
  errorHandler, 
  notFoundHandler, 
  requestId, 
  requestLogger,
  securityHeaders,
  rateLimiters
} from './middleware';
import { healthCheckService } from './services';

// 验证配置
validateConfig();

const app = express();
const PORT = config.port;

// Trust proxy for rate limiting (if behind load balancer)
app.set('trust proxy', 1);

// 基础中间件
app.use(helmet());
app.use(compression());
// 允许的跨域来源（使用类型守卫消除 undefined）
const allowedOrigins = [
  'http://localhost:3000',
  'https://moletech.fun',
  config.frontendUrl
].filter((o): o is string => typeof o === 'string' && o.length > 0);

const corsOptions: CorsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
};

app.use(cors(corsOptions));

// 请求解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 限流
app.use(rateLimiters.general);

// 基础功能中间件
app.use(requestId);
app.use(requestLogger);
app.use(securityHeaders);

// API 路由
app.use('/api', routes);

// 上传静态文件（开发与生产）
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// 健康检查端点
app.get('/health', async (req, res) => {
  try {
    const health = await healthCheckService.getOverallHealth();
    const statusCode = health.overall === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      success: health.overall !== 'unhealthy',
      data: health
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_ERROR',
        message: '健康检查失败'
      }
    });
  }
});

// 根路径
app.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      message: 'MoleTech 3D Figurine Platform API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      documentation: '/api/docs',
      health: '/health'
    }
  });
});

// API 文档端点
app.get('/api/docs', (req, res) => {
  res.json({
    success: true,
    data: {
      title: 'MoleTech 3D Figurine Platform API',
      version: '1.0.0',
      description: '3D手办定制平台的RESTful API',
      baseUrl: `${req.protocol}://${req.get('host')}/api`,
      authentication: {
        type: 'Bearer Token',
        header: 'Authorization',
        scheme: 'Bearer'
      },
      endpoints: {
        auth: {
          'POST /auth/register': '用户注册',
          'POST /auth/login': '用户登录',
          'POST /auth/refresh-token': '刷新令牌',
          'GET /auth/check-username': '检查用户名',
          'GET /auth/check-email': '检查邮箱'
        },
        user: {
          'GET /user/profile': '获取用户信息',
          'PUT /user/profile': '更新用户信息',
          'PUT /user/preferences': '更新用户偏好',
          'GET /user/stats': '获取用户统计'
        },
        products: {
          'GET /products': '获取商品列表',
          'GET /products/:id': '获取商品详情',
          'GET /products/search': '搜索商品',
          'GET /products/categories': '获取商品分类'
        },
        cart: {
          'GET /cart': '获取购物车',
          'POST /cart': '添加商品到购物车',
          'PUT /cart/:id': '更新购物车商品',
          'DELETE /cart/:id': '删除购物车商品'
        },
        orders: {
          'POST /orders': '创建订单',
          'GET /orders': '获取订单列表',
          'GET /orders/:id': '获取订单详情',
          'PUT /orders/:id/status': '更新订单状态'
        },
        images: {
          'POST /images/generate': '生成图像',
          'GET /images/my-images': '获取我的生成图像',
          'GET /images/public': '获取公开图像',
          'DELETE /images/:id': '删除生成图像'
        },
        showcase: {
          'GET /showcase': '获取展示池',
          'POST /showcase': '创建展示项目',
          'POST /showcase/:id/like': '点赞展示项目',
          'POST /showcase/:id/comment': '添加评论'
        },
        payments: {
          'POST /payments/create': '创建支付',
          'GET /payments/verify/:id': '验证支付',
          'GET /payments/methods': '获取支付方式'
        }
      },
      contact: {
        email: config.notification.adminEmail,
        support: 'support@moletech.fun'
      }
    }
  });
});

// 静态文件服务（生产环境）
if (config.nodeEnv === 'production') {
  app.use(express.static(path.join(__dirname, '../public')));
  
  // SPA 回退
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });
}

// 错误处理
app.use(notFoundHandler);
app.use(errorHandler);

// 启动服务器
const startServer = async () => {
  try {
    // 先启动服务器，数据库连接异步进行，避免阻塞开发环境
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server started successfully`, {
        port: PORT,
        environment: config.nodeEnv,
        apiUrl: config.apiUrl,
        frontendUrl: config.frontendUrl
      });
      
      logger.info(`📚 API Documentation: ${config.apiUrl}/api/docs`);
      logger.info(`🔍 Health Check: ${config.apiUrl}/health`);
    });

    // 异步连接数据库（失败时仅记录错误，不退出进程）
    connectDatabase()
      .then(() => {
        logger.info('✅ Database connected');
      })
      .catch((error) => {
        logger.error('❌ Database connection failed', error);
      });

    // 优雅关闭处理
    const gracefulShutdown = (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      
      // 强制关闭超时
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
  }
};

// 启动应用
if (require.main === module) {
  startServer();
}

export default app;