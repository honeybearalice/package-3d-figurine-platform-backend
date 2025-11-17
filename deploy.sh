#!/bin/bash

# MoleTech 3D Figurine Platform 部署脚本
# 适用于 AWS EC2/ECS 部署

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查环境变量
check_env() {
    log_info "检查环境变量..."
    
    if [ -z "$DATABASE_URL" ]; then
        log_error "DATABASE_URL 环境变量未设置"
        exit 1
    fi
    
    if [ -z "$JWT_SECRET" ]; then
        log_error "JWT_SECRET 环境变量未设置"
        exit 1
    fi
    
    log_success "环境变量检查通过"
}

# 安装依赖
install_dependencies() {
    log_info "安装系统依赖..."
    
    # 更新包管理器
    apt-get update
    
    # 安装基础工具
    apt-get install -y \
        curl \
        wget \
        git \
        build-essential \
        postgresql-client \
        nginx \
        certbot \
        python3-certbot-nginx
    
    log_success "系统依赖安装完成"
}

# 安装 Node.js 和 npm
install_nodejs() {
    log_info "安装 Node.js..."
    
    # 添加 NodeSource 仓库
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    
    # 安装 Node.js
    apt-get install -y nodejs
    
    # 验证安装
    node --version
    npm --version
    
    log_success "Node.js 安装完成"
}

# 安装 PM2
install_pm2() {
    log_info "安装 PM2..."
    npm install -g pm2
    
    # 设置 PM2 开机自启
    pm2 startup
    pm2 save
    
    log_success "PM2 安装完成"
}

# 部署应用
deploy_app() {
    log_info "部署应用..."
    
    # 创建应用目录
    APP_DIR="/var/www/moletech-backend"
    mkdir -p $APP_DIR
    
    # 复制应用文件
    cp -r . $APP_DIR/
    
    # 设置权限
    chown -R www-data:www-data $APP_DIR
    chmod -R 755 $APP_DIR
    
    # 安装应用依赖
    cd $APP_DIR
    npm ci --production
    
    # 构建应用
    npm run build
    
    # 复制环境变量文件
    if [ ! -f ".env" ]; then
        log_warning "未找到 .env 文件，复制示例文件"
        cp .env.example .env
        log_warning "请编辑 .env 文件并配置正确的环境变量"
    fi
    
    # 生成 Prisma 客户端
    npm run db:generate
    
    # 运行数据库迁移
    npm run db:migrate:prod
    
    log_success "应用部署完成"
}

# 配置 Nginx
configure_nginx() {
    log_info "配置 Nginx..."
    
    # 创建 Nginx 配置文件
    cat > /etc/nginx/sites-available/moletech-backend << EOF
server {
    listen 80;
    server_name api.moletech.fun;
    
    # 重定向到 HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.moletech.fun;
    
    # SSL 配置
    ssl_certificate /etc/letsencrypt/live/api.moletech.fun/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.moletech.fun/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # 安全头
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    
    # 代理到应用
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }
    
    # 健康检查
    location /health {
        proxy_pass http://localhost:3001/health;
        access_log off;
    }
    
    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF
    
    # 启用站点
    ln -sf /etc/nginx/sites-available/moletech-backend /etc/nginx/sites-enabled/
    
    # 删除默认站点
    rm -f /etc/nginx/sites-enabled/default
    
    # 测试 Nginx 配置
    nginx -t
    
    if [ $? -eq 0 ]; then
        log_success "Nginx 配置通过"
        systemctl reload nginx
    else
        log_error "Nginx 配置有误"
        exit 1
    fi
}

# 配置 SSL 证书
setup_ssl() {
    log_info "设置 SSL 证书..."
    
    # 停止 Nginx 以便 certbot 可以获取证书
    systemctl stop nginx
    
    # 获取 Let's Encrypt 证书
    certbot certonly --standalone --non-interactive --agree-tos --email admin@moletech.fun -d api.moletech.fun
    
    if [ $? -eq 0 ]; then
        log_success "SSL 证书获取成功"
        systemctl start nginx
    else
        log_error "SSL 证书获取失败"
        log_warning "请手动运行: certbot certonly --standalone -d api.moletech.fun"
    fi
}

