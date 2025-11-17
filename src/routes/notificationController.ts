import { Router } from 'express';
import { asyncHandler } from '../middleware/error';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse, Notification } from '../types';
import { logger } from '../utils/logger';

// 创建通知路由器
const router = Router();

// 获取用户通知
export const getNotifications = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, type, isRead } = req.query;

    // 模拟通知数据
    const mockNotifications: Notification[] = [
      {
        id: '1',
        userId: req.user.id,
        type: 'order_status',
        title: '订单状态更新',
        content: '您的订单 #ORD123 已更新为"生产中"状态',
        data: { orderId: 'ORD123', status: 'in_production' },
        isRead: false,
        createdAt: new Date()
      },
      {
        id: '2',
        userId: req.user.id,
        type: 'payment',
        title: '支付成功',
        content: '您的订单 #ORD122 支付已成功',
        data: { orderId: 'ORD122', amount: 499 },
        isRead: true,
        createdAt: new Date(Date.now() - 3600000) // 1小时前
      },
      {
        id: '3',
        userId: req.user.id,
        type: 'promotion',
        title: '新品推荐',
        content: '新品上架：赛博朋克风格3D手办，首单8折优惠！',
        data: { productId: 'PROD456', discount: 0.8 },
        isRead: false,
        createdAt: new Date(Date.now() - 7200000) // 2小时前
      },
      {
        id: '4',
        userId: req.user.id,
        type: 'system',
        title: '系统维护通知',
        content: '系统将于今晚22:00-24:00进行维护升级，期间可能影响服务',
        data: { maintenanceWindow: '22:00-24:00' },
        isRead: true,
        createdAt: new Date(Date.now() - 86400000) // 1天前
      },
      {
        id: '5',
        userId: req.user.id,
        type: 'social',
        title: '新评论',
        content: '您的展示作品收到了新的评论',
        data: { itemId: 'SHOWCASE789', commentId: 'COMMENT123' },
        isRead: false,
        createdAt: new Date(Date.now() - 1800000) // 30分钟前
      }
    ];

    // 过滤通知
    let filteredNotifications = mockNotifications;

    if (type) {
      filteredNotifications = filteredNotifications.filter(n => n.type === type);
    }

    if (isRead !== undefined) {
      const isReadBool = isRead === 'true';
      filteredNotifications = filteredNotifications.filter(n => n.isRead === isReadBool);
    }

    // 分页
    const startIndex = (parseInt(page as string) - 1) * parseInt(limit as string);
    const endIndex = startIndex + parseInt(limit as string);
    const paginatedNotifications = filteredNotifications.slice(startIndex, endIndex);

    // 统计信息
    const stats = {
      total: mockNotifications.length,
      unread: mockNotifications.filter(n => !n.isRead).length,
      byType: {
        order_status: mockNotifications.filter(n => n.type === 'order_status').length,
        payment: mockNotifications.filter(n => n.type === 'payment').length,
        promotion: mockNotifications.filter(n => n.type === 'promotion').length,
        system: mockNotifications.filter(n => n.type === 'system').length,
        social: mockNotifications.filter(n => n.type === 'social').length
      }
    };

    res.json({
      success: true,
      data: paginatedNotifications,
      meta: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: filteredNotifications.length,
        totalPages: Math.ceil(filteredNotifications.length / parseInt(limit as string))
      },
      stats
    } as ApiResponse);
  })
];

// 标记通知为已读
export const markAsRead = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // 模拟标记为已读
    logger.info('Notification marked as read', { 
      notificationId: id,
      userId: req.user.id 
    });

    res.json({
      success: true,
      data: {
        message: '通知已标记为已读',
        notificationId: id
      }
    } as ApiResponse);
  })
];

// 批量标记为已读
export const markAllAsRead = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { notificationIds } = req.body;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_NOTIFICATION_IDS',
          message: '无效的通知ID列表'
        }
      } as ApiResponse);
    }

    // 模拟批量标记为已读
    logger.info('Notifications marked as read (batch)', { 
      notificationIds,
      userId: req.user.id 
    });

    res.json({
      success: true,
      data: {
        message: `已标记 ${notificationIds.length} 条通知为已读`,
        markedCount: notificationIds.length
      }
    } as ApiResponse);
  })
];

// 删除通知
export const deleteNotification = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // 模拟删除通知
    logger.info('Notification deleted', { 
      notificationId: id,
      userId: req.user.id 
    });

    res.json({
      success: true,
      data: {
        message: '通知删除成功',
        notificationId: id
      }
    } as ApiResponse);
  })
];

