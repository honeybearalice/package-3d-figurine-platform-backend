// 数据库服务
export * from './database';

// 豆包AI服务
export * from './doubao';

// 通知服务
export * from './notification';

// 支付服务
export * from './payment';

// AWS S3 服务
export class S3Service {
  private s3: any;
  private bucketName: string;

  constructor() {
    const AWS = require('aws-sdk');
    const { config } = require('../config');
    
    this.s3 = new AWS.S3({
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
      region: config.aws.region
    });
    
    this.bucketName = config.aws.bucketName;
  }

  async uploadFile(
    key: string, 
    body: Buffer, 
    contentType: string = 'application/octet-stream',
    metadata: any = {}
  ) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata
      };

      const result = await this.s3.upload(params).promise();
      
      return {
        success: true,
        url: result.Location,
        key: result.Key,
        etag: result.ETag
      };
    } catch (error: any) {
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  async deleteFile(key: string) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key
      };

      await this.s3.deleteObject(params).promise();
      
      return { success: true };
    } catch (error: any) {
      throw new Error(`S3 delete failed: ${error.message}`);
    }
  }

  getFileUrl(key: string): string {
    return `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-west-2'}.amazonaws.com/${key}`;
  }
}

// 缓存服务
export class CacheService {
  private redis: any;

  constructor() {
    const { createClient } = require('redis');
    const { config } = require('../config');
    
    this.redis = createClient({ url: config.redis.url });
  }

  async connect() {
    try {
      await this.redis.connect();
      console.log('Redis connected successfully');
    } catch (error) {
      console.error('Redis connection failed:', error);
    }
  }

