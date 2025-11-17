import { Router } from 'express';
import { paymentManager } from '../services/payment';
import { OrderService, UserService } from '../services/database';
import { asyncHandler } from '../middleware/error';
import { validateRequest } from '../middleware/validation';
import { authenticateToken, requireRole } from '../middleware/auth';
import { ApiResponse, PaymentRequest } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';

// 创建支付路由器
const router = Router();

// 创建支付
export const createPayment = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { orderId, method, returnUrl, cancelUrl } = req.body;

    // 验证订单
    const order = await OrderService.getOrderById(orderId);
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
    if (order.userId !== req.user.id && !['admin', 'superadmin'].includes(req.user.level)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: '无权为此订单创建支付'
        }
      } as ApiResponse);
    }

    // 检查订单状态
    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ORDER_STATUS',
          message: '订单状态不允许创建支付'
        }
      } as ApiResponse);
    }

    // 获取支付网关
    const gateway = paymentManager.getSupportedMethods().includes(method) ? method : 'stripe';
    
    const paymentResult = await paymentManager.createPayment(
      gateway,
      order,
      returnUrl || `${config.frontendUrl}/orders/${orderId}/payment/success`,
      cancelUrl || `${config.frontendUrl}/orders/${orderId}/payment/cancel`
    );

    if (!paymentResult.success) {
      return res.status(500).json(paymentResult);
    }

    logger.info('Payment created', { 
      orderId, 
      method: gateway,
      paymentId: paymentResult.data?.paymentId || paymentResult.data?.sessionId,
      userId: req.user.id 
    });

    res.json(paymentResult);
  })
];

// 验证支付
export const verifyPayment = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { method, orderId } = req.query;

    if (!method) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_PAYMENT_METHOD',
          message: '支付方式参数缺失'
        }
      } as ApiResponse);
    }

    // 验证订单
    const order = await OrderService.getOrderById(orderId as string);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: '订单不存在'
        }
      } as ApiResponse);
    }

    // 检查权限
    if (order.userId !== req.user.id && !['admin', 'superadmin'].includes(req.user.level)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: '无权验证此订单的支付'
        }
      } as ApiResponse);
    }

    const result = await paymentManager.verifyPayment(method as string, id);

    if (result.success && result.data) {
      // 如果支付成功，更新订单状态
      if (result.data.success && result.data.status === 'completed') {
        await OrderService.updateOrderStatus(orderId as string, 'confirmed', '支付验证成功');
        
        // 发送支付成功通知
        const user = await UserService.getUserById(order.userId);
        if (user?.email) {
          // 发送支付成功邮件
          // await notificationService.sendPaymentSuccess(order, user.email);
        }
      }
    }

    logger.info('Payment verified', { 
      orderId, 
      method,
      paymentId: id,
      success: result.success,
      userId: req.user.id 
    });

    res.json(result);
  })
];

// Stripe Webhook处理
export const handleStripeWebhook = [
  asyncHandler(async (req, res) => {
    const signature = req.headers['stripe-signature'] as string;
    
    try {
      const result = await paymentManager.handleWebhook('stripe', req.body, signature);
      
      if (result.success) {
        const { type, data } = result.data;
        
        if (type === 'checkout.session.completed') {
          const orderId = data.metadata?.orderId;
          if (orderId) {
            await OrderService.updateOrderStatus(orderId, 'confirmed', 'Stripe支付完成');
            
            logger.info('Order confirmed via Stripe webhook', { orderId });
          }
        }
      }

      res.json(result);
    } catch (error) {
      logger.error('Stripe webhook error', { error });
      res.status(400).json({
        success: false,
        error: {
          code: 'WEBHOOK_ERROR',
          message: 'Webhook处理失败'
        }
      } as ApiResponse);
    }
  })
];

// PayPal Webhook处理
export const handlePayPalWebhook = [
  asyncHandler(async (req, res) => {
    const signature = req.headers['paypal-transmission-sig'] as string;
    
    try {
      const result = await paymentManager.handleWebhook('paypal', req.body, signature);
      
      if (result.success) {
        const { event_type, resource } = result.data;
        
        if (event_type === 'PAYMENT.SALE.COMPLETED') {
          const orderId = resource.custom;
          if (orderId) {
            await OrderService.updateOrderStatus(orderId, 'confirmed', 'PayPal支付完成');
            
            logger.info('Order confirmed via PayPal webhook', { orderId });
          }
        }
      }

      res.json(result);
    } catch (error) {
      logger.error('PayPal webhook error', { error });
      res.status(400).json({
        success: false,
        error: {
          code: 'WEBHOOK_ERROR',
          message: 'PayPal webhook处理失败'
        }
      } as ApiResponse);
    }
  })
];

