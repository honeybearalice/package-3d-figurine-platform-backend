import Stripe from 'stripe';
import paypal from 'paypal-rest-sdk';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
import { generateTransactionId, generateOrderNumber } from '../utils';
import { ApiResponse, PaymentResult, Order } from '../types';

// 通用支付接口
interface PaymentGateway {
  createPayment(order: Order, returnUrl: string, cancelUrl: string): Promise<ApiResponse<any>>;
  verifyPayment(paymentId: string): Promise<ApiResponse<PaymentResult>>;
  handleWebhook(payload: any, signature: string): Promise<ApiResponse<any>>;
  refundPayment(paymentId: string, amount?: number): Promise<ApiResponse<any>>;
}

// Stripe 支付服务
export class StripePaymentGateway implements PaymentGateway {
  private stripe: Stripe;

  constructor() {
    if (config.payment.stripe.secretKey) {
      this.stripe = new Stripe(config.payment.stripe.secretKey, {
        apiVersion: '2024-06-20',
      });
      logger.info('Stripe payment gateway initialized');
    } else {
      logger.warn('Stripe payment gateway not configured');
    }
  }

  async createPayment(order: Order, returnUrl: string, cancelUrl: string): Promise<ApiResponse<any>> {
    try {
      if (!this.stripe) {
        throw new Error('Stripe not configured');
      }

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: order.items.map(item => ({
          price_data: {
            currency: 'usd',
            product_data: {
              name: item.product.name,
              images: item.product.images,
              description: `3D Figurine - Size: ${item.selectedSize.name}`,
            },
            unit_amount: Math.round(item.totalPrice * 100), // 转换为分
          },
          quantity: item.quantity,
        })),
        mode: 'payment',
        success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        metadata: {
          orderId: order.id,
          userId: order.userId,
        },
        customer_email: order.userId, // 应该从用户信息获取真实邮箱
      });

      logger.info('Stripe payment session created', { 
        orderId: order.id, 
        sessionId: session.id 
      });

      return {
        success: true,
        data: {
          sessionId: session.id,
          url: session.url,
          paymentId: session.id,
        }
      };
    } catch (error) {
      logger.error('Stripe payment creation failed', { 
        orderId: order.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'STRIPE_PAYMENT_ERROR',
          message: error instanceof Error ? error.message : 'Stripe支付创建失败'
        }
      };
    }
  }

  async verifyPayment(paymentId: string): Promise<ApiResponse<PaymentResult>> {
    try {
      if (!this.stripe) {
        throw new Error('Stripe not configured');
      }

      const session = await this.stripe.checkout.sessions.retrieve(paymentId);

      if (session.payment_status === 'paid') {
        return {
          success: true,
          data: {
            success: true,
            transactionId: session.id,
            amount: (session.amount_total || 0) / 100, // 转换回元
            currency: session.currency || 'usd',
            method: 'stripe',
            status: 'completed',
            createdAt: new Date(session.created * 1000)
          }
        };
      } else {
        return {
          success: false,
          error: {
            code: 'STRIPE_PAYMENT_NOT_COMPLETED',
            message: '支付未完成'
          }
        };
      }
    } catch (error) {
      logger.error('Stripe payment verification failed', { 
        paymentId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'STRIPE_VERIFICATION_ERROR',
          message: error instanceof Error ? error.message : 'Stripe支付验证失败'
        }
      };
    }
  }

  async handleWebhook(payload: any, signature: string): Promise<ApiResponse<any>> {
    try {
      if (!this.stripe || !config.payment.stripe.webhookSecret) {
        throw new Error('Stripe webhook not configured');
      }

      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        config.payment.stripe.webhookSecret
      );

      logger.info('Stripe webhook received', { type: event.type, id: event.id });

      return {
        success: true,
        data: {
          type: event.type,
          data: event.data.object,
          id: event.id
        }
      };
    } catch (error) {
      logger.error('Stripe webhook processing failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'STRIPE_WEBHOOK_ERROR',
          message: error instanceof Error ? error.message : 'Stripe webhook处理失败'
        }
      };
    }
  }

  async refundPayment(paymentId: string, amount?: number): Promise<ApiResponse<any>> {
    try {
      if (!this.stripe) {
        throw new Error('Stripe not configured');
      }

      const refundData: any = {
        payment_intent: paymentId,
      };

      if (amount) {
        refundData.amount = Math.round(amount * 100); // 转换为分
      }

      const refund = await this.stripe.refunds.create(refundData);

      logger.info('Stripe refund processed', { 
        paymentId, 
        refundId: refund.id,
        amount: amount 
      });

      return {
        success: true,
        data: refund
      };
    } catch (error) {
      logger.error('Stripe refund failed', { 
        paymentId, 
        amount,
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'STRIPE_REFUND_ERROR',
          message: error instanceof Error ? error.message : 'Stripe退款失败'
        }
      };
    }
  }
}

