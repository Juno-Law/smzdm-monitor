# 好价监控 · Vue 3 版前端

同一个后端（`../src/server.js`），换掉前端渲染。原生版是 Node 拼 HTML 字符串，这里是 Vite + Vue 3 组件化实现。

## 跑起来

需要两个终端：

```bash
# 1. 后端（在仓库根目录）
node src/server.js          # 占 7788，提供 /api/deals、/api/read、/api/keywords

# 2. 前端（在 web 目录）
npm install
npm run dev                 # 占 5173，/api 已代理到 7788
```

打开 http://localhost:5173。改代码即时热更新，不用重启。

生产构建：`npm run build`，产物在 `dist/`（当前 40KB gzip JS + 6KB CSS）。

## 目录结构

```
web/
├── index.html               挂载点 + favicon + 标题
├── vite.config.js           插件 + /api 代理
└── src/
    ├── main.js              入口，createApp().mount()
    ├── App.vue              根组件：布局、启动加载、轮询
    ├── style.css            Tailwind 引入 + 设计变量 + 全局过渡
    ├── api.js               所有请求集中在这里，组件里不出现 fetch
    ├── utils/format.js      纯函数：拆价格、换高清图、日期分组、来源标签
    ├── stores/deals.js      全局状态 + 派生数据 + 动作（模块级 reactive）
    ├── composables/
    │   └── useToast.js      单例 toast 队列
    └── components/
        ├── AppHeader.vue    顶栏：品牌、视图切换、搜索、按钮
        ├── ViewSwitch.vue   未读/全部 分段控件（滑块动画）
        ├── SearchBox.vue    搜索框（/ 键聚焦）
        ├── KeywordBar.vue   关键词横向筛选
        ├── DealList.vue     列表：骨架屏 / 空状态 / 行分组 / 加载更多
        ├── DealCard.vue     单张卡片
        ├── EmptyState.vue   空状态
        ├── KeywordDialog.vue 关键词编辑弹窗
        └── ToastHost.vue    全局提示
```

## 数据怎么流动

```
api.fetchDeals()                      // 拿到 { baseline, read, items }
      ↓
state.deals / state.readIds           // stores/deals.js 里的 reactive
      ↓  computed
filteredDeals → orderedDeals → rows   // 逐层派生，模板只吃最终结果
      ↓
DealList 里一个 v-for 渲染 rows
```

关键点：**原始数据只存一份，其余全部是 computed**。改了 `state.readIds`，`rows` 自动重算，视图跟着变，不需要手动通知谁。

## 想学 Vue 的话，按这个顺序看

1. **`DealCard.vue`** — `defineProps` / `defineEmits` 的标准用法。卡片只负责显示，标记已读和打开链接都是往上抛事件，不直接改 store。
2. **`ViewSwitch.vue`** — `v-model` 怎么写：`defineProps` 收 `modelValue`，`emit('update:modelValue')` 抛回去。
3. **`SearchBox.vue`** — `defineModel()` 是 v-model 的简写版本（Vue 3.4+），比上面那种少写一半代码。
4. **`stores/deals.js`** — `reactive` + `computed` 的依赖链，以及"乐观更新"：先改本地再发请求。
5. **`useToast.js`** — 为什么 `ref` 写在函数外面：模块作用域 = 全局单例，任意组件拿到的都是同一份。
6. **`KeywordDialog.vue`** — `Teleport` 把弹窗挂到 body，`watch` 处理打开时重置草稿，`<style scoped>` 里写过渡。
7. **`DealList.vue`** — `TransitionGroup` 做列表进出场，`v-if / v-else-if / v-else` 一条链处理骨架屏、空状态、列表。

## 几个刻意的选择

**没有上 Pinia。** 单页面、十来个字段，`reactive` 模块单例就够了。状态库解决的是"跨路由共享 + 调试工具 + 模块拆分"，这里一个都不占。等你有第二个页面了再迁移，`stores/deals.js` 里的代码可以一行行搬。

**没有上 Element Plus / Naive UI。** 那两套是后台管理系统的审美（表格、表单、密集控件），套到电商列表上要写大量 `:deep()` 覆盖样式，比手写还慢。这里用的是 Tailwind 原子类 + 少量自定义 token。

**颜色都在 `style.css` 的 `@theme` 里。** 想换主色只改 `--color-brand` 一处，全站跟着变。

**组件不直接 fetch。** 请求全在 `api.js`，状态全在 `stores/deals.js`，组件只管渲染和抛事件。三层分开，改接口的时候不用翻组件。

## 和原生版的关系

两版共用同一套后端接口和同一份 `data/deals.jsonl`。所以：

- 可以同时开着 http://localhost:7788（原生版）和 http://localhost:5173（Vue 版）对比看
- 在任一边标记已读，另一边刷新后会同步（都写 `data/reads.json`）
