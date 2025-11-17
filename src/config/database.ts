import { PrismaClient } from '@prisma/client';
import { config } from './index';
import { logger } from '../utils/logger';

// 创建 Prisma 客户端实例
const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
});

// 数据库查询日志
prisma.$on('query', (e) => {
  if (config.nodeEnv === 'development') {
    logger.debug('Query: ' + e.query);
    logger.debug('Params: ' + e.params);
    logger.debug('Duration: ' + e.duration + 'ms');
  }
});

// 数据库错误日志
prisma.$on('error', (e) => {
  logger.error('Database error:', e);
});

// 数据库信息日志
prisma.$on('info', (e) => {
  logger.info('Database info:', e.message);
});

// 数据库警告日志
prisma.$on('warn', (e) => {
  logger.warn('Database warning:', e.message);
});

// 连接数据库
export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected successfully');
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    // 在开发环境不要直接退出进程，允许服务器继续运行以便验证路由
    // 生产环境可以考虑在上层处理退出逻辑
  }
};

// 断开数据库连接
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('✅ Database disconnected successfully');
  } catch (error) {
    logger.error('❌ Database disconnection failed:', error);
  }
};

// 健康检查
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
};

// 优雅关闭处理
process.on('beforeExit', async () => {
  await disconnectDatabase();
});

process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});

export default prisma;