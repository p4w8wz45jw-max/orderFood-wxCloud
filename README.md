# 一款基于微信云开发的餐饮店点餐小程序（开源版）

不用买服务器，不用写后端，改几个配置就能跑起来属于自己的扫码点餐小程序。

> **适合人群**：想给自己店面做个点餐系统的老板 / 想学习微信云开发的小程序开发者
>
> 📖 **新手部署请看：[部署教程.md](./部署教程.md)**（按顺序照着做就行）
>
> 觉得有帮助的话，记得点个 ⭐ Star 支持一下！

## 📸 效果展示

<table>
  <tr>
    <td width="25%">
      <img src="./miniprogram/images/githubImg/sy.jpg" alt="点餐页面" />
      <br />
      <div align="center">点餐页面</div>
    </td>
    <td width="25%">
      <img src="./miniprogram/images/githubImg/hycz.jpg" alt="充值页面" />
      <br />
      <div align="center">充值页面</div>
    </td>
    <td width="25%">
      <img src="./miniprogram/images/githubImg/wddd.jpg" alt="我的订单页面" />
      <br />
      <div align="center">我的订单页面</div>
    </td>
    <td width="25%">
      <img src="./miniprogram/images/githubImg/grzx.jpg" alt="个人中心页面" />
      <br />
      <div align="center">个人中心页面</div>
    </td>
  </tr>
  <tr>
   <td width="25%">
      <img src="./miniprogram/images/githubImg/glyjm.jpg" alt="管理员页面" />
      <br />
      <div align="center">管理员页面</div>
   </td>
   <td width="25%">
      <img src="./miniprogram/images/githubImg/hy.png" alt="会员页面" />
      <br />
      <div align="center">会员页面</div>
    </td>
    <td width="25%">
      <img src="./miniprogram/images/githubImg/dyjgl.jpg" alt="打印机管理页面" />
      <br />
      <div align="center">打印机管理页面</div>
    </td>
    <td width="25%">
      <img src="./miniprogram/images/githubImg/glydd.jpg" alt="管理员订单页面" />
      <br />
      <div align="center">管理员订单页面</div>
    </td>
  </tr>
  <tr>
   <td width="25%">
      <img src="./miniprogram/images/githubImg/cztc.jpg" alt="充值套餐设置页面" />
      <br />
      <div align="center">充值套餐设置页面</div>
   </td>
   <td width="25%">
      <img src="./miniprogram/images/githubImg/bjcp.jpg" alt="编辑菜品页面" />
      <br />
      <div align="center">编辑菜品页面</div>
    </td>
    <td width="25%">
      <img src="./miniprogram/images/githubImg/sczm.jpg" alt="一键生成桌码" />
      <br />
      <div align="center">一键生成桌码</div>
    </td>
    <td width="25%">
      <img src="./miniprogram/images/githubImg/zmgl.jpg" alt="桌码管理页面" />
      <br />
      <div align="center">桌码管理页面</div>
    </td>
  </tr>
  <tr>
   <td width="25%">
      <img src="./miniprogram/images/githubImg/zm.jpg" alt="桌码示例" />
      <br />
      <div align="center">桌码示例</div>
   </td>
   <td width="25%">
      <img src="./miniprogram/images/githubImg/xp.jpg" alt="小票示例" />
      <br />
      <div align="center">小票示例</div>
    </td>
     <td width="25%">
      <img src="./miniprogram/images/githubImg/jsdd.jpg" alt="结算订单页面" />
      <br />
      <div align="center">结算订单页面</div>
    </td>
  </tr>
</table>

---

## ✨ 功能简介

### 👤 顾客功能

- ✅ 扫码点餐：堂食 / 外卖 / 自取，桌码扫码直接进入
- ✅ 支付方式：微信支付 + 会员卡余额，支持混合支付
- ✅ 会员充值：多种充值套餐，支持充值赠免单等活动
- ✅ 优惠券：满减券 / 折扣券 / 商品券
- ✅ 营销玩法：秒杀、拼团、新客赠礼、邀请有礼、幸运抽奖
- ✅ 积分商城：消费得积分，积分兑换商品或优惠券
- ✅ 订单查询、配送时间选择、免单机会

### 🛠️ 管理员功能

