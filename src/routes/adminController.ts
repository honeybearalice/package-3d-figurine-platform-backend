import { Router } from 'express';
import { UserService, ProductService, OrderService } from '../services/database';
import { healthCheckService } from '../services';
import { asyncHandler } from '../middleware/error';
import { requireRole } from '../middleware/auth';
import { ApiResponse } from '../types';
import { logger } from '../utils/logger';
import { Prisma } from '@prisma/client';

// 创建管理员路由器
const router = Router();

// 获取用户列表（管理员）
export const getUsers = [
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, level, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const result = await UserService.getUsers({
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      search: search as string,
      level: level as string
    });

    res.json({
      success: true,
      data: result.users,
      meta: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages
      }
    } as ApiResponse);
  })
];

// 获取订单列表（管理员）
export const getOrders = [
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status, startDate, endDate } = req.query;

    const params: any = {
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    };

    if (status) {
      params.status = status;
    }

    const result = await OrderService.getOrders(params);

    // 如果有日期范围，进行过滤
    let filteredOrders = result.orders;
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      filteredOrders = result.orders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= start && orderDate <= end;
      });
    }

    res.json({
      success: true,
      data: filteredOrders,
      meta: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: filteredOrders.length,
        totalPages: Math.ceil(filteredOrders.length / result.pagination.limit)
      }
    } as ApiResponse);
  })
];

// 获取商品列表（管理员）
export const getProducts = [
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, category, search, isActive } = req.query;

    const result = await ProductService.getProducts({
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      category: category as string,
      search: search as string,
      isActive: isActive !== 'false'
    });

    res.json({
      success: true,
      data: result.products,
      meta: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages
      }
    } as ApiResponse);
  })
];

// 获取仪表板统计
export const getDashboardStats = [
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req, res) => {
    const { period = '30d' } = req.query;

    const now = new Date();
    let startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    // 获取各种统计数据的模拟实现
    const stats = {
      // 总体统计
      totalUsers: 1250,
      totalOrders: 856,
      totalRevenue: 125430.50,
      totalProducts: 45,
      
      // 本期统计
      periodStats: {
        newUsers: 125,
        newOrders: 89,
        revenue: 12450.75,
        avgOrderValue: 139.89
      },
      
      // 增长数据
      growth: {
        users: 12.5,
        orders: 8.3,
        revenue: 15.2,
        avgOrderValue: 6.4
      },
      
      // 订单状态分布
      orderStatusBreakdown: {
        pending: 12,
        confirmed: 25,
        in_production: 35,
        quality_check: 8,
        packaging: 5,
        shipped: 3,
        delivered: 1,
        cancelled: 0
      },
      
      // 热门商品
      topProducts: [
        { name: '经典动漫手办', sales: 45, revenue: 11250 },
        { name: '未来科技风手办', sales: 38, revenue: 9500 },
        { name: '写实风格手办', sales: 32, revenue: 8000 }
      ],
      
      // 用户等级分布
      userLevelDistribution: {
        regular: 890,
        vip: 280,
        premium: 80
      },
      
      // 趋势数据
      dailyTrends: generateDailyTrends(startDate, now)
    };

    res.json({
      success: true,
      data: stats,
      meta: {
        period,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        generatedAt: new Date().toISOString()
      }
    } as ApiResponse);
  })
];

// 获取系统设置
export const getSettings = [
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req, res) => {
    const settings = {
      // 业务设置
      business: {
        estimatedCompletionDays: 25,
        maxCartItems: 100,
        cartExpiryHours: 24,
        paymentTimeoutMinutes: 30,
        maxImageGenerationConcurrency: 3
      },
      
      // 价格设置
      pricing: {
        sizes: [
          { name: '15cm', price: 299 },
          { name: '20cm', price: 499 },
          { name: '30cm', price: 799 }
        ],
        accessories: [
          { name: '帽子', price: 50 },
          { name: '包包', price: 80 },
          { name: '花束', price: 60 }
        ]
      },
      
      // 系统设置
      system: {
        maintenanceMode: false,
        registrationEnabled: true,
        imageGenerationEnabled: true,
        allowGuestCheckout: false
      },
      
      // 通知设置
      notifications: {
        adminPhone: process.env.ADMIN_PHONE || '18664589852',
        adminEmail: process.env.ADMIN_EMAIL || '454757093@qq.com',
        companyName: process.env.COMPANY_NAME || 'moletech international trading Co., Ltd.'
      }
    };

    res.json({
      success: true,
      data: settings
    } as ApiResponse);
  })
];