# 配置 PM2 进程管理器
setup_pm2() {
    log_info "配置 PM2 进程管理器..."
    
    # 创建 PM2 配置文件
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'moletech-backend',
    script: './dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: '/var/log/moletech-backend/error.log',
    out_file: '/var/log/moletech-backend/out.log',
    log_file: '/var/log/moletech-backend/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    watch: false
  }]
};
EOF
    
    # 创建日志目录
    mkdir -p /var/log/moletech-backend
    
    # 启动应用
    pm2 start ecosystem.config.js
    
    # 设置开机自启
    pm2 startup
    pm2 save
    
    log_success "PM2 配置完成"
}

# 配置防火墙
setup_firewall() {
    log_info "配置防火墙..."
    
    # 安装 ufw
    apt-get install -y ufw
    
    # 允许 SSH
    ufw allow ssh
    
    # 允许 HTTP 和 HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # 允许应用端口（在生产环境中应该只允许内部访问）
    # ufw allow from 10.0.0.0/8 to any port 3001
    
    # 启用防火墙
    ufw --force enable
    
    log_success "防火墙配置完成"
}

# 健康检查
health_check() {
    log_info "执行健康检查..."
    
    # 检查应用状态
    pm2 status
    pm2 logs moletech-backend --lines 10
    
    # 检查 API 端点
    if curl -f http://localhost:3001/health > /dev/null 2>&1; then
        log_success "应用健康检查通过"
    else
        log_error "应用健康检查失败"
        log_info "检查应用日志: pm2 logs moletech-backend"
    fi
    
    # 检查 Nginx 状态
    if systemctl is-active --quiet nginx; then
        log_success "Nginx 运行正常"
    else
        log_error "Nginx 未运行"
        systemctl status nginx
    fi
    
    # 检查数据库连接
    log_info "请手动测试数据库连接和关键功能"
}

# 主函数
main() {
    log_info "开始部署 MoleTech 3D Figurine Platform Backend"
    log_info "环境: $NODE_ENV"
    
    # 检查是否以 root 身份运行
    if [ "$EUID" -ne 0 ]; then
        log_error "请以 root 身份运行此脚本"
        exit 1
    fi
    
    # 检查环境变量
    check_env
    
    # 安装依赖
    install_dependencies
    install_nodejs
    install_pm2
    
    # 部署应用
    deploy_app
    
    # 配置服务
    configure_nginx
    setup_pm2
    setup_firewall
    
    # SSL 证书（可选）
    read -p "是否设置 SSL 证书？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        setup_ssl
    fi
    
    # 健康检查
    health_check
    
    log_success "部署完成！"
    log_info "应用访问地址: https://api.moletech.fun"
    log_info "健康检查: https://api.moletech.fun/health"
    log_info "API 文档: https://api.moletech.fun/api/docs"
    log_info ""
    log_info "管理命令:"
    log_info "  查看应用状态: pm2 status"
    log_info "  查看应用日志: pm2 logs moletech-backend"
    log_info "  重启应用: pm2 restart moletech-backend"
    log_info "  停止应用: pm2 stop moletech-backend"
    log_info "  更新应用: cd /var/www/moletech-backend && git pull && npm ci && npm run build && pm2 restart moletech-backend"
}

# 显示帮助信息
show_help() {
    echo "MoleTech 3D Figurine Platform Backend 部署脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示帮助信息"
    echo "  -e, --env      检查环境变量"
    echo "  -d, --deploy   完整部署"
    echo "  -c, --config   只配置服务"
    echo "  -s, --ssl      设置 SSL 证书"
    echo "  -t, --test     运行测试"
    echo ""
    echo "环境变量:"
    echo "  DATABASE_URL   数据库连接字符串"
    echo "  JWT_SECRET     JWT 密钥"
    echo "  NODE_ENV       运行环境 (production)"
    echo ""
}

# 解析命令行参数
case "$1" in
    -h|--help)
        show_help
        exit 0
        ;;
    -e|--env)
        check_env
        exit 0
        ;;
    -d|--deploy)
        main
        exit 0
        ;;
    -c|--config)
        configure_nginx
        setup_pm2
        setup_firewall
        exit 0
        ;;
    -s|--ssl)
        setup_ssl
        exit 0
        ;;
    -t|--test)
        health_check
        exit 0
        ;;
    *)
        log_info "使用 -h 或 --help 查看帮助信息"
        log_info "使用 -d 或 --deploy 进行完整部署"
        exit 1
        ;;
esac