import qs from 'qs'
import Cookies from 'js-cookie'
import i18next from 'i18next'
import type { i18n as I18Next } from 'i18next'
import type { Trans } from 'react-i18next'

import { Dict } from './dict'
import type { _Dict, Item } from './dict'


export type Language = 'zh' | 'en' | 'ja' | 'ko'

export const LANGUAGES = ['zh', 'en', 'ja', 'ko'] as const

declare global {
    interface Window {
        language: Language
    }
}


/**
    提供翻译文本功能，在浏览器环境下自动解析当前语言、国际/国内用户
    @see https://github.com/ShenHongFei/xshell/tree/master/i18n
*/
export class I18N {
    static LANGUAGE_REGEXP = /^(zh|en|ja|jp|ko)$/
    
    
    /** (ISO 639-1 标准语言代码) 可能取 zh, en, ja, ko */
    language: Language
    
    /** hostname shortcuts */
    hosts: Hosts
    
    /** url prefix shortcuts */
    roots: Roots
    
    /** 标记静态文本，以便扫描词条，并在运行时根据当前语言获取翻译 */
    t : (text: string, options?: { language?: Language, context?: string, count?: number, [key: string]: any }) => string
    
    /** render: 翻译配置字段 */
    r : (field: Item | undefined | null) => string
    
    i18next: I18Next
    
    /** react-i18next <Trans/> 组件 */
    Trans: typeof Trans = ({ children }) => children as any
    
    
    /** ```ts
        import dict from './dict.json'  // { "添加": { "en": "Add", "ja": "追加", "ko": "추가" } }
        
        const i18n = new I18N(dict, 'zh')  // 创建实例，传入词典 dict 并指定语言（NodeJS 环境），
        const i18n = new I18N(dict)        // 创建实例，传入词典 dict 并自动判断当前语言（浏览器环境），
        const i18n = new I18N({ })         // 创建实例，传入空词典
        ```
        @see https://github.com/ShenHongFei/xshell/tree/master/i18n
    */
    constructor (_dict: _Dict, language?: Language) {
        const is_browser = typeof document !== 'undefined' && typeof window !== 'undefined'
        
        const dict = new Dict(_dict)
        
        // --- if in bowser then detect language & intl
        if (is_browser) {
            const { search = '' } = document.location || { }
            const queries = qs.parse(search, { ignoreQueryPrefix: true })
            
            if (!language) {
                const lquery   = queries.language as string  // 暂时不考虑是数组的情况
                const lwindow  = window.language
                const lbrowser = typeof navigator !== 'undefined' && navigator.language.slice(0, 2)
                
                language = (lquery || lwindow || Cookies.get('language') || lbrowser || 'en') as Language
            }
            
            if (!I18N.LANGUAGE_REGEXP.test(language))
                language = 'en'
            
            // console.log(`language = ${language}`)
        }
        
        language ||= 'en'
        
        this.language = language
        
        this.t = (text, options) => {
            options = options || { }
            
            const language = options.language || this.language
            
            return this.i18next.t(text, { ...options, lng: language, defaultValue: text })
        }
        
        this.r = (field) => 
            field ?
                field[this.language] || field.en || field.zh || field as any || ''
            :
                field || ''
        
        // --- init i18next
        this.i18next = i18next.createInstance()
        
        if (is_browser)
            try {
                // 在无 React 的浏览器环境下避免 react-i18next 中执行 React.createContext() 报错
                // const React = require('react') as typeof import('react')
                const { initReactI18next, Trans: I18NextTrans } = require('react-i18next') as typeof import('react-i18next')
                this.i18next.use(initReactI18next)
                const _i18next = this.i18next
                // 绑定 Trans 组件的 i18n 到 this.i18next, 解决多个 i18next 冲突的问题
                // react-i18next/context.js 中 i18n 实例只在模块级别维护，多次 this.i18next.use(initReactI18next) 会覆盖前面的 i18n，导致 Trans 无法翻译
                // https://github.com/i18next/react-i18next/issues/726
                this.Trans = function Trans ({ i18n = _i18next, ...others }) {
                    // 简单转发，性能更好
                    return I18NextTrans({ i18n, ...others })
                    // return React.createElement(I18NextTrans, { i18n, ...others } as any, children)
                    // return <I18NextTrans {...{ i18n, ...others } }>{children}</I18NextTrans>
                }
            } catch { }
        
        this.i18next.init({
            lng: this.language,
            // LOCAL
            // debug: true,
            debug: false,
            fallbackLng: {
                en: ['zh'],
                ja: ['en', 'zh'],
                ko: ['en', 'zh'],
            },
            // 禁用 : 和 . 作为 seperator
            keySeparator: false,
            nsSeparator: false,
            resources: dict.to_resources(),
            interpolation: {
                escapeValue: false
            },
            react: {
                transKeepBasicHtmlNodesFor: []
            },
        })
        
        
        if (typeof window !== 'undefined' && window && !('i18n' in window))
            (window as any).i18n = this
    }
    
    
    /** 加载词典文件 (需要将这两行单独放一个文件里，以保证在 import 其他文件之前执行)  
        
        @example
        import dict from './dict.json'  // { "添加": { "en": "Add", "ja": "追加", "ko": "추가" } }
        i18n.init(dict)
    */
    init (dict: _Dict) {
        Object.entries(
            new Dict(dict).to_resources()
        ).forEach(([language, { translation }]) => {
            this.i18next.addResources(language, 'translation', translation)
        })
    }
    
    toJSON () {
        return {
            language: this.language,
        }
    }
}


export interface Hosts {
    
}


export interface Roots {
    
}

export type { _Dict, Item }

export interface I18NBasic {
    intl: boolean
    language: Language
}

export default I18N