// 微信支付Webhook处理
export const handleWeChatWebhook = [
  asyncHandler(async (req, res) => {
    try {
      const result = await paymentManager.handleWebhook('wechat', req.body, '');
      
      if (result.success) {
        const { out_trade_no, transaction_id } = result.data;
        
        if (out_trade_no) {
          await OrderService.updateOrderStatus(out_trade_no, 'confirmed', '微信支付完成');
          
          logger.info('Order confirmed via WeChat webhook', { 
            orderId: out_trade_no,
            transactionId: transaction_id 
          });
        }
      }

      res.json(result);
    } catch (error) {
      logger.error('WeChat webhook error', { error });
      res.status(400).json({
        success: false,
        error: {
          code: 'WEBHOOK_ERROR',
          message: '微信支付webhook处理失败'
        }
      } as ApiResponse);
    }
  })
];

// 支付宝Webhook处理
export const handleAlipayWebhook = [
  asyncHandler(async (req, res) => {
    try {
      const result = await paymentManager.handleWebhook('alipay', req.body, '');
      
      if (result.success) {
        const { out_trade_no, trade_no } = result.data;
        
        if (out_trade_no) {
          await OrderService.updateOrderStatus(out_trade_no, 'confirmed', '支付宝支付完成');
          
          logger.info('Order confirmed via Alipay webhook', { 
            orderId: out_trade_no,
            tradeNo: trade_no 
          });
        }
      }

      res.json(result);
    } catch (error) {
      logger.error('Alipay webhook error', { error });
      res.status(400).json({
        success: false,
        error: {
          code: 'WEBHOOK_ERROR',
          message: '支付宝webhook处理失败'
        }
      } as ApiResponse);
    }
  })
];

// 退款
export const refundPayment = [
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { method, amount, reason } = req.body;

    if (!method) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_PAYMENT_METHOD',
          message: '支付方式参数缺失'
        }
      } as ApiResponse);
    }

    const result = await paymentManager.refundPayment(method, id, amount);

    if (result.success) {
      // 记录退款原因等操作
      logger.info('Payment refunded', { 
        paymentId: id, 
        method,
        amount,
        reason,
        adminId: req.user.id 
      });
    }

    res.json(result);
  })
];

// 获取支付方式
export const getPaymentMethods = [
  asyncHandler(async (req, res) => {
    const methods = paymentManager.getSupportedMethods();
    const status = paymentManager.getServiceStatus();

    const paymentMethods = methods.map(method => ({
      id: method,
      name: getPaymentMethodName(method),
      enabled: status[method] || false,
      fees: getPaymentMethodFees(method),
      description: getPaymentMethodDescription(method)
    }));

    res.json({
      success: true,
      data: paymentMethods
    } as ApiResponse);
  })
];

// 计算支付成本
export const calculatePaymentCosts = [
  asyncHandler(async (req, res) => {
    const { amount, method } = req.query;

    if (!amount || !method) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: '金额和支付方式参数缺失'
        }
      } as ApiResponse);
    }

    const orderAmount = parseFloat(amount as string);
    const gateway = method as string;

    if (isNaN(orderAmount) || orderAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: '无效的金额'
        }
      } as ApiResponse);
    }

    const fee = paymentManager.calculateFees(orderAmount, gateway);
    const total = orderAmount + fee;

    res.json({
      success: true,
      data: {
        originalAmount: orderAmount,
        fee,
        total,
        method: gateway,
        currency: 'USD'
      }
    } as ApiResponse);
  })
];

// 获取支付方式名称
function getPaymentMethodName(method: string): string {
  const names: { [key: string]: string } = {
    'stripe': '信用卡/借记卡',
    'paypal': 'PayPal',
    'wechat': '微信支付',
    'alipay': '支付宝'
  };
  
  return names[method] || method;
}

// 获取支付方式手续费
function getPaymentMethodFees(method: string): number {
  const fees: { [key: string]: number } = {
    'stripe': 0.029,
    'paypal': 0.034,
    'wechat': 0.006,
    'alipay': 0.006
  };
  
  return fees[method] || 0.03;
}

// 获取支付方式描述
function getPaymentMethodDescription(method: string): string {
  const descriptions: { [key: string]: string } = {
    'stripe': '支持Visa、MasterCard、American Express等主要信用卡',
    'paypal': '使用您的PayPal账户安全支付',
    'wechat': '使用微信扫码支付，方便快捷',
    'alipay': '使用支付宝扫码支付，安全可靠'
  };
  
  return descriptions[method] || '';
}

// 支付控制器
export const paymentController = {
  // 路由
  createPayment,
  verifyPayment,
  handleStripeWebhook,
  handlePayPalWebhook,
  handleWeChatWebhook,
  handleAlipayWebhook,
  refundPayment,
  getPaymentMethods,
  calculatePaymentCosts,
  
  // 中间件
  requireAuth: authenticateToken,
  requireAdmin: requireRole(['admin', 'superadmin'])
};

export default router;