// PayPal 支付服务
export class PayPalPaymentGateway implements PaymentGateway {
  private paypalConfigured: boolean = false;

  constructor() {
    if (config.payment.paypal.clientId && config.payment.paypal.clientSecret) {
      paypal.configure({
        mode: config.payment.paypal.mode || 'sandbox',
        client_id: config.payment.paypal.clientId,
        client_secret: config.payment.paypal.clientSecret,
      });
      this.paypalConfigured = true;
      logger.info('PayPal payment gateway initialized');
    } else {
      logger.warn('PayPal payment gateway not configured');
    }
  }

  async createPayment(order: Order, returnUrl: string, cancelUrl: string): Promise<ApiResponse<any>> {
    try {
      if (!this.paypalConfigured) {
        throw new Error('PayPal not configured');
      }

      const paymentData = {
        intent: 'sale',
        payer: {
          payment_method: 'paypal'
        },
        redirect_urls: {
          return_url: returnUrl,
          cancel_url: cancelUrl
        },
        transactions: [{
          item_list: {
            items: order.items.map(item => ({
              name: item.product.name,
              description: `3D Figurine - Size: ${item.selectedSize.name}`,
              quantity: item.quantity.toString(),
              price: item.totalPrice.toFixed(2),
              currency: 'USD'
            }))
          },
          amount: {
            total: order.totalAmount.toFixed(2),
            currency: 'USD'
          },
          custom: order.id
        }]
      };

      return new Promise((resolve) => {
        paypal.payment.create(paymentData, (error, payment) => {
          if (error) {
            logger.error('PayPal payment creation failed', { 
              orderId: order.id, 
              error: error.message 
            });
            resolve({
              success: false,
              error: {
                code: 'PAYPAL_PAYMENT_ERROR',
                message: error.message
              }
            });
          } else {
            logger.info('PayPal payment created', { 
              orderId: order.id, 
              paymentId: payment.id 
            });
            
            const approvalUrl = payment.links.find(link => link.rel === 'approval_url');
            
            resolve({
              success: true,
              data: {
                paymentId: payment.id,
                url: approvalUrl?.href,
                status: payment.state
              }
            });
          }
        });
      });
    } catch (error) {
      logger.error('PayPal payment creation failed', { 
        orderId: order.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'PAYPAL_PAYMENT_ERROR',
          message: error instanceof Error ? error.message : 'PayPal支付创建失败'
        }
      };
    }
  }

