# ⚙ 自建 R2 免费额度监控

![自建R2 免费额度监控 CF-Workers-R2](./sub.png)


</details>

## 🛠️ Workers 部署方法

<details>
<summary><code><strong>「 Workers 部署文字教程 」</strong></code></summary>

### 部署 Cloudflare Worker：

   - 在 Cloudflare Worker 控制台中创建一个新的 Worker。
   - 将 [_worker.js](https://github.com/cmliu/CF-Workers-SUB/blob/main/_worker.js)  的内容粘贴到 Worker 编辑器中。


</details>

## 📋 变量说明
| 变量名 | 示例 | 必填 | 备注 | 
|-|-|-|-|
| TOKEN | `auto` | ✅ | 汇聚订阅的订阅配置路径地址，例如：`/auto` | 
| GUEST | `test` | ❌ | 汇聚订阅的访客订阅TOKEN，例如：`/sub?token=test` | 
| TGTOKEN | `6894123456:XXXXXXXXXX0qExVsBPUhHDAbXXXXXqWXgBA` | ❌ | 发送TG通知的机器人token | 
| TGID | `6946912345` | ❌ | 接收TG通知的账户数字ID | 
| SUBNAME | `CF-Workers-SUB` | ❌ | 订阅名称 |
| SUBAPI | `SUBAPI.cmliussss.net` | ❌ | clash、singbox等 订阅转换后端 | 
| SUBCONFIG | [https://raw.github.../ACL4SSR_Online_MultiCountry.ini](https://raw.githubusercontent.com/cmliu/ACL4SSR/main/Clash/config/ACL4SSR_Online_MultiCountry.ini) | ❌ | clash、singbox等 订阅转换配置文件 | 


## ⚠️ 注意事项
项目中，TGTOKEN和TGID在使用时需要先到Telegram注册并获取。其中，TGTOKEN是telegram bot的凭证，TGID是用来接收通知的telegram用户或者组的id。
