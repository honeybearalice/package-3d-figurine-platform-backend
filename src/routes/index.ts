import { Router } from 'express';
import * as userController from '../controllers/userController';
import * as orderController from '../controllers/orderController';
import * as imageController from '../controllers/imageController';
import * as cartController from '../controllers/cartController';
import { startWeChatAuth, startQQAuth, oauthCallback } from '../controllers/socialAuthController';
import { productController } from './productController';
import { uploadImage } from './uploadController';
import { paymentController } from './paymentController';
import { showcaseController } from './showcaseController';
import { adminController } from './adminController';
import { notificationController } from './notificationController';
import { validateQuery, ValidationSchemas } from '../middleware/validation';
import { authenticateToken } from '../middleware/auth';

// 创建主路由器
const router = Router();

// 健康检查路由
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

// 用户认证路由
router.post('/auth/register', userController.register);
router.post('/auth/login', userController.login);
router.post('/auth/refresh-token', userController.refreshToken);
router.post('/auth/logout', authenticateToken, userController.logout);

// 社交登录路由
router.get('/auth/wechat', startWeChatAuth);
router.get('/auth/qq', startQQAuth);
router.get('/auth/:provider/callback', oauthCallback);

// 用户相关路由
router.get('/user/profile', authenticateToken, userController.getProfile);
router.put('/user/profile', authenticateToken, userController.updateProfile);
router.put('/user/preferences', authenticateToken, userController.updatePreferences);
router.put('/user/password', authenticateToken, userController.changePassword);
router.get('/user/stats', authenticateToken, userController.getUserStats);

// 用户验证路由
router.get('/auth/check-username', userController.checkUsername);
router.get('/auth/check-email', userController.checkEmail);

// 购物车路由
router.get('/cart', authenticateToken, cartController.getCart);
router.post('/cart', authenticateToken, cartController.addToCart);
router.put('/cart/:id', authenticateToken, cartController.updateCartItem);
router.delete('/cart/:id', authenticateToken, cartController.removeFromCart);
router.delete('/cart', authenticateToken, cartController.clearCart);
router.post('/cart/batch-add', authenticateToken, cartController.batchAddToCart);
router.get('/cart/:id/details', authenticateToken, cartController.getCartItemDetails);
router.get('/cart/validate', authenticateToken, cartController.validateCart);
router.get('/cart/stats', authenticateToken, cartController.getCartStats);

// 订单路由
router.post('/orders', authenticateToken, orderController.createOrder);
router.get('/orders', authenticateToken, orderController.getOrders);
router.get('/orders/:id', authenticateToken, orderController.getOrder);
router.put('/orders/:id/status', authenticateToken, orderController.updateOrderStatus);
router.put('/orders/:id/cancel', authenticateToken, orderController.cancelOrder);
router.get('/orders/stats/user', authenticateToken, orderController.getUserOrderStats);
router.get('/orders/stats', authenticateToken, orderController.getOrderStats);
router.put('/orders/batch-update', authenticateToken, orderController.batchUpdateOrderStatus);
router.get('/orders/search', authenticateToken, orderController.searchOrders);
router.get('/orders/export', authenticateToken, orderController.exportOrders);

// 图像生成路由
router.post('/images/generate', authenticateToken, imageController.generateImage);
router.post('/images/batch-generate', authenticateToken, imageController.batchGenerateImages);
router.get('/images/my-images', authenticateToken, imageController.getUserGeneratedImages);
router.get('/images/public', imageController.getPublicGeneratedImages);
router.patch('/images/:id/privacy', authenticateToken, imageController.toggleImagePrivacy);
router.delete('/images/:id', authenticateToken, imageController.deleteGeneratedImage);
router.get('/images/stats', authenticateToken, imageController.getGenerationStats);
router.get('/images/ai-status', imageController.getAIStatus);
router.post('/images/:id/regenerate', authenticateToken, imageController.regenerateImage);

// 上传路由
router.post('/uploads', ...uploadImage);

// 商品路由
router.get('/products', productController.getProducts);
router.get('/products/:id', productController.getProduct);
router.post('/products', authenticateToken, productController.createProduct);
router.put('/products/:id', authenticateToken, productController.updateProduct);
router.delete('/products/:id', authenticateToken, productController.deleteProduct);
router.get('/products/search', productController.searchProducts);
router.get('/products/categories', productController.getCategories);
router.get('/products/popular', productController.getPopularProducts);

// 展示池路由
router.get('/showcase', showcaseController.getShowcaseItems);
router.get('/showcase/:id', showcaseController.getShowcaseItem);
router.post('/showcase', authenticateToken, showcaseController.createShowcaseItem);
router.put('/showcase/:id', authenticateToken, showcaseController.updateShowcaseItem);
router.delete('/showcase/:id', authenticateToken, showcaseController.deleteShowcaseItem);
router.post('/showcase/:id/like', authenticateToken, showcaseController.likeShowcaseItem);
router.post('/showcase/:id/comment', authenticateToken, showcaseController.addComment);
router.get('/showcase/:id/comments', showcaseController.getComments);
router.delete('/showcase/:id/comments/:commentId', authenticateToken, showcaseController.deleteComment);

// 支付路由
router.post('/payments/create', authenticateToken, paymentController.createPayment);
router.get('/payments/verify/:id', authenticateToken, paymentController.verifyPayment);
router.post('/payments/webhook/stripe', paymentController.handleStripeWebhook);
router.post('/payments/webhook/paypal', paymentController.handlePayPalWebhook);
router.post('/payments/webhook/wechat', paymentController.handleWeChatWebhook);
router.post('/payments/webhook/alipay', paymentController.handleAlipayWebhook);
router.post('/payments/:id/refund', authenticateToken, paymentController.refundPayment);
router.get('/payments/methods', paymentController.getPaymentMethods);
router.get('/payments/costs', paymentController.calculatePaymentCosts);

// 通知路由
router.get('/notifications', authenticateToken, notificationController.getNotifications);
router.put('/notifications/:id/read', authenticateToken, notificationController.markAsRead);
router.put('/notifications/read-all', authenticateToken, notificationController.markAllAsRead);
router.delete('/notifications/:id', authenticateToken, notificationController.deleteNotification);

// 管理员路由
router.get('/admin/users', authenticateToken, adminController.getUsers);
router.get('/admin/orders', authenticateToken, adminController.getOrders);
router.get('/admin/products', authenticateToken, adminController.getProducts);
router.get('/admin/dashboard', authenticateToken, adminController.getDashboardStats);
router.get('/admin/settings', authenticateToken, adminController.getSettings);
router.put('/admin/settings', authenticateToken, adminController.updateSettings);
router.post('/admin/export-data', authenticateToken, adminController.exportData);
router.post('/admin/backup', authenticateToken, adminController.createBackup);
router.get('/admin/logs', authenticateToken, adminController.getLogs);
router.get('/admin/health', adminController.getHealthStatus);

// 通用查询验证路由
router.get('/common/search', validateQuery(ValidationSchemas.search), (req, res) => {
  // 通用搜索逻辑
  res.json({
    success: true,
    data: {
      message: 'Search functionality not implemented yet',
      query: req.query
    }
  });
});

export default router;