  async verifyPayment(paymentId: string): Promise<ApiResponse<PaymentResult>> {
    try {
      if (!this.paypalConfigured) {
        throw new Error('PayPal not configured');
      }

      return new Promise((resolve) => {
        paypal.payment.get(paymentId, (error, payment) => {
          if (error) {
            resolve({
              success: false,
              error: {
                code: 'PAYPAL_VERIFICATION_ERROR',
                message: error.message
              }
            });
          } else {
            const transaction = payment.transactions?.[0];
            const sale = transaction?.related_resources?.[0]?.sale;
            
            if (sale?.state === 'completed') {
              resolve({
                success: true,
                data: {
                  success: true,
                  transactionId: sale.id,
                  amount: parseFloat(transaction?.amount?.total || '0'),
                  currency: transaction?.amount?.currency || 'USD',
                  method: 'paypal',
                  status: sale.state,
                  createdAt: new Date(sale.create_time || Date.now())
                }
              });
            } else {
              resolve({
                success: false,
                error: {
                  code: 'PAYPAL_PAYMENT_NOT_COMPLETED',
                  message: '支付未完成'
                }
              });
            }
          }
        });
      });
    } catch (error) {
      logger.error('PayPal payment verification failed', { 
        paymentId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'PAYPAL_VERIFICATION_ERROR',
          message: error instanceof Error ? error.message : 'PayPal支付验证失败'
        }
      };
    }
  }

  async handleWebhook(payload: any, signature: string): Promise<ApiResponse<any>> {
    // PayPal webhook处理逻辑
    try {
      logger.info('PayPal webhook received', { event_type: payload.event_type });
      
      return {
        success: true,
        data: {
          event_type: payload.event_type,
          resource: payload.resource
        }
      };
    } catch (error) {
      logger.error('PayPal webhook processing failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'PAYPAL_WEBHOOK_ERROR',
          message: error instanceof Error ? error.message : 'PayPal webhook处理失败'
        }
      };
    }
  }

  async refundPayment(paymentId: string, amount?: number): Promise<ApiResponse<any>> {
    try {
      if (!this.paypalConfigured) {
        throw new Error('PayPal not configured');
      }

      return new Promise((resolve) => {
        const refundData: any = {
          amount: {
            total: amount?.toFixed(2) || undefined,
            currency: 'USD'
          }
        };

        // 这里需要先获取sale ID，然后执行退款
        // 实际实现中需要存储sale ID
        paypal.sale.refund(paymentId, refundData, (error, refund) => {
          if (error) {
            resolve({
              success: false,
              error: {
                code: 'PAYPAL_REFUND_ERROR',
                message: error.message
              }
            });
          } else {
            logger.info('PayPal refund processed', { 
              refundId: refund.id,
              amount: amount 
            });
            
            resolve({
              success: true,
              data: refund
            });
          }
        });
      });
    } catch (error) {
      logger.error('PayPal refund failed', { 
        paymentId, 
        amount,
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'PAYPAL_REFUND_ERROR',
          message: error instanceof Error ? error.message : 'PayPal退款失败'
        }
      };
    }
  }
}

// 微信支付服务（模拟实现）
export class WeChatPaymentGateway implements PaymentGateway {
  async createPayment(order: Order, returnUrl: string, cancelUrl: string): Promise<ApiResponse<any>> {
    try {
      // 模拟微信支付创建
      const transactionId = generateTransactionId();
      const qrCode = `weixin://wxpay/bizpayurl?pr=${transactionId}`;

      logger.info('WeChat payment created (simulated)', { 
        orderId: order.id, 
        transactionId 
      });

      return {
        success: true,
        data: {
          transactionId,
          qrCode,
          method: 'QR_CODE',
          status: 'PENDING'
        }
      };
    } catch (error) {
      logger.error('WeChat payment creation failed', { 
        orderId: order.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'WECHAT_PAYMENT_ERROR',
          message: error instanceof Error ? error.message : '微信支付创建失败'
        }
      };
    }
  }

  async verifyPayment(paymentId: string): Promise<ApiResponse<PaymentResult>> {
    try {
      // 模拟微信支付验证（实际需要调用微信API）
      logger.info('WeChat payment verification (simulated)', { paymentId });

      return {
        success: true,
        data: {
          success: true,
          transactionId: paymentId,
          amount: 0, // 应该从实际交易获取
          currency: 'CNY',
          method: 'wechat',
          status: 'completed',
          createdAt: new Date()
        }
      };
    } catch (error) {
      logger.error('WeChat payment verification failed', { 
        paymentId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'WECHAT_VERIFICATION_ERROR',
          message: error instanceof Error ? error.message : '微信支付验证失败'
        }
      };
    }
  }