- ✅ **菜品管理** — 分类、价格、图片、规格标签、全场折扣设置
- ✅ **订单管理** — 实时订单、订单详情、一键退款
- ✅ **会员管理** — 会员列表、余额调整、积分管理
- ✅ **数据统计** — 营收、退款、菜品销量报表
- ✅ **桌码管理** — 一键生成桌码海报，支持自定义背景
- ✅ **云打印** — 芯烨云打印机，小票自动打印 + 语音播报
- ✅ **消息通知** — 新订单推送到企业微信群 / 公众号 / 订阅消息
- ✅ **装修配置** — 首页轮播、公告、充值公告等自由配置

---

## 🚀 小白部署教程（一步步来，都能成功）

### 准备工作（只需要 3 样）

1. 下载安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 注册一个小程序账号（去 [mp.weixin.qq.com](https://mp.weixin.qq.com) 免费注册，个体工商户可选），拿到 **AppID**
3. 用你自己注册的邮箱登录开发者工具

> 💡 没有打印机、没有微信支付也能先跑起来，后面再配。

---

### 第 1 步：导入项目，改成你的 AppID

1. 下载本项目代码，解压
2. 打开微信开发者工具 → 导入项目 → 选择项目文件夹
3. 打开文件 `project.config.json`，把 `appid` 改成你自己的：

```json
"appid": "改成你的AppID",
```

### 第 2 步：开通云开发，改成你的环境 ID

1. 在开发者工具顶部点击 **「云开发」**，按提示开通（选按量付费的基础版即可）
2. 开通后会得到一个 **环境 ID**（长得像 `cloud1-xxxxx`，在云开发控制台顶部能看到）

然后全局搜索 `your-env-id`（编辑器里 Ctrl+Shift+F），把下面这些地方都换成你的环境 ID：

| 文件 | 位置 |
|------|------|
| `miniprogram/app.js` | 第 19 行左右 `env: 'your-env-id'` |
| `miniprogram/envList.js` | 第 1 行 |
| `cloudfunctions/login/index.js` | 开头 |
| `cloudfunctions/get_code/index.js` | 开头 |
| `cloudfunctions/getCategory/index.js` | 开头 |
| `cloudfunctions/getUserList/index.js` | 开头 |
| `cloudfunctions/pay/index.js` | `ENV_ID` 那行 |
| `cloudfunctions/seckillBuy/index.js` | `ENV_ID` 那行 |

### 第 3 步：一键创建数据库（不用手动建表）

1. 在开发者工具里，右键点击 `cloudfunctions/initDatabase` 文件夹 → **「上传并部署：云端安装依赖」**
2. 右键 `initDatabase` → **「云端测试」** → 直接点「调用」运行
3. 提示成功后，数据库集合和默认配置就自动建好了 ✅

> 💡 如果你想手动建，完整集合清单：`user`、`order`、`dish`、`dishCategory`、`notice`、`rechargeOptions`、`freeBuy`、`shopinfo`、`admin`、`printer`、`tableCode`、`config`、`coupon`、`user_coupons`、`payConfig`、`deliveryConfig`、`points_config`、`points_log`、`lottery_config`、`lottery_records`、`ticket_packages`、`balance_log`、`invite_records`、`seckill`、`seckill_order`
>
> 所有集合权限都设置为：**自定义安全规则 → 全部可读写**：
> ```json
> { "read": true, "write": true }
> ```

### 第 4 步：上传其余云函数

把 `cloudfunctions` 文件夹里**剩下的每一个云函数**，都右键 → **「上传并部署：云端安装依赖」**。

一共有 30 多个，逐个传，大约 10-20 分钟。传完在云开发控制台 → 云函数列表里能全部看到就对了。

### 第 5 步：编译运行

点击开发者工具的 **「编译」** 按钮，模拟器里就能看到点餐页面了 🎉

此时**不配支付和打印机也能用**：可以先在后台添加菜品，用会员余额流程体验完整下单。

### 第 6 步：进入管理后台，配置店铺

1. 模拟器或手机预览打开小程序，进入底部 **「我的」** 页面
2. **在页面右下角空白区域，1 秒内连续点击 5 次**
3. 首次会弹出「设置管理员密码」，输入至少 6 位密码 → 自动进入管理后台
4. 在后台依次配置：
   - **店铺信息** — 店名等基本信息
   - **菜品管理** — 添加分类和菜品
   - **充值套餐** — 设置充值档位

### 第 7 步（可选）：配置微信支付

1. 去 [微信支付商户平台](https://pay.weixin.qq.com) 申请商户号（需要营业执照）
2. 打开 `cloudfunctions/pay/index.js` 和 `cloudfunctions/seckillBuy/index.js`，把 `MCH_ID` 改成你的商户号
3. 在云开发控制台 → 设置 → 其他设置 → 授权，用商户号管理员微信扫码授权
4. 管理后台的「支付配置」里也填上商户号信息

### 第 8 步（可选）：配置小票打印机

1. 买一台 [芯烨云打印机](https://shop.xpyun.net)（支持芯烨云协议的型号都行，200 元左右）
2. 去 [芯烨云开放平台](https://open.xpyun.net) 注册账号，拿到账号和 UKEY
3. 打开 `cloudfunctions/printManage/index.js`，把开头的 `XPYUN_USER` 和 `XPYUN_UKEY` 改成你的
4. 重新上传 `printManage` 云函数，然后在管理后台「打印机管理」里绑定打印机编号（SN）

### 第 9 步（可选）：新订单企业微信通知

1. 建一个企业微信群（免费），群里添加「群机器人」，复制机器人的 **Webhook 地址**
2. 打开 `cloudfunctions/pay_success/index.js`、`payCallback/index.js` 等 4 个文件，把 `YOUR_QY_WEBHOOK_KEY` 换成你机器人地址里的 key（或者直接在管理后台「推送设置」里粘贴完整 Webhook 地址）
3. 重新上传对应云函数

### 第 10 步（可选）：桌码海报背景图

1. 发布小程序上线后，把 `miniprogram/images/bg.png` 上传到云存储，复制文件链接
2. 打开 `miniprogram/pages-sub/admin/tableCode/tableCode.js`，把 `bgImg` 变量的值替换为该链接
3. 重新编译，在管理后台「桌码管理」里生成桌码海报，打印出来贴桌上

> ⚠️ 桌码需要小程序**正式发布上线**后才能生成（因为小程序码指向的页面路径必须是线上存在的）。

---

## ❓ 常见问题

**Q：不配微信支付能用吗？**
能。点餐、菜品、订单、桌码、打印机都正常，只是顾客不能用微信付款（会员余额支付不受影响）。

**Q：成本大概多少？**
- 小程序认证费：30 元/年（个人主体可免认证）
- 云开发基础版：约 20 元/月
- 小票打印机：约 200-260 元（可选项）
- 微信支付：免费，费率 0.6%

**Q：数据库要不要手动建？**
不用，第 3 步的 `initDatabase` 云函数会一键全部建好。

**Q：管理后台在哪？**
「我的」页面右下角 1 秒连点 5 次。这个入口是故意做隐蔽的，顾客发现不了。

**Q：打印机买什么牌子？**
任何支持**芯烨云（XPYUN）**协议的热敏打印机都可以，58mm 小票机即可。

---

## 📝 技术栈

- 微信小程序原生开发
- 微信云开发（云函数 + 云数据库 + 云存储），无需自建服务器
- UI：Vant Weapp + ColorUI，海报生成：painter
- 打印机：芯烨云开放平台 API

## 📁 目录结构

```
├── cloudfunctions/          # 云函数（30+ 个，覆盖下单/支付/打印/通知/营销）
│   ├── initDatabase/        # 一键初始化数据库
│   ├── doBuy/               # 下单
│   ├── pay/                 # 微信支付
│   ├── payCallback/         # 支付回调
│   ├── printManage/         # 云打印
│   └── ...
├── miniprogram/             # 小程序前端
│   ├── pages/               # 顾客端页面（点餐/结算/订单/会员等）
│   ├── pages-sub/admin/     # 管理后台（分包加载）
│   └── components/          # ColorUI / painter 等组件
└── project.config.json      # 项目配置
```

## ⚠️ 安全提示（二次开发必读）

- 数据库权限为全开（`read/write: true`），正式运营建议自行收紧权限规则
- `adminSaveData` / `getAllData` 两个云函数未做管理员鉴权，二次开发时建议加上校验
- 管理员密码为明文存储，建议改为哈希后存储

---

## 🤝 参与贡献

欢迎提交 [Issue](../../issues) 反馈问题，或提交 PR 改进代码。

**如果这个项目帮到了你，点个 Star 就是最大的支持！** ⭐
