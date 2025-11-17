# MoleTech 3D Figurine Platform Backend

## 项目简介

MoleTech 3D 手办定制平台后端 API 服务器，提供完整的 3D 手办定制、订单管理、支付处理、图像生成等功能。

## 功能特性

### 核心功能
- 🤖 **AI 图像生成**: 集成豆包 AI，支持多种风格和职业的 3D 手办图像生成
- 📦 **订单管理**: 完整的订单流程管理，从创建到完成的全生命周期跟踪
- 🛒 **购物车系统**: 支持商品管理、配件选择、定制化配置
- 💳 **多支付方式**: 支持 Stripe、PayPal、微信支付、支付宝等多种支付方式
- 📱 **通知系统**: 邮件和短信通知，支持订单状态更新
- 👤 **用户管理**: 完整的用户认证、授权和偏好管理

### 技术特性
- 🔐 **JWT 认证**: 安全的用户认证和授权机制
- 🗃️ **数据库**: PostgreSQL + Prisma ORM，提供数据持久化
- 📊 **API 文档**: 完整的 RESTful API 文档和健康检查
- 🔍 **数据验证**: 完整的数据验证和错误处理
- 📈 **性能监控**: 请求日志、健康检查、性能统计
- 🛡️ **安全防护**: CORS、限流、输入验证等安全措施

## 技术栈

- **运行环境**: Node.js 18+
- **框架**: Express.js + TypeScript
- **数据库**: PostgreSQL + Prisma ORM
- **认证**: JWT (JSON Web Tokens)
- **文件存储**: AWS S3
- **支付处理**: Stripe, PayPal, 微信支付, 支付宝
- **通知服务**: SendGrid (邮件) + Twilio (短信)
- **部署**: Docker + PM2 + Nginx + Let's Encrypt SSL

## 快速开始

### 环境要求

- Node.js 18+
- PostgreSQL 12+
- Redis (可选，用于缓存)
- AWS S3 账户 (可选，用于文件存储)

### 安装依赖

```bash
# 安装项目依赖
npm install

# 生成 Prisma 客户端
npm run db:generate

# 运行数据库迁移
npm run db:migrate

# 可选：运行数据种子
npm run db:seed
```

### 环境配置

1. 复制环境变量文件：
```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，配置必要的环境变量：

```env
# 数据库配置
DATABASE_URL="postgresql://username:password@localhost:5432/moletech_figurine_db"

# JWT 配置
JWT_SECRET="your-super-secret-jwt-key"

# 豆包 AI 配置
DOUBAO_API_KEY="1a47b366-5b95-4526-906e-9d25aa74ca96"
DOUBAO_MODEL="doubao-seedream-4-0-250828"

# AWS S3 配置
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
AWS_REGION="us-west-2"
S3_BUCKET_NAME="moletech-figurine-uploads"

# 支付配置
STRIPE_SECRET_KEY="sk_test_your_stripe_secret_key"
PAYPAL_CLIENT_ID="your_paypal_client_id"
PAYPAL_CLIENT_SECRET="your_paypal_client_secret"

# 通知配置
ADMIN_PHONE="18664589852"
ADMIN_EMAIL="454757093@qq.com"
```

### 启动开发服务器

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

服务器将在 `http://localhost:3001` 启动。

## API 文档

### 基础信息

- **基础 URL**: `http://localhost:3001/api`
- **认证方式**: Bearer Token (JWT)
- **数据格式**: JSON

### 主要端点

#### 用户认证
- `POST /auth/register` - 用户注册
- `POST /auth/login` - 用户登录
- `POST /auth/refresh-token` - 刷新令牌
- `GET /auth/check-username` - 检查用户名
- `GET /auth/check-email` - 检查邮箱

#### 用户管理
- `GET /user/profile` - 获取用户信息
- `PUT /user/profile` - 更新用户信息
- `PUT /user/preferences` - 更新用户偏好
- `GET /user/stats` - 获取用户统计

#### 商品管理
- `GET /products` - 获取商品列表
- `GET /products/:id` - 获取商品详情
- `GET /products/search` - 搜索商品
- `GET /products/categories` - 获取商品分类

#### 购物车
- `GET /cart` - 获取购物车
- `POST /cart` - 添加商品到购物车
- `PUT /cart/:id` - 更新购物车商品
- `DELETE /cart/:id` - 删除购物车商品

