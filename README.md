# 卡通餐厅地图（可协作编辑）

这是一个面向 **Vercel** 部署的 Next.js 原型：卡通风底图 + 卡通标记 + 任何人可新增/编辑餐厅（提交前需要 Turnstile 验证码），数据保存到 Supabase。

## 1. 准备三样东西

### A) 地图底图（MapTiler / Mapbox）
- 获取一个 Key
- 填到环境变量 `NEXT_PUBLIC_MAP_STYLE_URL`
  - MapTiler 示例：`https://api.maptiler.com/maps/streets-v2/style.json?key=YOUR_KEY`
  - 你也可以换成“卡通风”的 style URL（MapTiler/Mapbox 都有现成模板）

### B) Turnstile（Cloudflare）
- 创建一个 Turnstile Site
- 取到：
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  - `TURNSTILE_SECRET_KEY`

### C) Supabase
1) 新建项目后，在 SQL Editor 运行：`supabase/schema.sql`
2) 在 Settings → API 找到：
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`（仅放服务端环境变量；不要暴露到浏览器）

### D) 邀请码（可撤销）
本项目默认：**公开可浏览，但只有拿到邀请码的人才能新增/编辑**。

1) 生成一个你想发给朋友的邀请码（任意字符串）
2) 在本地终端计算 sha256（两种方式任选一种）：
```bash
# 方式1（推荐）：项目自带脚本
npm run invite:hash -- "把这里换成你的邀请码"

# 方式2：直接 node 命令
node -e "console.log(require('crypto').createHash('sha256').update('把这里换成你的邀请码').digest('hex'))"
```
3) 把输出的 hash 插入 Supabase：
```sql
insert into public.invite_codes(code_hash, label) values ('上一步输出的hash', '给谁用/备注');
```
撤销邀请码：
```sql
update public.invite_codes set revoked=true, revoked_at=now() where code_hash='要撤销的hash';
```

## 2. 本地运行
```bash
cd cartoon-food-map
# 已附带一个可直接编辑的 .env.local（里面是占位符），你也可以用下面命令重新生成：
# cp .env.example .env.local
npm install
npm run dev
```
打开 http://localhost:3000

## 3. 部署到 Vercel
1) 把这个目录推到 GitHub（或直接 Import）
2) Vercel → New Project → 选择仓库
3) 在 Vercel Project Settings → Environment Variables 配好 `.env.example` 里的变量
4) Deploy

## 4. 使用说明
- 点击地图任意位置：会把点击坐标写入表单
- 填写邀请码 + 信息 + 通过验证码：点击“保存”
- 点击地图上的标记：进入编辑

### 不上传照片也能“建房子”
在表单里按“三段式”的思路填写关键词，并点击“生成房子方案”。当前版本是规则驱动建议器（后续可替换成真正的 agent/LLM）。

推荐填写结构（你选择了：保留前两项 + 选项1门头材质 + 选项2色彩灯光）：
1) 氛围：复古/温暖/安静/夜晚/酷…
2) 标志元素：红灯笼/绿植/暖黄灯/海报墙/吧台…
3) 门头与材质：中式牌匾/霓虹灯牌/手写黑板；木/砖/玻璃；拱门/落地窗/外摆…
4) 色彩与灯光：奶油白/墨绿/酒红/黑金；暖黄/冷白/霓虹粉蓝；夜晚发光…

## 5. 后续增强（建议）
- 图片上传：Supabase Storage + `/api/upload`（同样走 Turnstile）
- 修改历史/回滚：读取 `edits` 表做一个管理员面板
- 更强防刷：IP 限流 + 黑名单 + “只允许新增/审核后公开”
