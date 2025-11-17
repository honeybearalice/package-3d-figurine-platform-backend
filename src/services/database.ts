import prisma from '../config/database';
import { User, Product, Order, GeneratedImage, ShowcaseItem } from '../types';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

// 用户服务
export class UserService {
  // 创建用户
  static async createUser(data: {
    username: string;
    email: string;
    password: string;
    phone?: string;
  }) {
    try {
      const user = await prisma.user.create({
        data: {
          ...data,
          preferences: {
            create: {
              defaultStyle: 'realistic',
              preferredSize: '20cm',
              favoriteAccessories: [],
              notifications: {
                email: true,
                sms: true,
                push: true
              }
            }
          }
        },
        include: {
          preferences: true
        }
      });
      
      logger.info('User created successfully', { userId: user.id, email: user.email });
      return user;
    } catch (error) {
      logger.error('User creation failed', { error, email: data.email });
      throw error;
    }
  }

  // 根据邮箱获取用户
  static async getUserByEmail(email: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          preferences: true
        }
      });
      
      return user;
    } catch (error) {
      logger.error('Get user by email failed', { error, email });
      throw error;
    }
  }

  // 根据ID获取用户
  static async getUserById(id: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          preferences: true,
          generatedImages: {
            take: 10,
            orderBy: { createdAt: 'desc' }
          },
          orders: {
            take: 5,
            orderBy: { createdAt: 'desc' }
          }
        }
      });
      
      return user;
    } catch (error) {
      logger.error('Get user by id failed', { error, userId: id });
      throw error;
    }
  }

  // 更新用户
  static async updateUser(id: string, data: Partial<User>) {
    try {
      const user = await prisma.user.update({
        where: { id },
        data: {
          username: data.username,
          email: data.email,
          phone: data.phone,
          avatar: data.avatar,
          level: data.level
        },
        include: {
          preferences: true
        }
      });
      
      logger.info('User updated successfully', { userId: id });
      return user;
    } catch (error) {
      logger.error('User update failed', { error, userId: id });
      throw error;
    }
  }

  // 更新用户偏好
  static async updateUserPreferences(id: string, preferences: any) {
    try {
      const updatedPreferences = await prisma.userPreferences.upsert({
        where: { userId: id },
        create: {
          userId: id,
          ...preferences
        },
        update: preferences
      });
      
      return updatedPreferences;
    } catch (error) {
      logger.error('Update user preferences failed', { error, userId: id });
      throw error;
    }
  }

  // 获取所有用户（分页）
  static async getUsers(params: {
    page?: number;
    limit?: number;
    search?: string;
    level?: string;
  }) {
    try {
      const { page = 1, limit = 20, search, level } = params;
      const offset = (page - 1) * limit;

      const where: Prisma.UserWhereInput = {};
      
      if (search) {
        where.OR = [
          { username: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ];
      }
      
      if (level) {
        where.level = level;
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          include: {
            preferences: true,
            _count: {
              select: {
                generatedImages: true,
                orders: true,
                showcaseItems: true
              }
            }
          },
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.user.count({ where })
      ]);

      return {
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Get users failed', { error, params });
      throw error;
    }
  }

  // 删除用户
  static async deleteUser(id: string) {
    try {
      const user = await prisma.user.delete({
        where: { id }
      });
      
      logger.info('User deleted successfully', { userId: id });
      return user;
    } catch (error) {
      logger.error('User deletion failed', { error, userId: id });
      throw error;
    }
  }
}

// 商品服务
export class ProductService {
  // 创建商品
  static async createProduct(data: {
    name: string;
    description: string;
    basePrice: number;
    images: string[];
    category: string;
    specifications: any;
    sizes: any[];
    accessories?: string[];
  }) {
    try {
      const product = await prisma.product.create({
        data: {
          name: data.name,
          description: data.description,
          basePrice: data.basePrice,
          images: data.images,
          category: data.category,
          specifications: {
            create: {
              ...data.specifications
            }
          },
          accessories: {
            create: data.accessories?.map(accessoryId => ({
              accessoryId
            })) || []
          }
        },
        include: {
          specifications: {
            include: {
              sizes: true
            }
          },
          accessories: {
            include: {
              accessory: true
            }
          }
        }
      });
      
      logger.info('Product created successfully', { productId: product.id, name: product.name });
      return product;
    } catch (error) {
      logger.error('Product creation failed', { error, name: data.name });
      throw error;
    }
  }