// 批量删除通知
export const deleteNotifications = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { notificationIds } = req.body;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_NOTIFICATION_IDS',
          message: '无效的通知ID列表'
        }
      } as ApiResponse);
    }

    // 模拟批量删除
    logger.info('Notifications deleted (batch)', { 
      notificationIds,
      userId: req.user.id 
    });

    res.json({
      success: true,
      data: {
        message: `已删除 ${notificationIds.length} 条通知`,
        deletedCount: notificationIds.length
      }
    } as ApiResponse);
  })
];

// 获取通知统计
export const getNotificationStats = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    // 模拟统计数据
    const stats = {
      total: 156,
      unread: 23,
      today: 5,
      thisWeek: 18,
      thisMonth: 45,
      byType: {
        order_status: 45,
        payment: 28,
        promotion: 32,
        system: 18,
        social: 33
      },
      recentActivity: [
        { time: '5分钟前', type: 'order_status', title: '订单状态更新' },
        { time: '1小时前', type: 'social', title: '新评论' },
        { time: '2小时前', type: 'promotion', title: '新品推荐' },
        { time: '3小时前', type: 'payment', title: '支付成功' }
      ]
    };

    res.json({
      success: true,
      data: stats
    } as ApiResponse);
  })
];

// 设置通知偏好
export const updateNotificationPreferences = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { 
      emailNotifications, 
      smsNotifications, 
      pushNotifications,
      types 
    } = req.body;

    const preferences = {
      email: {
        enabled: emailNotifications !== false,
        types: types || ['order_status', 'payment', 'system']
      },
      sms: {
        enabled: smsNotifications || false,
        types: types || ['order_status']
      },
      push: {
        enabled: pushNotifications !== false,
        types: types || ['order_status', 'social']
      },
      updatedAt: new Date().toISOString()
    };

    // 实际实现中应该保存到数据库

    logger.info('Notification preferences updated', { 
      userId: req.user.id,
      preferences 
    });

    res.json({
      success: true,
      data: preferences
    } as ApiResponse);
  })
];

// 获取通知偏好
export const getNotificationPreferences = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    // 模拟获取偏好设置
    const preferences = {
      email: {
        enabled: true,
        types: ['order_status', 'payment', 'system', 'promotion']
      },
      sms: {
        enabled: false,
        types: ['order_status']
      },
      push: {
        enabled: true,
        types: ['order_status', 'social']
      }
    };

    res.json({
      success: true,
      data: preferences
    } as ApiResponse);
  })
];

// 获取未读通知数量
export const getUnreadCount = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    // 模拟未读数量
    const unreadCount = 23;

    res.json({
      success: true,
      data: {
        unreadCount,
        lastUpdated: new Date().toISOString()
      }
    } as ApiResponse);
  })
];

// 清除所有通知
export const clearAllNotifications = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { type, olderThan } = req.body;

    let message = '所有通知已清除';
    let clearedCount = 156; // 模拟清除的数量

    if (type) {
      message = `${type}类型的通知已清除`;
    }

    if (olderThan) {
      message = `${olderThan}之前的通知已清除`;
      clearedCount = 45; // 模拟清除的数量
    }

    logger.info('All notifications cleared', { 
      userId: req.user.id,
      type,
      olderThan,
      clearedCount 
    });

    res.json({
      success: true,
      data: {
        message,
        clearedCount
      }
    } as ApiResponse);
  })
];

// 模拟发送测试通知
export const sendTestNotification = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { type = 'system', title, content } = req.body;

    const testNotification = {
      id: `test_${Date.now()}`,
      userId: req.user.id,
      type,
      title: title || '测试通知',
      content: content || '这是一条测试通知消息',
      isRead: false,
      createdAt: new Date(),
      isTest: true
    };

    logger.info('Test notification sent', { 
      userId: req.user.id,
      type,
      notificationId: testNotification.id 
    });

    res.json({
      success: true,
      data: testNotification
    } as ApiResponse);
  })
];

// 通知控制器
export const notificationController = {
  // 路由
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteNotifications,
  getNotificationStats,
  updateNotificationPreferences,
  getNotificationPreferences,
  getUnreadCount,
  clearAllNotifications,
  sendTestNotification,
  
  // 中间件
  requireAuth: authenticateToken
};

export default router;