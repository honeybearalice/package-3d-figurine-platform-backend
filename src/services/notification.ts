import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Order } from '../types';

// 邮件服务
export class EmailService {
  private transporter: nodemailer.Transporter;
  
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: false,
      auth: {
        user: config.email.smtp.user,
        pass: config.email.smtp.pass,
      },
    });

    // 验证配置
    if (!config.email.smtp.host || !config.email.smtp.user || !config.email.smtp.pass) {
      logger.warn('Email service not fully configured');
    }
  }

  /**
   * 发送订单确认邮件
   */
  async sendOrderConfirmation(order: Order, customerEmail: string): Promise<boolean> {
    try {
      const html = this.generateOrderConfirmationHTML(order);
      
      const mailOptions = {
        from: {
          name: config.email.from.name,
          address: config.email.from.email
        },
        to: customerEmail,
        subject: `订单确认 - ${order.id}`,
        html: html
      };

      await this.transporter.sendMail(mailOptions);
      
      logger.info('Order confirmation email sent', { 
        orderId: order.id, 
        email: customerEmail 
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to send order confirmation email', { 
        orderId: order.id, 
        email: customerEmail,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }

  /**
   * 发送订单状态更新邮件
   */
  async sendOrderStatusUpdate(
    order: Order, 
    customerEmail: string, 
    oldStatus: string,
    newStatus: string
  ): Promise<boolean> {
    try {
      const html = this.generateOrderStatusUpdateHTML(order, oldStatus, newStatus);
      
      const mailOptions = {
        from: {
          name: config.email.from.name,
          address: config.email.from.email
        },
        to: customerEmail,
        subject: `订单状态更新 - ${order.id}`,
        html: html
      };

      await this.transporter.sendMail(mailOptions);
      
      logger.info('Order status update email sent', { 
        orderId: order.id, 
        email: customerEmail,
        status: newStatus 
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to send order status update email', { 
        orderId: order.id, 
        email: customerEmail,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }

  /**
   * 发送发货通知邮件
   */
  async sendShippingNotification(
    order: Order, 
    customerEmail: string,
    trackingInfo: {
      carrier: string;
      trackingNumber: string;
      trackingUrl: string;
    }
  ): Promise<boolean> {
    try {
      const html = this.generateShippingNotificationHTML(order, trackingInfo);
      
      const mailOptions = {
        from: {
          name: config.email.from.name,
          address: config.email.from.email
        },
        to: customerEmail,
        subject: `订单已发货 - ${order.id}`,
        html: html
      };

      await this.transporter.sendMail(mailOptions);
      
      logger.info('Shipping notification email sent', { 
        orderId: order.id, 
        email: customerEmail,
        trackingNumber: trackingInfo.trackingNumber 
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to send shipping notification email', { 
        orderId: order.id, 
        email: customerEmail,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }

  /**
   * 发送管理员通知邮件
   */
  async sendAdminNotification(
    subject: string,
    message: string,
    orderId?: string
  ): Promise<boolean> {
    try {
      const html = this.generateAdminNotificationHTML(subject, message, orderId);
      
      const mailOptions = {
        from: {
          name: config.email.from.name,
          address: config.email.from.email
        },
        to: config.notification.adminEmail,
        subject: subject,
        html: html
      };

      await this.transporter.sendMail(mailOptions);
      
      logger.info('Admin notification email sent', { 
        subject,
        orderId,
        adminEmail: config.notification.adminEmail
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to send admin notification email', { 
        subject,
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }

  /**
   * 生成订单确认HTML
   */
  private generateOrderConfirmationHTML(order: Order): string {
    const orderDate = new Date(order.createdAt).toLocaleDateString('zh-CN');
    const estimatedDate = new Date(order.estimatedCompletionDate).toLocaleDateString('zh-CN');
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>订单确认</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #FF00E5; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .order-info { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; }
            .item { border-bottom: 1px solid #eee; padding: 10px 0; }
            .total { font-weight: bold; font-size: 18px; margin-top: 20px; }
            .footer { text-align: center; padding: 20px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 订单确认</h1>
                <p>感谢您选择 MoleTech 3D 手办定制</p>
            </div>
            
            <div class="content">
                <h2>订单信息</h2>
                <div class="order-info">
                    <p><strong>订单号:</strong> ${order.id}</p>
                    <p><strong>下单时间:</strong> ${orderDate}</p>
                    <p><strong>预计完成时间:</strong> ${estimatedDate}</p>
                    <p><strong>订单状态:</strong> ${this.getStatusText(order.status)}</p>
                </div>
                
                <h3>订单详情</h3>
                ${order.items.map(item => `
                <div class="item">
                    <p><strong>商品:</strong> ${item.product.name}</p>
                    <p><strong>数量:</strong> ${item.quantity}</p>
                    <p><strong>尺寸:</strong> ${item.selectedSize.name}</p>
                    <p><strong>小计:</strong> ¥${item.totalPrice.toFixed(2)}</p>
                </div>
                `).join('')}
                
                <div class="total">
                    <p>总计: ¥${order.totalAmount.toFixed(2)}</p>
                </div>
                
                <p>我们将在 ${estimatedDate} 前完成您的 3D 手办制作。您可以随时在网站中查看订单进度。</p>
                
                <p>如有任何问题，请联系我们的客服团队。</p>
            </div>
            
            <div class="footer">
                <p>© 2025 ${config.notification.companyName}</p>
                <p>网站: <a href="https://${config.notification.domain}">${config.notification.domain}</a></p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  /**
   * 生成订单状态更新HTML
   */
  private generateOrderStatusUpdateHTML(order: Order, oldStatus: string, newStatus: string): string {
    const updateDate = new Date().toLocaleDateString('zh-CN');
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>订单状态更新</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #00FFFF; color: black; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .status-update { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📦 订单状态更新</h1>
            </div>
            
            <div class="content">
                <h2>您的订单有新的进展</h2>
                
                <div class="status-update">
                    <p><strong>订单号:</strong> ${order.id}</p>
                    <p><strong>更新时间:</strong> ${updateDate}</p>
                    <p><strong>原状态:</strong> ${this.getStatusText(oldStatus)}</p>
                    <p><strong>新状态:</strong> <span style="color: #00FFFF; font-weight: bold;">${this.getStatusText(newStatus)}</span></p>
                </div>
                
                <p>您的 3D 手办正在精心制作中，每个阶段我们都严格把控质量。</p>
                
                <p>您可以在个人中心查看详细的制作进度和预计完成时间。</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  /**
   * 生成发货通知HTML
   */
  private generateShippingNotificationHTML(order: Order, trackingInfo: any): string {
    const shipDate = new Date().toLocaleDateString('zh-CN');
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>订单已发货</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #00FF00; color: black; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .tracking { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🚚 订单已发货</h1>
            </div>
            
            <div class="content">
                <h2>您的 3D 手办已发货！</h2>
                
                <p>您的定制 3D 手办已经制作完成并成功发货。</p>
                
                <div class="tracking">
                    <h3>快递信息</h3>
                    <p><strong>快递公司:</strong> ${trackingInfo.carrier}</p>
                    <p><strong>快递单号:</strong> ${trackingInfo.trackingNumber}</p>
                    <p><strong>发货时间:</strong> ${shipDate}</p>
                    <p><a href="${trackingInfo.trackingUrl}" style="color: #00FFFF;">点击查看物流详情</a></p>
                </div>
                
                <p>请保持手机畅通，我们的快递员将在近期送达您的手办。</p>
                
                <p>感谢您选择 MoleTech，期待您的反馈！</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  /**
   * 生成管理员通知HTML
   */
  private generateAdminNotificationHTML(subject: string, message: string, orderId?: string): string {
    const date = new Date().toLocaleDateString('zh-CN');
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>管理员通知</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #FF0000; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .alert { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #FF0000; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>⚠️ 管理员通知</h1>
            </div>
            
            <div class="content">
                <h2>${subject}</h2>
                
                <div class="alert">
                    <p><strong>时间:</strong> ${date}</p>
                    ${orderId ? `<p><strong>订单号:</strong> ${orderId}</p>` : ''}
                    <p><strong>详情:</strong></p>
                    <p>${message}</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  /**
   * 获取状态文本
   */
  private getStatusText(status: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': '待支付',
      'confirmed': '已确认',
      'design_approved': '设计已批准',
      'in_production': '生产中',
      'quality_check': '质量检查',
      'packaging': '包装中',
      'shipped': '已发货',
      'delivered': '已送达',
      'cancelled': '已取消'
    };
    
    return statusMap[status] || status;
  }

  /**
   * 验证邮件配置
   */
  isConfigured(): boolean {
    return !!(config.email.smtp.host && config.email.smtp.user && config.email.smtp.pass);
  }

  /**
   * 测试邮件连接
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.isConfigured()) {
        return false;
      }
      
      await this.transporter.verify();
      return true;
    } catch (error) {
      logger.error('Email service test failed', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}

// 短信服务
export class SMSService {
  private client: twilio.Twilio | null = null;
  
  constructor() {
    const sid = config.twilio.accountSid;
    const token = config.twilio.authToken;
    if (sid && token && sid.startsWith('AC')) {
      try {
        this.client = twilio(sid, token);
      } catch (error) {
        logger.warn('SMS service initialization failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        this.client = null;
      }
    } else {
      logger.warn('SMS service not fully configured');
    }
  }

  /**
   * 发送订单状态短信
   */
  async sendOrderStatusUpdate(
    phoneNumber: string,
    orderId: string,
    oldStatus: string,
    newStatus: string
  ): Promise<boolean> {
    if (!this.client || !config.twilio.phoneNumber) {
      logger.error('SMS service not configured');
      return false;
    }

    try {
      const statusText = this.getStatusText(newStatus);
      const message = `MoleTech: 您的订单 ${orderId} 状态已更新为「${statusText}」。预计 ${config.business.estimatedCompletionDays} 天内完成。详情请访问 ${config.notification.domain}`;

      await this.client.messages.create({
        body: message,
        from: config.twilio.phoneNumber,
        to: phoneNumber
      });

      logger.info('Order status SMS sent', { 
        orderId, 
        phoneNumber,
        status: newStatus 
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to send order status SMS', { 
        orderId, 
        phoneNumber,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }

  /**
   * 发送发货短信
   */
  async sendShippingNotification(
    phoneNumber: string,
    orderId: string,
    trackingInfo: {
      carrier: string;
      trackingNumber: string;
    }
  ): Promise<boolean> {
    if (!this.client || !config.twilio.phoneNumber) {
      logger.error('SMS service not configured');
      return false;
    }

    try {
      const message = `MoleTech: 您的订单 ${orderId} 已发货！快递: ${trackingInfo.carrier}，单号: ${trackingInfo.trackingNumber}。请保持电话畅通。详情: ${config.notification.domain}`;

      await this.client.messages.create({
        body: message,
        from: config.twilio.phoneNumber,
        to: phoneNumber
      });

      logger.info('Shipping SMS sent', { 
        orderId, 
        phoneNumber,
        trackingNumber: trackingInfo.trackingNumber
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to send shipping SMS', { 
        orderId, 
        phoneNumber,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }

  /**
   * 发送管理员短信
   */
  async sendAdminSMS(subject: string, message: string, orderId?: string): Promise<boolean> {
    if (!this.client || !config.twilio.phoneNumber) {
      logger.error('SMS service not configured');
      return false;
    }

    try {
      const fullMessage = `MoleTech Admin Alert: ${subject}${orderId ? ` (Order: ${orderId})` : ''}. ${message}`;

      await this.client.messages.create({
        body: fullMessage,
        from: config.twilio.phoneNumber,
        to: config.notification.adminPhone
      });

      logger.info('Admin SMS sent', { 
        subject,
        orderId,
        adminPhone: config.notification.adminPhone
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to send admin SMS', { 
        subject,
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }

  /**
   * 获取状态文本
   */
  private getStatusText(status: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': '待支付',
      'confirmed': '已确认',
      'design_approved': '设计已批准',
      'in_production': '生产中',
      'quality_check': '质量检查',
      'packaging': '包装中',
      'shipped': '已发货',
      'delivered': '已送达',
      'cancelled': '已取消'
    };
    
    return statusMap[status] || status;
  }

  /**
   * 验证短信配置
   */
  isConfigured(): boolean {
    return !!(config.twilio.accountSid && config.twilio.authToken && config.twilio.phoneNumber);
  }

  /**
   * 测试短信连接
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.isConfigured()) {
        return false;
      }
      
      // 简单的ping测试
      await this.client!.api.accounts(config.twilio.accountSid!).fetch();
      return true;
    } catch (error) {
      logger.error('SMS service test failed', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}

// 通知服务组合
export class NotificationService {
  private emailService: EmailService;
  private smsService: SMSService;

  constructor() {
    this.emailService = new EmailService();
    this.smsService = new SMSService();
  }

  /**
   * 发送订单确认通知
   */
  async sendOrderConfirmation(order: Order, customerEmail: string): Promise<{ email: boolean; sms: boolean }> {
    const [emailResult, smsResult] = await Promise.allSettled([
      this.emailService.sendOrderConfirmation(order, customerEmail),
      // 手机号验证和短信发送逻辑
      Promise.resolve(false) // 暂时不发送确认短信
    ]);

    return {
      email: emailResult.status === 'fulfilled' && emailResult.value,
      sms: smsResult.status === 'fulfilled' && smsResult.value
    };
  }

  /**
   * 发送订单状态更新通知
   */
  async sendOrderStatusUpdate(
    order: Order,
    customerEmail: string,
    customerPhone?: string,
    oldStatus?: string
  ): Promise<{ email: boolean; sms: boolean }> {
    const [emailResult, smsResult] = await Promise.allSettled([
      oldStatus ? this.emailService.sendOrderStatusUpdate(order, customerEmail, oldStatus, order.status) : Promise.resolve(false),
      customerPhone ? this.smsService.sendOrderStatusUpdate(customerPhone, order.id, oldStatus || '', order.status) : Promise.resolve(false)
    ]);

    return {
      email: emailResult.status === 'fulfilled' && emailResult.value,
      sms: smsResult.status === 'fulfilled' && smsResult.value
    };
  }

  /**
   * 发送发货通知
   */
  async sendShippingNotification(
    order: Order,
    customerEmail: string,
    customerPhone?: string,
    trackingInfo?: any
  ): Promise<{ email: boolean; sms: boolean }> {
    const [emailResult, smsResult] = await Promise.allSettled([
      trackingInfo ? this.emailService.sendShippingNotification(order, customerEmail, trackingInfo) : Promise.resolve(false),
      trackingInfo && customerPhone ? this.smsService.sendShippingNotification(customerPhone, order.id, trackingInfo) : Promise.resolve(false)
    ]);

    return {
      email: emailResult.status === 'fulfilled' && emailResult.value,
      sms: smsResult.status === 'fulfilled' && smsResult.value
    };
  }

  /**
   * 发送管理员通知
   */
  async sendAdminNotification(
    subject: string,
    message: string,
    orderId?: string
  ): Promise<{ email: boolean; sms: boolean }> {
    const [emailResult, smsResult] = await Promise.allSettled([
      this.emailService.sendAdminNotification(subject, message, orderId),
      this.smsService.sendAdminSMS(subject, message, orderId)
    ]);

    return {
      email: emailResult.status === 'fulfilled' && emailResult.value,
      sms: smsResult.status === 'fulfilled' && smsResult.value
    };
  }

  /**
   * 检查通知服务状态
   */
  getServiceStatus() {
    return {
      email: {
        configured: this.emailService.isConfigured(),
        healthy: false // 需要异步检查
      },
      sms: {
        configured: this.smsService.isConfigured(),
        healthy: false // 需要异步检查
      }
    };
  }
}

// 导出单例实例
export const notificationService = new NotificationService();
export const emailService = new EmailService();
export const smsService = new SMSService();

export default notificationService;