# ⚙ 自建 R2 免费额度监控




</details>

## 🛠️ Workers 部署方法

<details>
<summary><code><strong>「 Workers 部署文字教程 」</strong></code></summary>

### 部署 Cloudflare Worker：

   - 在 Cloudflare Worker 控制台中创建一个新的 Worker。
   - 将 [_worker.js]([https://github.com/cmliu/CF-Workers-SUB/blob/main/_worker.js](https://github.com/lg-yyds/CF-Workers-R2/blob/main/_worker.js))  的内容粘贴到 Worker 编辑器中。


</details>

## 📋 变量说明
| 变量名 | 示例 | 必填 | 备注 | 
|-|-|-|-|
| ACCOUNT_ID | `你的Account_ID` | ✅ | R2 页面右侧可见 | 
| CF_API_TOKEN | `你的API_Token` | ✅ | 权限：Account Analytics Read | 
| ALERT_THRESHOLD | `80` | ✅ | 报警阈值 %，默认 80 |
| ALWAYS_NOTIFY | `false` | ✅ | true 每次定时都推，false 仅超阈值 | 
| TG_BOT_TOKEN | `6894123456:XXXXXXXXXX0qExVsBPUhHDAbXXXXXqWXgBA` | ❌ | 发送TG通知的机器人token | 
| TG_CHAT_ID | `6946912345` | ❌ | 接收TG通知的账户数字ID | 
| QYWX_AM | `ww6634666e5996,NevxRwSNpb9x0sUZj1BDBPCiOP7DsRSYDg5lM,@all,1000002,0` | ❌ | 企业微信 |




## ⚠️ 注意事项
项目中，TGTOKEN和TGID在使用时需要先到Telegram注册并获取。其中，TGTOKEN是telegram bot的凭证，TGID是用来接收通知的telegram用户或者组的id。
企业微信应用推送 参考文档：http://note.youdao.com/s/HMiudGkb
