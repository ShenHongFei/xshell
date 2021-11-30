import { Language } from './index'

export class Dict {
    _dict: _Dict
    
    constructor (_dict: _Dict = {}) {
        this._dict = _dict
    }
    
    get (key: string): Item | undefined
    get (key: string, language: Language): string | ''
    get (key: string, language?: Language) {
        if (!key) return ''
        const item = this._dict[key]
        if (!item || !language) return item || ''
        return item[language] || ''
    }
    
    to_resources () {
        return Object.entries(this._dict).reduce( (acc, [key, item]) => {
            Object.entries(item).forEach( ([ language, translation ]) => {
                if (!translation || !acc[language]) return
                acc[language].translation[key] = translation
            })
            return acc
        }, {
            zh: { translation: { } },
            en: { translation: { } },
            ja: { translation: { } },
            ko: { translation: { } },
        })
    }
}


/** 配置字段 */
export type Item = {
    [language in Language]?: string
}


/** JSON.parse(词典文件.json) 得到的对象 */
export interface _Dict {
    [key: string]: Item
}


export default Dict
