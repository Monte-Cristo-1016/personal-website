# 中转（relay）：让国内手机也能用分身 / 留言

## 一、问题是什么

访客反馈「很多苹果手机的用户登不上去，显示 Supabase 无法连接」。

排查结论（2026-10-08）：

| 检查项 | 结果 |
|---|---|
| 页面本身 | **能打开** → 静态托管没问题，死的不是整站 |
| `zhklmnxtdzhkouwfyghr.supabase.co` 解析 | `172.64.149.246` / `104.18.38.10` = **Cloudflare 的任播 IP** |
| 从本机直连该函数 | **HTTP 200 / 约 1.1s** → 服务端是好的 |
| 页面 CSP / `connect-src` | 无限制（排除了被自己的安全策略挡掉） |

也就是说：**只有对 `*.supabase.co` 的请求失败**，而且失败在 TCP 连接阶段 ——
国内移动网络对这些 Cloudflare IP 经常直接连不上，手机上又普遍不挂代理，
所以先倒下的总是「苹果 + 蜂窝流量」这一批。
（这个结论在 `PROGRESS.md` 里早有记录：「DNS 能解析、TCP 连不上那个 Cloudflare IP……不是函数、不是 CORS、不是 SQL」。）

受影响的**不只是聊天，还有留言**（`/rest/v1/feedback` 走同一个域名）——
对这批访客来说，等于两条路都断了。所以 V4 做了两件事：

1. **兜底**（已完成）：留言寄不出去时给出「复制这段话 / 发邮件给我」，
   聊天失败时给出「复制我那句」+ 微信/邮箱。**网络不通也照样能把话送到。**
2. **中转**（本文档）：换一个国内可达的入口，让功能真的恢复。

## 二、为什么前端改不动

浏览器只能访问「网络层到得了」的地址。`*.supabase.co` 对这批访客不可达，
前端再怎么重试、换协议、加超时都无济于事 —— 必须有一个**他们能连上、且能替他们连 Supabase** 的中间人。

## 三、两条路

### 方案 A：香港/日本 VPS + Caddy（推荐）

自己的一台小机器，IP 不在被墙的 Cloudflare 网段上，最可靠。

```bash
# 1) 买一台香港或日本的 VPS（1C1G 够），装 Caddy（Debian/Ubuntu）
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# 2) 域名解析：把 vn-api.你的域名.com 的 A 记录指到这台机器的 IP
#    没有域名也行，用 sslip.io：vn-api.你的机器IP.sslip.io

# 3) 放配置（把 Caddyfile 里的域名改成你的），然后
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Docker 一条命令也行：

```bash
docker run -d --name vn-relay --restart unless-stopped \
  -p 80:80 -p 443:443 \
  -v $PWD/Caddyfile:/etc/caddy/Caddyfile \
  -v caddy_data:/data caddy
```

### 方案 B：Cloudflare Worker（免费，但要先测）

`wrangler.toml` + `cloudflare-worker.js` 已给好，`npx wrangler deploy` 即可。

> ⚠️ **先测再上**：失败的 IP 本来就是 Cloudflare 的，
> 而 `*.workers.dev` 在国内基本不可达。
> Worker 这条路只有在「你绑的自定义域名恰好可达」时才成立 ——
> 所以务必先用国内手机流量测 `curl -i https://你的域名/functions/v1/vn_clone`，
> 通了再接上前端；不通就老实用方案 A。

## 四、部署后怎么接上前端

**只改一行。** 打开 `assets/backend.js`：

```js
/* ★ 中转地址：部署好后把地址填在这儿（不要带结尾斜杠）。 */
var RELAY = "";                     // 改前
var RELAY = "https://vn-api.你的域名.com";   // 改后
```

改完保存即可 —— `clone.js` / `feedback.js` / `weather.js` / `admin.html`
全都从这个文件取入口，**其它文件一个字都不用动**。

前端的行为是「**优先中转、失败回落直连**」，并且会把这次会话里通了的那条路记下来：
即使中转哪天挂了，页面也不会直接死，会自己退回直连。

## 五、怎么验证

在浏览器控制台（任意一页）跑：

```js
await VNB.probe();     // 按「记住的 → 中转 → 直连」各打一枪，返回每条路的结果
VNB.bases();           // 看当前会依次尝试哪些入口
VNB.relay();           // 看中转地址读到了没
```

`probe()` 返回里 `first` 就是实际会用的入口。也可以直接 curl：

```bash
curl -i https://vn-api.你的域名.com/functions/v1/vn_clone
# 期望：Supabase 的响应（200/401 等），而不是连接超时
```

然后**换一张手机卡（关掉 WiFi、别挂代理）**打开聊天页，
能正常收到开场白、能成功留言，才算真的好了。

## 六、注意

- **流式不能缓冲**：分身是一条一条吐字的。Caddy 的 `flush_interval -1`、
  nginx 的 `proxy_buffering off` 都是为这个 —— 少了它会「半天不出字，最后一起蹦出来」。
- **Host / SNI**：必须把 Host 设成 `zhklmnxtdzhkouwfyghr.supabase.co`，
  否则 Supabase 认不出这是谁的请求，直接 404。
- **备案**：VPS 在境外（港/日）**不需要备案**；如果换国内机器 + 域名，就需要备案。
- **anon key 仍是公开的**，中转不会让它更敏感；
  但**别把 service role（管理员那把）key 放进任何前端文件或中转里**。
- **成本**：香港 1C1G 的小机器一年几百块；流量很小（一次对话几 KB）。
- **回滚**：把 `RELAY` 改回 `""` 就跟以前完全一样，没有别的副作用。

## 七、文件清单

| 文件 | 用途 |
|---|---|
| `Caddyfile` | 方案 A 配置（推荐） |
| `nginx.conf` | 方案 A 配置（已有 nginx 时用） |
| `cloudflare-worker.js` + `wrangler.toml` | 方案 B 配置（免费，先测再上） |
