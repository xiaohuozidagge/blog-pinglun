# 支付功能上线测试用例

## 测试前准备

| 项目 | 要求 |
| --- | --- |
| 测试环境 | 使用支付宝沙箱或上线前预发环境 |
| 服务配置 | `ALIPAY_ENV`、`ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`、`ALIPAY_PUBLIC_KEY`、`ALIPAY_NOTIFY_URL`、`ALIPAY_RETURN_URL` 已配置 |
| 数据库 | `payment_orders` 表已存在，或服务启动后可自动创建 |
| 测试用户 | 至少准备 2 个不同 `userId` |
| 测试套餐 | `blog_250`、`as_50` |
| 回调可达性 | 支付宝异步通知地址公网可访问 |

## 核心支付场景

| 用例编号 | 场景 | 前置条件 | 操作步骤 | 预期结果 | 数据库检查 |
| --- | --- | --- | --- | --- | --- |
| PAY-001 | 创建 `blog_250` 支付订单 | 用户没有待支付或待发货订单 | 进入支付页，选择 `blog_250`，点击购买 | 返回支付宝支付链接，前端跳转到支付页；订单有效期显示约 2 小时 | `payment_orders` 新增 1 条记录；`plan_id=blog_250`；`status=pending_payment`；`amount=19.90`；`out_trade_no` 唯一 |
| PAY-002 | 创建 `as_50` 支付订单 | 用户没有待支付或待发货订单 | 进入支付页，选择 `as_50`，点击购买 | 返回支付宝支付链接，前端跳转到支付页 | `plan_id=as_50`；`status=pending_payment`；`amount=19.90` |
| PAY-003 | 待支付订单优先展示 | 用户已有 2 小时内的 `pending_payment` 订单 | 打开支付页 | 页面优先展示未支付订单；显示订单号和剩余支付时长；按钮显示继续支付 | 不新增订单；原订单保持 `status=pending_payment` |
| PAY-004 | 待支付订单继续支付 | 用户已有 2 小时内的 `pending_payment` 订单 | 点击继续支付 | 复用原订单打开支付宝收银台，不创建新订单 | 订单数量不变；`out_trade_no` 与原订单一致 |
| PAY-005 | 支付成功后进入待发货 | 已创建待支付订单 | 在支付宝沙箱完成支付 | 支付宝异步通知返回 `success`；前端查询状态显示已支付待发货 | 原订单更新为 `status=paid_pending_fulfillment`；写入 `alipay_trade_no`、`paid_at`、`raw_notify` |
| PAY-006 | 支付成功后重复购买拦截 | 用户已有 `paid_pending_fulfillment` 订单 | 同一用户再次购买任意套餐 | 接口返回失败；提示已有已支付订单，等待人工发货 | 不新增订单；返回码应为 `409`；错误码 `PENDING_FULFILLMENT_EXISTS` |
| PAY-007 | 人工发货完成 | 用户已有 `paid_pending_fulfillment` 订单 | 后台或数据库将订单标记为已发货 | 前端查询状态显示已发货 | `status=fulfilled`；`fulfilled_at` 有值 |
| PAY-008 | 已发货后允许再次购买 | 用户最近订单为 `fulfilled` | 同一用户再次购买任意套餐 | 可以正常创建新支付订单 | 新增 1 条订单；新订单 `status=pending_payment` |
| PAY-009 | 未支付订单 2 小时后自动关闭 | 用户已有创建时间超过 2 小时的 `pending_payment` 订单 | 打开支付页或再次创建订单 | 旧订单不再阻塞；可以创建新订单 | 旧订单自动更新为 `status=closed`；新订单 `status=pending_payment` |
| PAY-010 | 支付宝交易关闭后允许再次购买 | 用户已有 `pending_payment` 订单 | 支付宝侧关闭交易，或模拟 `TRADE_CLOSED` 通知 | 订单关闭；用户可以再次购买 | 原订单 `status=closed`；再次购买会新增新订单 |
| PAY-011 | 异步通知幂等性 | 订单已因支付成功变成 `paid_pending_fulfillment` | 重复发送同一笔 `TRADE_SUCCESS` 通知 | 接口仍返回 `success`，订单不重复、不异常 | 仍只有原订单；`paid_at` 不被覆盖为空；状态仍为 `paid_pending_fulfillment` |
| PAY-012 | 已发货订单收到重复支付成功通知 | 订单已人工改为 `fulfilled` | 再次发送该订单的 `TRADE_SUCCESS` 通知 | 接口返回 `success`；已发货状态不被回退 | `status` 保持 `fulfilled`；`raw_notify` 更新 |

## 支付宝通知异常场景