#### 订单管理
- `POST /orders` - 创建订单
- `GET /orders` - 获取订单列表
- `GET /orders/:id` - 获取订单详情
- `PUT /orders/:id/status` - 更新订单状态

#### 图像生成
- `POST /images/generate` - 生成图像
- `GET /images/my-images` - 获取我的生成图像
- `GET /images/public` - 获取公开图像
- `DELETE /images/:id` - 删除生成图像

#### 展示池
- `GET /showcase` - 获取展示池
- `POST /showcase` - 创建展示项目
- `POST /showcase/:id/like` - 点赞展示项目
- `POST /showcase/:id/comment` - 添加评论

#### 支付处理
- `POST /payments/create` - 创建支付
- `GET /payments/verify/:id` - 验证支付
- `GET /payments/methods` - 获取支付方式

#### 通知
- `GET /notifications` - 获取通知
- `PUT /notifications/:id/read` - 标记为已读
- `PUT /notifications/read-all` - 全部标记为已读

#### 管理员
- `GET /admin/dashboard` - 仪表板统计
- `GET /admin/users` - 用户管理
- `GET /admin/orders` - 订单管理
- `GET /admin/health` - 系统健康检查

## 部署指南

### Docker 部署

1. 构建镜像：
```bash
docker build -t moletech-backend .
```

2. 运行容器：
```bash
docker run -d -p 3001:3001 --name moletech-backend moletech-backend
```

### 生产环境部署

1. 使用部署脚本：
```bash
# 以 root 身份运行
sudo ./deploy.sh --deploy
```

2. 手动部署步骤：
```bash
# 安装依赖
sudo apt-get update
sudo apt-get install -y curl wget git build-essential postgresql-client

# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 PM2
sudo npm install -g pm2

# 部署应用
git clone <repository-url>
cd moletech-backend
npm ci --production
npm run build
npm run db:migrate:prod

# 配置 PM2
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

### 环境变量配置

在生产环境中确保配置以下关键环境变量：

- `NODE_ENV=production`
- `DATABASE_URL` (生产数据库连接)
- `JWT_SECRET` (强密钥)
- `FRONTEND_URL` (前端应用地址)
- `API_URL` (API 地址)
- 各种第三方服务密钥

## 监控和日志

### 日志文件
- 应用日志: `/var/log/moletech-backend/combined.log`
- 错误日志: `/var/log/moletech-backend/error.log`
- 输出日志: `/var/log/moletech-backend/out.log`

### 健康检查
- 基础健康检查: `GET /health`
- 详细信息: `GET /api/docs`

### PM2 管理
```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs moletech-backend

# 重启应用
pm2 restart moletech-backend

# 停止应用
pm2 stop moletech-backend
```

## 开发指南

### 项目结构

```
backend/
├── src/
│   ├── controllers/     # 控制器
│   ├── middleware/      # 中间件
│   ├── routes/          # 路由
│   ├── services/        # 服务层
│   ├── config/          # 配置
│   ├── utils/           # 工具函数
│   └── types/           # TypeScript 类型
├── prisma/
│   └── schema.prisma    # 数据库模式
├── tests/               # 测试文件
└── docs/                # 文档
```

### 代码规范

- 使用 TypeScript 严格模式
- 遵循 RESTful API 设计原则
- 完整的错误处理和日志记录
- 使用 Prisma 进行数据库操作
- JWT 认证和授权

### 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交代码更改
4. 创建 Pull Request

## 常见问题

### 数据库连接问题
- 检查 `DATABASE_URL` 环境变量
- 确保 PostgreSQL 服务运行
- 验证数据库用户权限

### 图像生成失败
- 检查豆包 API 密钥
- 验证 API 端点连通性
- 查看应用日志

### 支付问题
- 验证支付网关配置
- 检查 Webhook 端点
- 查看支付服务状态

## 许可证

MIT License

## 联系信息

- 项目仓库: [GitHub Repository]
- 官方网站: [https://moletech.fun](https://moletech.fun)
- 技术支持: support@moletech.fun
- 管理员邮箱: 454757093@qq.com

---

**注意**: 本项目包含生产环境配置，部署前请确保所有环境变量正确配置，并进行充分测试。