  // 获取所有商品
  static async getProducts(params: {
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
    isActive?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        category, 
        search, 
        isActive = true,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = params;
      
      const offset = (page - 1) * limit;

      const where: Prisma.ProductWhereInput = {
        isActive
      };
      
      if (category) {
        where.category = category;
      }
      
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ];
      }

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: {
            specifications: {
              include: {
                sizes: true
              }
            },
            accessories: {
              include: {
                accessory: true
              }
            },
            _count: {
              select: {
                cartItems: true
              }
            }
          },
          skip: offset,
          take: limit,
          orderBy: { [sortBy]: sortOrder }
        }),
        prisma.product.count({ where })
      ]);

      return {
        products,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Get products failed', { error, params });
      throw error;
    }
  }

  // 根据ID获取商品
  static async getProductById(id: string) {
    try {
      const product = await prisma.product.findUnique({
        where: { id },
        include: {
          specifications: {
            include: {
              sizes: true
            }
          },
          accessories: {
            include: {
              accessory: true
            }
          }
        }
      });
      
      return product;
    } catch (error) {
      logger.error('Get product by id failed', { error, productId: id });
      throw error;
    }
  }

  // 更新商品
  static async updateProduct(id: string, data: Partial<Product>) {
    try {
      const product = await prisma.product.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          basePrice: data.basePrice,
          images: data.images,
          category: data.category,
          isCustomizable: data.isCustomizable,
          isActive: data.isActive
        },
        include: {
          specifications: {
            include: {
              sizes: true
            }
          },
          accessories: {
            include: {
              accessory: true
            }
          }
        }
      });
      
      logger.info('Product updated successfully', { productId: id });
      return product;
    } catch (error) {
      logger.error('Product update failed', { error, productId: id });
      throw error;
    }
  }

  // 删除商品
  static async deleteProduct(id: string) {
    try {
      const product = await prisma.product.delete({
        where: { id }
      });
      
      logger.info('Product deleted successfully', { productId: id });
      return product;
    } catch (error) {
      logger.error('Product deletion failed', { error, productId: id });
      throw error;
    }
  }
}

// 订单服务
export class OrderService {
  // 创建订单
  static async createOrder(data: {
    userId: string;
    items: any[];
    totalAmount: number;
    estimatedCompletionDate: Date;
    notes?: string;
  }) {
    try {
      const order = await prisma.order.create({
        data: {
          userId: data.userId,
          status: 'pending',
          totalAmount: data.totalAmount,
          estimatedCompletionDate: data.estimatedCompletionDate,
          notes: data.notes,
          timeline: {
            create: [
              {
                status: 'pending',
                title: '订单创建',
                description: '订单已创建，等待支付',
                completed: true,
                completedAt: new Date()
              }
            ]
          }
        },
        include: {
          items: {
            include: {
              product: true,
              image: true,
              selectedSize: true,
              selectedAccessories: {
                include: {
                  accessory: true
                }
              }
            }
          },
          user: true,
          timeline: true
        }
      });
      
      logger.info('Order created successfully', { orderId: order.id, userId: data.userId });
      return order;
    } catch (error) {
      logger.error('Order creation failed', { error, userId: data.userId });
      throw error;
    }
  }