| 用例编号 | 场景 | 前置条件 | 操作步骤 | 预期结果 | 数据库检查 |
| --- | --- | --- | --- | --- | --- |
| PAY-013 | 通知签名校验失败 | 已有待支付订单 | 使用错误签名或篡改通知参数请求 `/api/alipay/notify` | 接口返回 `failure`，HTTP 状态为 `400` | 订单状态不变；不写入支付成功时间 |
| PAY-014 | 通知订单号不存在 | 无对应 `out_trade_no` | 发送支付宝通知，`out_trade_no` 填不存在的订单号 | 接口返回 `failure`，HTTP 状态为 `404` | 不新增订单 |
| PAY-015 | 通知 `app_id` 不匹配 | 已有待支付订单 | 发送通知时 `app_id` 使用其他应用 ID | 接口返回 `failure`，HTTP 状态为 `400` | 订单状态不变 |
| PAY-016 | 通知金额不匹配 | 已有待支付订单 | 发送通知时 `total_amount` 与订单金额不一致 | 接口返回 `failure`，HTTP 状态为 `400` | 订单状态不变；不写入 `paid_at` |
| PAY-017 | `TRADE_SUCCESS` 支付成功 | 已有待支付订单 | 支付宝通知 `trade_status=TRADE_SUCCESS` | 接口返回 `success` | `status=paid_pending_fulfillment`；`paid_at` 有值 |
| PAY-018 | `TRADE_FINISHED` 交易完成 | 已有待支付订单 | 支付宝通知 `trade_status=TRADE_FINISHED` | 接口返回 `success` | `status=paid_pending_fulfillment`；`paid_at` 有值 |
| PAY-019 | `TRADE_CLOSED` 交易关闭 | 已有待支付订单 | 支付宝通知 `trade_status=TRADE_CLOSED` | 接口返回 `success` | `status=closed`；`raw_notify` 有值 |
| PAY-020 | 未处理的通知状态 | 已有待支付订单 | 发送 `WAIT_BUYER_PAY` 等非成功、非关闭状态 | 接口返回 `success` | `status` 保持不变；`raw_notify` 更新 |

## 接口参数与查询场景

| 用例编号 | 场景 | 前置条件 | 操作步骤 | 预期结果 | 数据库检查 |
| --- | --- | --- | --- | --- | --- |
| PAY-021 | 创建订单缺少 `userId` | 无 | 请求 `/api/alipay/create-order`，不传 `userId` | 接口返回失败，HTTP 状态为 `400` | 不新增订单 |
| PAY-022 | 创建订单 `planId` 无效 | 无 | 请求 `/api/alipay/create-order`，传不存在的 `planId` | 接口返回失败，HTTP 状态为 `400` | 不新增订单 |
| PAY-023 | 查询无订单用户状态 | 用户从未购买 | 请求 `/api/purchase-status?userId=xxx` | 返回成功，状态为 `none` | 无 |
| PAY-024 | 查询待支付用户状态 | 用户已有 `pending_payment` 订单 | 请求 `/api/purchase-status?userId=xxx` | 返回待支付状态和订单号、剩余支付时长 | 查询结果与数据库未过期待支付订单一致 |
| PAY-025 | 查询待发货用户状态 | 用户已有 `paid_pending_fulfillment` 订单 | 请求 `/api/purchase-status?userId=xxx` | 返回已支付待发货状态 | 返回 `paidAt` 有值 |
| PAY-026 | 查询订单列表 | 用户有多笔历史订单 | 请求 `/api/alipay/orders?userId=xxx` | 返回订单列表，待支付订单优先展示 | 最多返回 20 条；状态与数据库一致 |
| PAY-027 | 查询接口缺少 `userId` | 无 | 请求 `/api/purchase-status` 或 `/api/alipay/orders` 不传 `userId` | 接口返回失败，HTTP 状态为 `400` | 无 |
| PAY-028 | 支付返回页 | 支付完成后从支付宝同步返回 | 打开 `/api/alipay/return` | 页面正常展示支付结果处理中提示 | 无 |

## 配置与上线检查

| 用例编号 | 场景 | 前置条件 | 操作步骤 | 预期结果 | 数据库检查 |
| --- | --- | --- | --- | --- | --- |
| PAY-029 | 支付配置诊断 | 服务已启动 | 请求 `/api/alipay/config-diagnostics` | 返回 `success=true`；环境、网关、密钥存在性符合预期 | 无 |
| PAY-030 | 沙箱环境网关检查 | `ALIPAY_ENV=sandbox` | 请求配置诊断接口 | `env=sandbox`；网关为沙箱网关；`gatewayMatchesEnv=true` | 无 |
| PAY-031 | 正式环境网关检查 | `ALIPAY_ENV=production` | 请求配置诊断接口 | `env=production`；网关为正式网关；`gatewayMatchesEnv=true` | 无 |
| PAY-032 | 支付表字段注释检查 | 数据库可访问 | 执行 `SHOW FULL COLUMNS FROM payment_orders` | 每个字段都有中文注释，枚举字段说明完整 | `plan_id`、`status`、`raw_notify` 注释包含枚举值 |

## 建议上线准入标准

| 检查项 | 通过标准 |
| --- | --- |
| 主流程 | `PAY-001` 到 `PAY-012` 全部通过 |
| 支付宝通知 | `PAY-013` 到 `PAY-020` 全部通过 |
| 查询接口 | `PAY-021` 到 `PAY-028` 全部通过 |
| 配置检查 | `PAY-029` 到 `PAY-032` 全部通过 |
| 数据一致性 | 不出现重复待支付/待发货订单；支付成功订单必须有 `paid_at` 和 `raw_notify` |
| 回滚准备 | 确认可以手动将异常订单改为 `failed` 或 `closed` |