  async handleWebhook(payload: any, signature: string): Promise<ApiResponse<any>> {
    try {
      // 验证微信支付签名和解析数据
      logger.info('WeChat webhook received (simulated)', payload);
      
      return {
        success: true,
        data: payload
      };
    } catch (error) {
      logger.error('WeChat webhook processing failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'WECHAT_WEBHOOK_ERROR',
          message: error instanceof Error ? error.message : '微信支付webhook处理失败'
        }
      };
    }
  }

  async refundPayment(paymentId: string, amount?: number): Promise<ApiResponse<any>> {
    try {
      // 模拟微信退款
      const refundId = generateTransactionId();
      
      logger.info('WeChat refund processed (simulated)', { 
        paymentId, 
        refundId,
        amount 
      });

      return {
        success: true,
        data: {
          refundId,
          amount,
          status: 'PROCESSING'
        }
      };
    } catch (error) {
      logger.error('WeChat refund failed', { 
        paymentId, 
        amount,
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'WECHAT_REFUND_ERROR',
          message: error instanceof Error ? error.message : '微信退款失败'
        }
      };
    }
  }
}

// 支付宝支付服务（模拟实现）
export class AlipayPaymentGateway implements PaymentGateway {
  async createPayment(order: Order, returnUrl: string, cancelUrl: string): Promise<ApiResponse<any>> {
    try {
      // 模拟支付宝支付创建
      const transactionId = generateTransactionId();
      const qrCode = `alipay://alipayclient/?${transactionId}`;

      logger.info('Alipay payment created (simulated)', { 
        orderId: order.id, 
        transactionId 
      });

      return {
        success: true,
        data: {
          transactionId,
          qrCode,
          method: 'QR_CODE',
          status: 'PENDING'
        }
      };
    } catch (error) {
      logger.error('Alipay payment creation failed', { 
        orderId: order.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'ALIPAY_PAYMENT_ERROR',
          message: error instanceof Error ? error.message : '支付宝支付创建失败'
        }
      };
    }
  }

  async verifyPayment(paymentId: string): Promise<ApiResponse<PaymentResult>> {
    try {
      // 模拟支付宝支付验证
      logger.info('Alipay payment verification (simulated)', { paymentId });

      return {
        success: true,
        data: {
          success: true,
          transactionId: paymentId,
          amount: 0,
          currency: 'CNY',
          method: 'alipay',
          status: 'completed',
          createdAt: new Date()
        }
      };
    } catch (error) {
      logger.error('Alipay payment verification failed', { 
        paymentId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'ALIPAY_VERIFICATION_ERROR',
          message: error instanceof Error ? error.message : '支付宝支付验证失败'
        }
      };
    }
  }

  async handleWebhook(payload: any, signature: string): Promise<ApiResponse<any>> {
    try {
      logger.info('Alipay webhook received (simulated)', payload);
      
      return {
        success: true,
        data: payload
      };
    } catch (error) {
      logger.error('Alipay webhook processing failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'ALIPAY_WEBHOOK_ERROR',
          message: error instanceof Error ? error.message : '支付宝webhook处理失败'
        }
      };
    }
  }

  async refundPayment(paymentId: string, amount?: number): Promise<ApiResponse<any>> {
    try {
      const refundId = generateTransactionId();
      
      logger.info('Alipay refund processed (simulated)', { 
        paymentId, 
        refundId,
        amount 
      });

      return {
        success: true,
        data: {
          refundId,
          amount,
          status: 'PROCESSING'
        }
      };
    } catch (error) {
      logger.error('Alipay refund failed', { 
        paymentId, 
        amount,
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        success: false,
        error: {
          code: 'ALIPAY_REFUND_ERROR',
          message: error instanceof Error ? error.message : '支付宝退款失败'
        }
      };
    }
  }
}