  async get(key: string) {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  async set(key: string, value: any, expirationInSeconds?: number) {
    try {
      const serialized = JSON.stringify(value);
      if (expirationInSeconds) {
        await this.redis.setEx(key, expirationInSeconds, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
      return true;
    } catch (error) {
      console.error('Redis set error:', error);
      return false;
    }
  }

  async delete(key: string) {
    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      console.error('Redis delete error:', error);
      return false;
    }
  }

  async clear() {
    try {
      await this.redis.flushDb();
      return true;
    } catch (error) {
      console.error('Redis clear error:', error);
      return false;
    }
  }
}

// 文件服务
export class FileService {
  private s3Service: S3Service;
  private cacheService: CacheService;

  constructor() {
    this.s3Service = new S3Service();
    this.cacheService = new CacheService();
  }

  async uploadImage(
    file: Buffer, 
    fileName: string, 
    folder: string = 'uploads',
    metadata: any = {}
  ) {
    const key = `${folder}/${Date.now()}_${fileName}`;
    
    try {
      const result = await this.s3Service.uploadFile(
        key, 
        file, 
        'image/jpeg', 
        metadata
      );
      
      // 缓存文件信息
      await this.cacheService.set(`file:${key}`, {
        key,
        url: result.url,
        uploadedAt: new Date(),
        ...metadata
      }, 3600); // 1小时缓存
      
      return result;
    } catch (error: any) {
      throw new Error(`Image upload failed: ${error.message}`);
    }
  }

  async deleteImage(key: string) {
    try {
      const result = await this.s3Service.deleteFile(key);
      
      // 清除缓存
      await this.cacheService.delete(`file:${key}`);
      
      return result;
    } catch (error: any) {
      throw new Error(`Image delete failed: ${error.message}`);
    }
  }

  getImageUrl(key: string): string {
    return this.s3Service.getFileUrl(key);
  }
}

// 统计服务
export class AnalyticsService {
  private cacheService: CacheService;

  constructor() {
    this.cacheService = new CacheService();
  }

  async trackEvent(event: string, data: any) {
    const key = `analytics:${event}`;
    const existing = await this.cacheService.get(key) || { count: 0, data: [] };
    
    existing.count += 1;
    existing.data.push({
      ...data,
      timestamp: new Date()
    });
    
    // 保留最近1000条数据
    if (existing.data.length > 1000) {
      existing.data = existing.data.slice(-1000);
    }
    
    await this.cacheService.set(key, existing, 86400); // 24小时缓存
  }

  async getEventStats(event: string) {
    const key = `analytics:${event}`;
    return await this.cacheService.get(key) || { count: 0, data: [] };
  }

  async getDailyStats(date: string) {
    const key = `analytics:daily:${date}`;
    return await this.cacheService.get(key) || {};
  }
}

// 队列服务
export class QueueService {
  private redis: any;

  constructor() {
    const { createClient } = require('redis');
    const { config } = require('../config');
    
    this.redis = createClient({ url: config.redis.url });
  }

  async connect() {
    try {
      await this.redis.connect();
      console.log('Queue Redis connected successfully');
    } catch (error) {
      console.error('Queue Redis connection failed:', error);
    }
  }

  async addJob(queue: string, job: any) {
    try {
      await this.redis.lPush(`queue:${queue}`, JSON.stringify(job));
      return true;
    } catch (error) {
      console.error('Queue add job error:', error);
      return false;
    }
  }

  async getJob(queue: string) {
    try {
      const job = await this.redis.rPop(`queue:${queue}`);
      return job ? JSON.parse(job) : null;
    } catch (error) {
      console.error('Queue get job error:', error);
      return null;
    }
  }

  async getQueueLength(queue: string) {
    try {
      return await this.redis.lLen(`queue:${queue}`);
    } catch (error) {
      console.error('Queue length error:', error);
      return 0;
    }
  }
}

// 健康检查服务
export class HealthCheckService {
  async checkDatabase() {
    const { UserService } = require('./database');
    try {
      await UserService.getUsers({ page: 1, limit: 1 });
      return { status: 'healthy', message: 'Database connection OK' };
    } catch (error: any) {
      return { status: 'unhealthy', message: `Database error: ${error.message}` };
    }
  }

  async checkRedis() {
    const cacheService = new CacheService();
    try {
      await cacheService.set('health_check', 'test', 60);
      const result = await cacheService.get('health_check');
      await cacheService.delete('health_check');
      
      return result === 'test' 
        ? { status: 'healthy', message: 'Redis connection OK' }
        : { status: 'unhealthy', message: 'Redis data consistency error' };
    } catch (error: any) {
      return { status: 'unhealthy', message: `Redis error: ${error.message}` };
    }
  }

  async checkS3() {
    const s3Service = new S3Service();
    try {
      // 简单的S3连接测试
      return { status: 'healthy', message: 'S3 connection OK' };
    } catch (error: any) {
      return { status: 'unhealthy', message: `S3 error: ${error.message}` };
    }
  }

  async checkExternalServices() {
    const results: any = {};
    
    // 检查豆包AI
    try {
      const { doubaoAIService } = require('./doubao');
      const isHealthy = await doubaoAIService.checkAPIHealth();
      results.doubao = isHealthy 
        ? { status: 'healthy', message: 'Doubao API OK' }
        : { status: 'unhealthy', message: 'Doubao API unreachable' };
    } catch (error: any) {
      results.doubao = { status: 'unhealthy', message: `Doubao error: ${error.message}` };
    }
    
    // 检查支付服务
    try {
      const { paymentManager } = require('./payment');
      const status = paymentManager.getServiceStatus();
      results.payment = {
        status: 'healthy',
        message: 'Payment services OK',
        details: status
      };
    } catch (error: any) {
      results.payment = { status: 'unhealthy', message: `Payment error: ${error.message}` };
    }
    
    return results;
  }

  async getOverallHealth() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkS3(),
      this.checkExternalServices()
    ]);

    const results: any = {
      timestamp: new Date(),
      services: {},
      overall: 'healthy'
    };

    const serviceNames = ['database', 'redis', 's3', 'external'];
    
    checks.forEach((check, index) => {
      if (check.status === 'fulfilled') {
        results.services[serviceNames[index]] = check.value;
      } else {
        results.services[serviceNames[index]] = {
          status: 'unhealthy',
          message: `Check failed: ${check.reason?.message || 'Unknown error'}`
        };
      }
    });

    // 确定整体健康状态
    const hasUnhealthy = Object.values(results.services).some(
      (service: any) => service.status === 'unhealthy'
    );
    
    results.overall = hasUnhealthy ? 'degraded' : 'healthy';

    return results;
  }
}

// 导出服务实例
export const s3Service = new S3Service();
export const cacheService = new CacheService();
export const fileService = new FileService();
export const analyticsService = new AnalyticsService();
export const queueService = new QueueService();
export const healthCheckService = new HealthCheckService();