  // 获取订单列表
  static async getOrders(params: {
    page?: number;
    limit?: number;
    userId?: string;
    status?: string;
  }) {
    try {
      const { page = 1, limit = 20, userId, status } = params;
      const offset = (page - 1) * limit;

      const where: Prisma.OrderWhereInput = {};
      
      if (userId) {
        where.userId = userId;
      }
      
      if (status) {
        where.status = status;
      }

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true
              }
            },
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    images: true
                  }
                },
                image: {
                  select: {
                    id: true,
                    generatedImage: true
                  }
                }
              }
            },
            shippingInfo: true,
            paymentInfo: true,
            trackingInfo: true
          },
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.order.count({ where })
      ]);

      return {
        orders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Get orders failed', { error, params });
      throw error;
    }
  }

  // 获取订单详情
  static async getOrderById(id: string) {
    try {
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true
            }
          },
          items: {
            include: {
              product: true,
              image: true,
              selectedSize: true,
              selectedAccessories: {
                include: {
                  accessory: true
                }
              }
            }
          },
          shippingInfo: true,
          paymentInfo: true,
          trackingInfo: true,
          timeline: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });
      
      return order;
    } catch (error) {
      logger.error('Get order by id failed', { error, orderId: id });
      throw error;
    }
  }

  // 更新订单状态
  static async updateOrderStatus(id: string, status: string, note?: string) {
    try {
      const order = await prisma.order.update({
        where: { id },
        data: {
          status,
          timeline: {
            create: {
              status,
              title: this.getStatusTitle(status),
              description: note,
              completed: true,
              completedAt: new Date()
            }
          }
        },
        include: {
          timeline: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });
      
      logger.info('Order status updated', { orderId: id, status });
      return order;
    } catch (error) {
      logger.error('Update order status failed', { error, orderId: id, status });
      throw error;
    }
  }

  private static getStatusTitle(status: string): string {
    const titles: { [key: string]: string } = {
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
    
    return titles[status] || '状态更新';
  }
}

// 图像生成服务
export class ImageService {
  // 创建生成图像记录
  static async createGeneratedImage(data: {
    userId: string;
    originalImage: string;
    generatedImage: string;
    style: string;
    profession?: string;
    prompt: string;
    modelUsed: string;
    quality: string;
  }) {
    try {
      const image = await prisma.generatedImage.create({
        data
      });
      
      logger.info('Generated image created', { imageId: image.id, userId: data.userId });
      return image;
    } catch (error) {
      logger.error('Create generated image failed', { error, userId: data.userId });
      throw error;
    }
  }

  // 获取用户生成图像
  static async getUserGeneratedImages(userId: string, params: {
    page?: number;
    limit?: number;
    style?: string;
  }) {
    try {
      const { page = 1, limit = 20, style } = params;
      const offset = (page - 1) * limit;

      const where: Prisma.GeneratedImageWhereInput = { userId };
      
      if (style) {
        where.style = style;
      }

      const [images, total] = await Promise.all([
        prisma.generatedImage.findMany({
          where,
          include: {
            showcaseItem: true
          },
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.generatedImage.count({ where })
      ]);

      return {
        images,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Get user generated images failed', { error, userId });
      throw error;
    }
  }

  // 更新图像公共状态
  static async toggleImagePrivacy(id: string, isPublic: boolean) {
    try {
      const image = await prisma.generatedImage.update({
        where: { id },
        data: { isPublic }
      });
      
      return image;
    } catch (error) {
      logger.error('Toggle image privacy failed', { error, imageId: id });
      throw error;
    }
  }

  // 删除生成图像
  static async deleteGeneratedImage(id: string) {
    try {
      const image = await prisma.generatedImage.delete({
        where: { id }
      });
      
      logger.info('Generated image deleted', { imageId: id });
      return image;
    } catch (error) {
      logger.error('Delete generated image failed', { error, imageId: id });
      throw error;
    }
  }
}

// 购物车服务
export class CartService {
  // 添加到购物车
  static async addToCart(data: {
    userId: string;
    productId: string;
    imageId?: string;
    quantity: number;
    selectedSizeId: string;
    selectedAccessories: any[];
    customizations: any[];
    unitPrice: number;
    totalPrice: number;
  }) {
    try {
      const cartItem = await prisma.cartItem.create({
        data: {
          userId: data.userId,
          productId: data.productId,
          imageId: data.imageId,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          totalPrice: data.totalPrice,
          customizations: data.customizations,
          selectedSizeId: data.selectedSizeId,
          selectedAccessories: {
            create: data.selectedAccessories.map(accessory => ({
              accessoryId: accessory.accessoryId,
              quantity: accessory.quantity,
              position: accessory.position
            }))
          }
        },
        include: {
          product: true,
          image: true,
          selectedSize: true,
          selectedAccessories: {
            include: {
              accessory: true
            }
          }
        }
      });
      
      logger.info('Item added to cart', { cartItemId: cartItem.id, userId: data.userId });
      return cartItem;
    } catch (error) {
      logger.error('Add to cart failed', { error, userId: data.userId });
      throw error;
    }
  }

  // 获取用户购物车
  static async getUserCart(userId: string) {
    try {
      const cartItems = await prisma.cartItem.findMany({
        where: { userId },
        include: {
          product: {
            include: {
              specifications: {
                include: {
                  sizes: true
                }
              }
            }
          },
          image: true,
          selectedSize: true,
          selectedAccessories: {
            include: {
              accessory: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const total = cartItems.reduce((sum, item) => sum + item.totalPrice, 0);

      return {
        items: cartItems,
        total
      };
    } catch (error) {
      logger.error('Get user cart failed', { error, userId });
      throw error;
    }
  }

  // 更新购物车商品
  static async updateCartItem(id: string, data: {
    quantity?: number;
    selectedAccessories?: any[];
  }) {
    try {
      const updateData: any = {};
      
      if (data.quantity) {
        updateData.quantity = data.quantity;
      }
      
      if (data.selectedAccessories) {
        // 删除旧的配件记录
        await prisma.cartItemAccessory.deleteMany({
          where: { cartItemId: id }
        });
        
        // 添加新的配件记录
        updateData.selectedAccessories = {
          create: data.selectedAccessories.map(accessory => ({
            accessoryId: accessory.accessoryId,
            quantity: accessory.quantity,
            position: accessory.position
          }))
        };
      }

      const cartItem = await prisma.cartItem.update({
        where: { id },
        data: updateData,
        include: {
          product: true,
          selectedAccessories: {
            include: {
              accessory: true
            }
          }
        }
      });
      
      return cartItem;
    } catch (error) {
      logger.error('Update cart item failed', { error, cartItemId: id });
      throw error;
    }
  }

  // 删除购物车商品
  static async removeFromCart(id: string) {
    try {
      const cartItem = await prisma.cartItem.delete({
        where: { id }
      });
      
      logger.info('Item removed from cart', { cartItemId: id });
      return cartItem;
    } catch (error) {
      logger.error('Remove from cart failed', { error, cartItemId: id });
      throw error;
    }
  }

  // 清空购物车
  static async clearCart(userId: string) {
    try {
      const result = await prisma.cartItem.deleteMany({
        where: { userId }
      });
      
      logger.info('Cart cleared', { userId, deletedCount: result.count });
      return result;
    } catch (error) {
      logger.error('Clear cart failed', { error, userId });
      throw error;
    }
  }
}