// 支付管理器
export class PaymentManager {
  private gateways: Map<string, PaymentGateway> = new Map();

  constructor() {
    // 注册所有支付网关
    this.gateways.set('stripe', new StripePaymentGateway());
    this.gateways.set('paypal', new PayPalPaymentGateway());
    this.gateways.set('wechat', new WeChatPaymentGateway());
    this.gateways.set('alipay', new AlipayPaymentGateway());
    
    logger.info('Payment manager initialized with gateways:', Array.from(this.gateways.keys()));
  }

  // 创建支付
  async createPayment(
    method: string, 
    order: Order, 
    returnUrl: string, 
    cancelUrl: string
  ): Promise<ApiResponse<any>> {
    const gateway = this.gateways.get(method);
    
    if (!gateway) {
      logger.error('Payment method not supported', { method });
      return {
        success: false,
        error: {
          code: 'UNSUPPORTED_PAYMENT_METHOD',
          message: `不支持的支付方式: ${method}`
        }
      };
    }

    logger.info('Creating payment', { method, orderId: order.id });
    
    return await gateway.createPayment(order, returnUrl, cancelUrl);
  }

  // 验证支付
  async verifyPayment(method: string, paymentId: string): Promise<ApiResponse<PaymentResult>> {
    const gateway = this.gateways.get(method);
    
    if (!gateway) {
      return {
        success: false,
        error: {
          code: 'UNSUPPORTED_PAYMENT_METHOD',
          message: `不支持的支付方式: ${method}`
        }
      };
    }

    logger.info('Verifying payment', { method, paymentId });
    
    return await gateway.verifyPayment(paymentId);
  }

  // 处理webhook
  async handleWebhook(
    method: string, 
    payload: any, 
    signature: string
  ): Promise<ApiResponse<any>> {
    const gateway = this.gateways.get(method);
    
    if (!gateway) {
      return {
        success: false,
        error: {
          code: 'UNSUPPORTED_PAYMENT_METHOD',
          message: `不支持的支付方式: ${method}`
        }
      };
    }

    logger.info('Processing webhook', { method });
    
    return await gateway.handleWebhook(payload, signature);
  }

  // 退款
  async refundPayment(
    method: string, 
    paymentId: string, 
    amount?: number
  ): Promise<ApiResponse<any>> {
    const gateway = this.gateways.get(method);
    
    if (!gateway) {
      return {
        success: false,
        error: {
          code: 'UNSUPPORTED_PAYMENT_METHOD',
          message: `不支持的支付方式: ${method}`
        }
      };
    }

    logger.info('Processing refund', { method, paymentId, amount });
    
    return await gateway.refundPayment(paymentId, amount);
  }

  // 获取支持的支付方式
  getSupportedMethods(): string[] {
    return Array.from(this.gateways.keys());
  }

  // 检查支付服务状态
  getServiceStatus(): { [key: string]: boolean } {
    const status: { [key: string]: boolean } = {};
    
    for (const [method, gateway] of this.gateways) {
      // 简化状态检查，实际实现中应该做更复杂的检查
      status[method] = true;
    }
    
    return status;
  }

  // 计算手续费
  calculateFees(amount: number, method: string): number {
    const feeRates: { [key: string]: number } = {
      'stripe': 0.029, // 2.9%
      'paypal': 0.034, // 3.4%
      'wechat': 0.006, // 0.6%
      'alipay': 0.006, // 0.6%
    };

    const rate = feeRates[method] || 0.03;
    return amount * rate;
  }
}

// 导出单例实例
export const paymentManager = new PaymentManager();
export const stripeGateway = new StripePaymentGateway();
export const paypalGateway = new PayPalPaymentGateway();
export const wechatGateway = new WeChatPaymentGateway();
export const alipayGateway = new AlipayPaymentGateway();

export default paymentManager;