# 使用官方 Node.js (Debian glibc) 作为基础镜像，避免 sharp 在 musl 上缺少预编译二进制
FROM node:18-bullseye-slim

# 设置工作目录
WORKDIR /app

# 切换 Debian 源到国内镜像，加速 apt
RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g; s/security.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    postgresql-client \
 && rm -rf /var/lib/apt/lists/*

# 复制package文件
COPY package*.json ./

# 配置国内 npm 镜像，加速依赖下载
RUN npm config set registry https://registry.npmmirror.com

# 安装依赖（需要 dev 依赖参与构建）
RUN npm install

# 复制源代码
COPY . .

# 生成 Prisma 客户端
RUN npx prisma generate

# 跳过构建，使用 ts-node 直接运行服务（transpile-only）

# 使用镜像内置的非 root 用户
RUN mkdir -p /app/logs && chown -R node:node /app
USER node

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# 启动应用（TypeScript 直接运行，忽略类型错误）
CMD ["npm", "run", "start:ts"]