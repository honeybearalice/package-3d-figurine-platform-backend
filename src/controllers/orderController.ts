import { Request, Response } from 'express';
import { OrderService, CartService, UserService } from '../services/database';
import { addDays } from '../utils';
import { ApiResponse, Order, CreateOrderRequest } from '../types';
import { logger } from '../utils/logger';
import { validateRequest, ValidationSchemas } from '../middleware/validation';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler, NotFoundError, AppError } from '../middleware/error';
import { notificationService } from '../services/notification';
import { config } from '../config';

// 创建订单
export const createOrder = [
  authenticateToken,
  validateRequest('order', 'create'),
  asyncHandler(async (req: Request, res: Response) => {
    const orderData: CreateOrderRequest = req.body;

    // 获取用户购物车
    const cart = await CartService.getUserCart(req.user.id);
    
    if (cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EMPTY_CART',
          message: '购物车为空'
        }
      } as ApiResponse);
    }

    // 验证购物车商品与订单数据匹配
    const orderItems = orderData.items;
    for (const item of orderItems) {
      const cartItem = cart.items.find(ci => ci.productId === item.productId);
      if (!cartItem) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CART_ITEM',
            message: `商品 ${item.productId} 不在购物车中`
          }
        } as ApiResponse);
      }
    }

    // 计算订单总价
    const totalAmount = orderItems.reduce((sum, item) => {
      return sum + item.quantity * (item.customizations?.reduce((csum, c) => csum + c.price, 0) || 0);
    }, 0);

    // 预计完成时间
    const estimatedCompletionDate = addDays(new Date(), config.business.estimatedCompletionDays);

    // 创建订单
    const order = await OrderService.createOrder({
      userId: req.user.id,
      items: orderItems,
      totalAmount,
      estimatedCompletionDate,
      notes: orderData.notes
    });

    // 发送订单确认通知
    const user = await UserService.getUserById(req.user.id);
    if (user?.email) {
      await notificationService.sendOrderConfirmation(order, user.email);
    }

    // 清空购物车
    await CartService.clearCart(req.user.id);

    logger.info('Order created successfully', { 
      orderId: order.id, 
      userId: req.user.id,
      totalAmount: order.totalAmount 
    });

    res.status(201).json({
      success: true,
      data: order
    } as ApiResponse);
  })
];

// 获取订单列表
export const getOrders = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, status } = req.query;

    const params: any = {
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    };

    // 如果不是管理员，只能查看自己的订单
    if (!['admin', 'superadmin'].includes(req.user.level)) {
      params.userId = req.user.id;
    } else {
      // 管理员可以按状态过滤
      if (status) {
        params.status = status;
      }
    }

    const result = await OrderService.getOrders(params);

    res.json({
      success: true,
      data: result.orders,
      meta: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages
      }
    } as ApiResponse);
  })
];

// 获取订单详情
export const getOrder = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const order = await OrderService.getOrderById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: '订单不存在'
        }
      } as ApiResponse);
    }

    // 权限检查：非管理员只能查看自己的订单
    if (order.userId !== req.user.id && !['admin', 'superadmin'].includes(req.user.level)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: '无权访问此订单'
        }
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: order
    } as ApiResponse);
  })
];

// 更新订单状态（管理员）
export const updateOrderStatus = [
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  validateRequest('order', 'updateStatus'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, note } = req.body;

    const order = await OrderService.getOrderById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: '订单不存在'
        }
      } as ApiResponse);
    }

    const oldStatus = order.status;
    const updatedOrder = await OrderService.updateOrderStatus(id, status, note);

    // 发送状态更新通知
    const user = await UserService.getUserById(order.userId);
    if (user?.email) {
      await notificationService.sendOrderStatusUpdate(
        order, 
        user.email, 
        user.phone,
        oldStatus
      );
    }

    logger.info('Order status updated', { 
      orderId: id, 
      oldStatus, 
      newStatus: status,
      adminId: req.user.id 
    });

    res.json({
      success: true,
      data: updatedOrder
    } as ApiResponse);
  })
];

// 用户取消订单
export const cancelOrder = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await OrderService.getOrderById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: '订单不存在'
        }
      } as ApiResponse);
    }

    // 检查订单是否属于当前用户
    if (order.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: '无权操作此订单'
        }
      } as ApiResponse);
    }

    // 检查订单状态，只有待支付和已确认的订单可以取消
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CANNOT_CANCEL_ORDER',
          message: '当前订单状态不允许取消'
        }
      } as ApiResponse);
    }

    const updatedOrder = await OrderService.updateOrderStatus(
      id, 
      'cancelled', 
      reason || '用户主动取消'
    );

    // 发送取消通知
    const user = await UserService.getUserById(order.userId);
    if (user?.email) {
      await notificationService.sendOrderStatusUpdate(
        order, 
        user.email, 
        user.phone,
        order.status
      );
    }

    logger.info('Order cancelled by user', { 
      orderId: id, 
      userId: req.user.id,
      reason: reason || '用户主动取消' 
    });

    res.json({
      success: true,
      data: updatedOrder
    } as ApiResponse);
  })
];

