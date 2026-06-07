# PlantFlow

**PlantFlow**（厂流）— 可视化工作流编排 + AI 知识库 + 对话应用，面向工厂/企业内部自动化。可理解为 **n8n（流程）+ Dify（AI 应用）** 的开源实现。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 功能

- **工作流编辑器**：拖拽节点、条件分支、并行、子工作流、模板
- **触发器**：手动、对话、Webhook、定时 Cron、企业微信、飞书
- **AI**：对话、知识库 RAG、Agent（工具调用）
- **知识库**：文件上传 / 粘贴导入、关键词与向量检索
- **对话应用**：OpenAI 兼容 API、网页聊天嵌入
- **渠道**：企业微信、飞书消息推送与回调
- **运维**：执行中心、会话 Inbox、多租户、审计日志

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18、Vite、React Flow、Tailwind |
| 后端 | Express、TypeScript |
| 数据 | PostgreSQL（可选 pgvector）、Redis |
| 部署 | Docker Compose |

## 快速开始

### 环境要求

- Node.js 22+（本地开发）
- PostgreSQL 14+（推荐 16，可选安装 [pgvector](https://github.com/pgvector/pgvector)）
- Redis 6+
- Docker & Docker Compose（生产推荐）

### 1. 克隆与配置

```bash
git clone <你的仓库地址>
cd api   # 或仓库根目录名
cp .env.example .env
```

编辑 `.env`：

```bash
# 生成 LLM 密钥加密主密钥（必填）
openssl rand -hex 32
# 将输出填入 LLM_MASTER_KEY=
```

**Docker 部署时**，`DATABASE_URL` / `REDIS_URL` 中的主机请用 `host.docker.internal` 访问宿主机服务。

### 2. 准备数据库

```sql
CREATE USER api WITH PASSWORD 'your_db_password';
CREATE DATABASE api OWNER api;
```

首次启动会自动执行迁移并创建演示数据。

### 3. Docker 部署（推荐）

```bash
docker compose build
docker compose up -d
```

访问：`http://127.0.0.1:5000`（或你反向代理的域名）

### 4. 本地开发

```bash
npm install
npm run dev          # 前端 Vite + 后端 nodemon
# 或分别：
npm run client:dev
npm run server:dev
```

构建：

```bash
npm run build
npm run server:start
```

### 5. 默认演示账号

| 字段 | 值 |
|------|-----|
| 邮箱 | `admin@example.com` |
| 密码 | `admin123` |

**首次登录后请立即修改密码。** 生产环境务必更换演示账号与所有密钥。

## 配置说明

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `REDIS_URL` | Redis 连接串 |
| `LLM_MASTER_KEY` | 32 字节十六进制，用于加密存储的 LLM API Key |
| `WORKER_CONCURRENCY` | 工作流执行并发数 |
| `PORT` | 服务端口，默认 5000 |

在 **AI · 模型** 页面配置大模型网关（OpenAI 兼容）。知识库向量检索需网关支持 `POST /v1/embeddings`。

## 学习文档

- [平台学习手册（Markdown）](docs/平台学习手册.md)
- 构建后也可访问：`/平台学习手册.pdf`

## 项目结构

```
api/                 # Express 后端、迁移、执行引擎
src/                 # React 前端
public/              # 静态资源
docs/                # 文档
docker-compose.yml
Dockerfile
```

## 开源与许可

本项目采用 [MIT License](LICENSE)，可自由使用、修改、商用。保留版权声明即可。

## 安全提示

- **切勿**将 `.env` 提交到 Git
- 若密钥曾泄露，请轮换：`LLM_MASTER_KEY`、数据库密码、Redis 密码、所有 LLM API Key
- 生产环境使用 HTTPS，限制管理后台访问

## 贡献

欢迎 Issue 与 Pull Request。提交前请确保不包含真实密钥。
