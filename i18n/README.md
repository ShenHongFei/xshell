# xshell/i18n

## TL;DR
```shell
npm install xshell
```

```typescript
import I18N from 'xshell/i18n'

const i18n = new I18N({
    '你好，世界！': {
        en: 'Hello, world!',
        ja: 'こんにちは世界！',
        ko: '안녕하세요！'
    }
}, /* 浏览器中可不传，会自动判断 */ 'ja')

console.log(i18n.t('你好，世界！'))
```

## 功能
- 动态翻译字段: `i18n.r(field)`

- 静态翻译文本: `i18n.t('文本')`

- 作为 NodeJS 中间件处理请求 (Koa, Express, Egg.js, ...)，解析语言，提供 request scope 的翻译函数

- React Trans 组件:
```html
<Trans count={count} tOptions={{ context: 'asdf' }}>
    Hello <strong title="this is your name">{{name}}</strong>, you have {{count}} unread message(s). <a href="/msgs">Go to messages</a>.
</Trans>
```

- 扫描代码中的词条: `i18n-scan -i "src/**/*.{ts,tsx,js,jsx,ejs}"`

- 自动标记中文词条


## 特性
- 基于 i18next, react-i18next 封装，支持单复数，context, 变量插值 等

- 按照一定的优先级自动解析用户首选语言和国内／国际来源，可同时在浏览器环境和 NodeJS 中使用

- 翻译语言缺失自动 fallback: ja/ko -> en -> zh -> key

- 可手工编辑的词典文件格式

## API
```typescript
class I18N {
    /** (ISO 639-1 标准语言代码) 可能取 zh, en, ja, ko */
    language: 'zh' | 'en' | 'ja' | 'ko'
    
    /** 标记静态文本，以便扫描词条，并在运行时根据当前语言获取翻译 */
    t : (text: string, options?: { language?: Language, context?: string, count?: number, [key: string]: any }) => string
    
    /** render: 翻译配置字段 */
    r : (field: Item | undefined | null) => string
    
    /** hostname shortcuts */
    hosts: Hosts
    
    /** url prefix shortcuts */
    roots: Roots
}

/** 配置字段 */
interface Item {
    zh?: string
    en?: string
    ja?: string
    ko?: string
}
```

## 使用方法
### 一、NodeJS 中使用
```typescript
const _dict = require('<project>/i18n/dict.json')  // 项目词典文件

new I18N(_dict, 'en')
```


### 二、浏览器中使用
```typescript
import { I18N, Trans } from 'xshell/i18n'
import _dict from '<project>/i18n/dict.json'  // 项目词典文件

export let i18n = new I18N(_dict /* , language 浏览器中可不传 language 参数，会自动判断 */)

const { t, r, Trans, intl } = i18n

// 可用于判断是否为国际站
i18n.intl === true

i18n.t('文本') === t('文本') === '文本翻译'

i18n.language = 'en'  // 所有方法已绑定在 i18n 上，修改语言后函数会使用新设置的语言
t('文本')  === '根据新的 i18n.language 翻译'


// 高级用法
// 单复数
t('共有 {{count}} 个人', { context: 'button', count: 3 })

// 变量插值
t('{{minutes}}分 {{seconds}}秒 内完成支付', { minutes: 3, seconds: 40 })


// 翻译特定格式的配置字段
if (obj === { zh: '中文', en: 'english', ja: '日本語', ko: '...' })
    i18n.r(obj) === '根据 i18n.language 输出翻译结果'
```


#### Trans 组件
```jsx
import { I18N, Trans } from 'xshell/i18n'

// import _dict from '<project>/i18n/dict.json'
const _dict = {
    "阅读更多": {
        "en": "Read more",
        "ja": "もっとご覧になる",
        "ko": "더 읽어보기"
    },
    "',\",<,>为非法字符,请重新输入!": {
        "en": ", \", <, and > are invalid characters. Please enter again.",
    },
    "书": {
        "ja": "{{count}}冊の本",
        "en": "{{count}} book",
    },
    "书_plural": {
        "en": "{{count}} books",
    },
    "test_key": {
        "en": "Hello <1>{{name}}</1>, you have {{count}} unread message. <5>Go to message</5>.",
        "zh": "你好 <1>{{name}}</1>, you have {{count}} unread message. <5>Go to message</5>.",
    },
    "test_key_plural": {
        "en": "Hello <1>{{name}}</1>, you have {{count}} unread messages.  <5>Go to messages</5>.",
    },
}

// init <Trans> by side effects
let i18n = new I18N(_dict)


function TestTrans () {
    const count = 3
    const name  = 'hongfeishen'
    
    return (<div>
        <Trans count={count} tOptions={{ lng: 'zh' }}>Hello <strong title="this is your name">{{name}}</strong>, you have {{count}} unread message(s). <a href="/msgs">Go to messages</a>.</Trans><br/>
        <Trans>联系我们</Trans><br/>
        <Trans tOptions={{ language: 'ko' }}>阅读更多</Trans><br/>
        <Trans tOptions={{ context: 'pricecenter' }}>阅读更多</Trans><br/>
        <Trans tOptions={{ context: 'pricecenter', lng: 'ja' }}>阅读更多</Trans><br/>
        <Trans count={0}>书</Trans><br/>
        <Trans count={1}>书</Trans><br/>
        <Trans count={2}>书</Trans><br/>
    </div>)
}
```