// 更新系统设置
export const updateSettings = [
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req, res) => {
    const { section, data } = req.body;

    // 模拟更新设置
    logger.info('System settings updated', { 
      section,
      adminId: req.user.id,
      changes: Object.keys(data)
    });

    res.json({
      success: true,
      data: {
        message: '设置更新成功',
        section,
        updatedAt: new Date().toISOString()
      }
    } as ApiResponse);
  })
];

// 导出数据
export const exportData = [
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req, res) => {
    const { type, format = 'json', startDate, endDate } = req.query;

    let data: any = {};
    const dateRange = { startDate, endDate };

    switch (type) {
      case 'users':
        const users = await UserService.getUsers({ page: 1, limit: 10000 });
        data = users.users;
        break;
        
      case 'orders':
        const orders = await OrderService.getOrders({ page: 1, limit: 10000 });
        data = orders.orders;
        break;
        
      case 'products':
        const products = await ProductService.getProducts({ page: 1, limit: 10000 });
        data = products.products;
        break;
        
      default:
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_EXPORT_TYPE',
            message: '不支持的导出类型'
          }
        } as ApiResponse);
    }

    // 过滤日期范围
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      data = data.filter((item: any) => {
        const itemDate = new Date(item.createdAt);
        return itemDate >= start && itemDate <= end;
      });
    }

    logger.info('Data exported', { 
      type,
      format,
      recordCount: data.length,
      adminId: req.user.id
    });

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${type}_export.csv`);
      res.send(convertToCSV(data));
    } else {
      res.json({
        success: true,
        data,
        meta: {
          type,
          format,
          recordCount: data.length,
          exportedAt: new Date().toISOString()
        }
      } as ApiResponse);
    }
  })
];

// 创建备份
export const createBackup = [
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req, res) => {
    const { type = 'full', includeUserData = true } = req.body;

    const backupInfo = {
      id: `backup_${Date.now()}`,
      type,
      createdAt: new Date().toISOString(),
      createdBy: req.user.id,
      size: '125MB', // 模拟大小
      status: 'completed',
      downloadUrl: `/admin/backups/download/backup_${Date.now()}.zip`
    };

    logger.info('Backup created', { 
      backupId: backupInfo.id,
      type,
      adminId: req.user.id
    });

    res.json({
      success: true,
      data: backupInfo
    } as ApiResponse);
  })
];

// 获取系统日志
export const getLogs = [
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req, res) => {
    const { level = 'info', page = 1, limit = 50, startDate, endDate } = req.query;

    // 模拟日志数据
    const mockLogs = [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        level: 'info',
        message: '用户注册成功',
        userId: 'user123',
        metadata: { email: 'user@example.com' }
      },
      {
        id: '2',
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: '支付失败',
        userId: 'user456',
        metadata: { method: 'stripe', error: 'card_declined' }
      },
      {
        id: '3',
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'AI图像生成失败',
        userId: 'user789',
        metadata: { error: 'API_TIMEOUT' }
      }
    ];

    res.json({
      success: true,
      data: mockLogs,
      meta: {
        level,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: mockLogs.length
      }
    } as ApiResponse);
  })
];

// 获取健康状态
export const getHealthStatus = [
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req, res) => {
    const healthStatus = await healthCheckService.getOverallHealth();

    res.json({
      success: true,
      data: healthStatus
    } as ApiResponse);
  })
];

// 工具函数：生成日趋势数据
function generateDailyTrends(startDate: Date, endDate: Date) {
  const trends = [];
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    trends.push({
      date: currentDate.toISOString().split('T')[0],
      users: Math.floor(Math.random() * 20) + 5,
      orders: Math.floor(Math.random() * 15) + 3,
      revenue: Math.floor(Math.random() * 2000) + 500,
      avgOrderValue: Math.floor(Math.random() * 50) + 100
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return trends;
}

// 工具函数：转换为CSV
function convertToCSV(data: any[]): string {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');
  const csvRows = data.map(row => 
    headers.map(header => {
      const value = row[header];
      return typeof value === 'string' && value.includes(',') 
        ? `"${value}"` 
        : value;
    }).join(',')
  );
  
  return [csvHeaders, ...csvRows].join('\n');
}

// 管理员控制器
export const adminController = {
  // 路由
  getUsers,
  getOrders,
  getProducts,
  getDashboardStats,
  getSettings,
  updateSettings,
  exportData,
  createBackup,
  getLogs,
  getHealthStatus,
  
  // 中间件
  requireAuth: requireRole(['admin', 'superadmin']),
  requireSuperAdmin: requireRole(['superadmin'])
};

export default router;