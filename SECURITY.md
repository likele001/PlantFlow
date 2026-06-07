# 安全说明

## 报告漏洞

如发现安全问题，请通过 GitHub Issue（可私信维护者）报告，勿公开披露可利用细节。

## 部署清单

- [ ] 使用强密码，禁用默认 `admin123`（或删除演示种子后自建管理员）
- [ ] `.env` 不进入版本库；`LLM_MASTER_KEY` 使用 `openssl rand -hex 32` 生成
- [ ] PostgreSQL / Redis 不对公网开放
- [ ] 反向代理启用 HTTPS
- [ ] 定期备份数据库

## 密钥轮换

若 `LLM_MASTER_KEY` 或数据库密码曾出现在日志、截图或 Git 历史中：

1. 生成新的 `LLM_MASTER_KEY` 并更新 `.env`
2. 在 **AI · 模型** 中重新保存各提供商 API Key（旧密文将无法解密）
3. 更换数据库与 Redis 密码并更新连接串
