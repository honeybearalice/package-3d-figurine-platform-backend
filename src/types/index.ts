import { Prisma } from '@prisma/client';

// Prisma 生成的基础类型
export type User = Prisma.UserGetPayload<{
  include: {
    preferences: true;
    generatedImages: true;
    orders: true;
    showcaseItems: true;
    comments: true;
  };
}>;

export type Product = Prisma.ProductGetPayload<{
  include: {
    specifications: {
      include: {
        sizes: true;
      };
    };
    accessories: {
      include: {
        accessory: true;
      };
    };
  };
}>;

export type Order = Prisma.OrderGetPayload<{
  include: {
    user: true;
    items: {
      include: {
        product: true;
        image: true;
        selectedSize: true;
        selectedAccessories: {
          include: {
            accessory: true;
          };
        };
      };
    };
    shippingInfo: true;
    paymentInfo: true;
    trackingInfo: true;
    timeline: true;
  };
}>;

export type GeneratedImage = Prisma.GeneratedImageGetPayload<{
  include: {
    user: true;
    showcaseItem: true;
  };
}>;

export type ShowcaseItem = Prisma.ShowcaseItemGetPayload<{
  include: {
    user: true;
    image: true;
    comments: {
      include: {
        user: true;
      };
    };
    likes: true;
  };
}>;

// API 请求类型
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  phone?: string;
}

export interface ImageGenerationRequest {
  originalImage: string; // Base64 or URL
  style: 'realistic' | 'anime' | 'cyberpunk' | 'classic';
  profession?: string;
  customPrompt?: string;
  quality: 'low' | 'medium' | 'high';
}

export interface CreateOrderRequest {
  items: {
    productId: string;
    imageId?: string;
    quantity: number;
    selectedSizeId: string;
    selectedAccessories: {
      accessoryId: string;
      quantity: number;
      position?: string;
    }[];
    customizations: {
      type: 'text' | 'color' | 'emblem';
      value: string;
      price: number;
    }[];
  }[];
  shippingInfo: {
    recipient: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    shippingMethod: 'standard' | 'express' | 'international';
  };
  paymentMethod: 'wechat' | 'alipay' | 'stripe' | 'paypal' | 'credit_card' | 'bank_transfer';
}

export interface UpdateOrderStatusRequest {
  status: string;
  note?: string;
}

export interface UploadFileRequest {
  file: Express.Multer.File;
  folder?: string;
}

// API 响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// 业务数据类型
export interface CartItemData {
  id?: string;
  productId: string;
  imageId?: string;
  quantity: number;
  selectedSizeId: string;
  selectedAccessories: {
    accessoryId: string;
    quantity: number;
    position?: string;
  }[];
  customizations: {
    type: 'text' | 'color' | 'emblem';
    value: string;
    price: number;
  }[];
}

export interface OrderTimeline {
  id: string;
  status: string;
  title: string;
  description?: string;
  completed: boolean;
  completedAt?: Date;
  createdAt: Date;
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  createdAt: Date;
}

export interface NotificationData {
  id: string;
  userId: string;
  type: 'order_status' | 'payment' | 'promotion' | 'system' | 'social';
  title: string;
  content: string;
  data?: any;
  isRead: boolean;
  createdAt: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  userId?: string;
  agentId?: string;
  content: string;
  type: 'text' | 'image' | 'file';
  isFromUser: boolean;
  timestamp: Date;
}

// 验证模式
export const ValidationSchemas = {
  user: {
    register: {
      username: 'string|min:3|max:30|required',
      email: 'string|email|required',
      password: 'string|min:8|required',
      phone: 'string|optional'
    },
    login: {
      email: 'string|email|required',
      password: 'string|required'
    },
    update: {
      username: 'string|min:3|max:30|optional',
      email: 'string|email|optional',
      phone: 'string|optional',
      avatar: 'string|url|optional'
    }
  },
  order: {
    create: {
      items: 'array|min:1|required',
      'items.*.productId': 'string|required',
      'items.*.quantity': 'number|min:1|required',
      'items.*.selectedSizeId': 'string|required',
      'items.*.selectedAccessories': 'array|optional',
      'items.*.customizations': 'array|optional',
      shippingInfo: 'object|required',
      'shippingInfo.recipient': 'string|required',
      'shippingInfo.phone': 'string|required',
      'shippingInfo.address': 'string|required',
      'shippingInfo.city': 'string|required',
      'shippingInfo.state': 'string|required',
      'shippingInfo.country': 'string|required',
      'shippingInfo.postalCode': 'string|required',
      'shippingInfo.shippingMethod': 'string|in:standard,express,international|required',
      paymentMethod: 'string|in:wechat,alipay,stripe,paypal,credit_card,bank_transfer|required'
    }
  },
  product: {
    create: {
      name: 'string|min:1|max:255|required',
      description: 'string|required',
      basePrice: 'number|min:0|required',
      category: 'string|in:figurine,accessory,model|required',
      isCustomizable: 'boolean|required'
    }
  }
};

// 枚举类型
export enum UserLevel {
  REGULAR = 'regular',
  VIP = 'vip',
  PREMIUM = 'premium'
}

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  DESIGN_APPROVED = 'design_approved',
  IN_PRODUCTION = 'in_production',
  QUALITY_CHECK = 'quality_check',
  PACKAGING = 'packaging',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled'
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded'
}

export enum PaymentMethod {
  WECHAT = 'wechat',
  ALIPAY = 'alipay',
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
  CREDIT_CARD = 'credit_card',
  BANK_TRANSFER = 'bank_transfer'
}

export enum ArtStyle {
  REALISTIC = 'realistic',
  ANIME = 'anime',
  CYBERPUNK = 'cyberpunk',
  CLASSIC = 'classic'
}

export enum Material {
  PLA = 'PLA',
  ABS = 'ABS',
  RESIN = 'Resin',
  METAL = 'Metal',
  WOOD = 'Wood'
}

export enum AccessoryCategory {
  HEADWEAR = 'headwear',
  CLOTHING = 'clothing',
  PROPS = 'props',
  BASE = 'base',
  DECORATION = 'decoration',
  TECH = 'tech'
}

export enum NotificationType {
  ORDER_STATUS = 'order_status',
  PAYMENT = 'payment',
  PROMOTION = 'promotion',
  SYSTEM = 'system',
  SOCIAL = 'social'
}

export enum ChatSessionStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  ENDED = 'ended'
}

// 工具类型
export type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>;
};

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type Required<T> = T extends object ? { [P in keyof T]-?: T[P] } : T;