更多 Trans 组件用法请参考 [react-i18next 文档](https://react.i18next.com/guides/quick-start)


## 词条扫描以及更新翻译的方法
### 整体流程
![xsh-i18n-arch.png](https://cos.shenhongfei.com/assets/xsh-i18n-arch.png)

### 词条标记
#### 词条标记文档  
https://react.i18next.com/guides/quick-start


#### 使用 ESLint 的 fix 功能自动标记代码中的中文词条
```shell
npm i eslint eslint-plugin-i18n --save-dev
```

安装完后在项目的 `.eslintrc.json` 中加入以下配置启用 i18n 规则 (完整配置可参考本项目中的 .eslintrc.json)
```json
{
    "parser": "@typescript-eslint/parser",
    "plugins": [
        ...
        "i18n"
    ],
    "rules": {
        ...
        "i18n/no-chinese-character": "error",
    }
}
```

### 词条扫描
可扫描代码中的 `t` 静态标记以及 `Trans 组件`，支持 .js, .jsx, .ts, .tsx, .ejs 文件

请升级 NodeJS 到最新版本，并确保含有 `Trans 组件` 所在的文件后缀为 `.jsx` 或 `.tsx`，否则 `Trans 组件` 不会被扫描到

### 扫描流程
1. 在项目中安装 xshell 后，会生成 i18n-scan 命令

2. 在项目 package.json 的 scripts 中加入脚本：`"scan": "i18n-scan --input \"src/**/*.{ts,tsx,js,jsx,ejs}\" --output i18n/",`

3. 使用 `npm run scan` 扫描词条，会创建或修改 `./i18n/` 下的:  
   ① `scanneds.json` 代码中扫描到的词条及其翻译 (仅本次 --input 所包含代码中的词条及翻译)  
   ② `dict.json` 完整的词典文件 (历史所有词条词条及翻译，会被打包到代码中在运行时决定词条翻译)  

4. 补齐 `scanneds.json` 中的翻译

5. 通过以上 `"4."` 步骤补充翻译后重新运行扫描 `npm run scan`，这次扫描会自动根据 `scanneds.json` 更新 `dict.json`。最终构建时 `dict.json` 内的词条会被打包进 js, 通过 `new I18N(<dict.json>)` 或 `i18n.init(<dict.json>)` 加载

![xsh-i18n-scan.png](https://cos.shenhongfei.com/assets/xsh-i18n-scan.png)


### 词典文件 dict.json 格式
新增词条可在文件尾部加入，已有词条可直接补充翻译
```ts
{
    // 词条 key
    "已有词条": {
        "zh": "xxxxx", // 一般不需要设置中文翻译，默认为词条 key 使用中文
        // 在此加入 "en" 和 "ja" 等翻译，暂时没有对应语言的词条可跳过，无需设置空字符串
    },
    
    ...
    
    "阅读更多": {
        "en": "Read more",
        "ja": "もっとご覧になる",
        "ko": "더 읽어보기"
    },
    
    ...
    
    // _plural 后缀表示单复数形式, 用来区分相同短语的单复数形式，并通过 i18n.t('书', { count: 3 }) 调用自动选择正确的单复数形式
    "书": {
        "ja": "{{count}}冊の本",
        "en": "{{count}} book",
    },
    "书_plural": {
        "en": "{{count}} books",
    },
    
    ...
    
    // _button 后缀表示 context, 用来区分相同中文短语的不同使用场合的词条，并通过 i18n.t('提交', { context: 'button' }) 调用选择正确的翻译
    "提交_button": {
        "ja": "",
        "en": "{{count}} book",
    },
    "提交": {
        "ja": "{{count}}冊の本",
        "en": "{{count}} book",
    },
}

```

## Runtime Dependencies
- i18next
- js-cookie
- qs
- 使用 Trans 组件时
    - react
    - react-i18next


## 作者
ShenHongFei (沈鸿飞)