// 获取用户订单统计
export const getUserOrderStats = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const orders = await OrderService.getOrders({ userId: req.user.id, limit: 1000 });

    const stats = {
      total: orders.pagination.total,
      byStatus: {
        pending: 0,
        confirmed: 0,
        in_production: 0,
        quality_check: 0,
        packaging: 0,
        shipped: 0,
        delivered: 0,
        cancelled: 0
      },
      totalSpent: 0,
      averageOrderValue: 0
    };

    orders.orders.forEach(order => {
      stats.byStatus[order.status as keyof typeof stats.byStatus]++;
      stats.totalSpent += order.totalAmount;
    });

    stats.averageOrderValue = stats.total > 0 ? stats.totalSpent / stats.total : 0;

    res.json({
      success: true,
      data: stats
    } as ApiResponse);
  })
];

// 管理员获取订单统计
export const getOrderStats = [
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req: Request, res: Response) => {
    const { period = '30d' } = req.query; // 支持 7d, 30d, 90d, 1y

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
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // 获取指定时间范围内的订单
    const allOrders = await OrderService.getOrders({ limit: 10000 });
    const periodOrders = allOrders.orders.filter(order => 
      new Date(order.createdAt) >= startDate
    );

    const stats = {
      totalOrders: periodOrders.length,
      totalRevenue: periodOrders.reduce((sum, order) => sum + order.totalAmount, 0),
      averageOrderValue: 0,
      ordersByStatus: {
        pending: 0,
        confirmed: 0,
        in_production: 0,
        quality_check: 0,
        packaging: 0,
        shipped: 0,
        delivered: 0,
        cancelled: 0
      },
      ordersByDay: {} as { [key: string]: number },
      topProducts: {} as { [key: string]: number }
    };

    stats.averageOrderValue = stats.totalOrders > 0 ? stats.totalRevenue / stats.totalOrders : 0;

    // 统计各状态订单数
    periodOrders.forEach(order => {
      stats.ordersByStatus[order.status as keyof typeof stats.ordersByStatus]++;
    });

    // 统计每日订单数
    periodOrders.forEach(order => {
      const day = new Date(order.createdAt).toISOString().split('T')[0];
      stats.ordersByDay[day] = (stats.ordersByDay[day] || 0) + 1;
    });

    // 统计热门产品
    periodOrders.forEach(order => {
      order.items.forEach(item => {
        const productName = item.product.name;
        stats.topProducts[productName] = (stats.topProducts[productName] || 0) + item.quantity;
      });
    });

    res.json({
      success: true,
      data: {
        ...stats,
        period,
        startDate: startDate.toISOString(),
        endDate: now.toISOString()
      }
    } as ApiResponse);
  })
];

// 批量更新订单状态（管理员）
export const batchUpdateOrderStatus = [
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req: Request, res: Response) => {
    const { orderIds, status, note } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ORDER_IDS',
          message: '订单ID列表无效'
        }
      } as ApiResponse);
    }

    const results = {
      success: [] as string[],
      failed: [] as { orderId: string; error: string }[]
    };

    for (const orderId of orderIds) {
      try {
        await OrderService.updateOrderStatus(orderId, status, note);
        results.success.push(orderId);
      } catch (error) {
        results.failed.push({
          orderId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.info('Batch order status update', { 
      adminId: req.user.id,
      status,
      total: orderIds.length,
      success: results.success.length,
      failed: results.failed.length
    });

    res.json({
      success: true,
      data: results,
      meta: {
        total: orderIds.length,
        successCount: results.success.length,
        failedCount: results.failed.length
      }
    } as ApiResponse);
  })
];

// 搜索订单（管理员）
export const searchOrders = [
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req: Request, res: Response) => {
    const { 
      q, 
      page = 1, 
      limit = 20, 
      status, 
      startDate, 
      endDate 
    } = req.query;

    const params: any = {
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    };

    if (status) {
      params.status = status;
    }

    // 搜索功能（这里简化实现，实际应该使用更复杂的搜索逻辑）
    if (q) {
      // 可以根据订单号、用户邮箱、用户名等进行搜索
      params.search = q as string;
    }

    const result = await OrderService.getOrders(params);

    // 如果提供了日期范围，进行过滤
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

// 导出订单数据（管理员）
export const exportOrders = [
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req: Request, res: Response) => {
    const { format = 'json', status, startDate, endDate } = req.query;

    const allOrders = await OrderService.getOrders({ limit: 10000 });
    let orders = allOrders.orders;

    // 过滤
    if (status) {
      orders = orders.filter(order => order.status === status);
    }

    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      orders = orders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= start && orderDate <= end;
      });
    }

    if (format === 'csv') {
      // 返回CSV格式（简化实现）
      const csvHeader = 'Order ID,User,Status,Total Amount,Created At,Estimated Completion\n';
      const csvData = orders.map(order => 
        `${order.id},${order.user?.email || 'Unknown'},${order.status},${order.totalAmount},${order.createdAt},${order.estimatedCompletionDate}`
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
      res.send(csvHeader + csvData);
    } else {
      // 返回JSON格式
      res.json({
        success: true,
        data: orders,
        meta: {
          total: orders.length,
          exportedAt: new Date().toISOString()
        }
      } as ApiResponse);
    }
  })
];

// 导出控制器函数
export default {
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
  cancelOrder,
  getUserOrderStats,
  getOrderStats,
  batchUpdateOrderStatus,
  searchOrders,
  exportOrders
};