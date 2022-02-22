import '../prototype.js'

import type { Language } from './index.js'
import {
    Dict,
    type Item,
    type _Dict,
} from './dict.js'


/** read write Dict for scanner */
export class RWDict extends Dict {
    /** 更新词条 */
    set_item (key: string, item: Item, { print = true, placeholder = false, overwrite = false, dryrun = false, create = false } = { }) {
        if (!key || !item || typeof item !== 'object') throw new Error('key/item 错误')
        
        if (!item.zh && !item.en && !item.ja && !item.ko) {
            if (placeholder) {
                const empty_item = { en: '', ja: '', ko: '' }
                if (!dryrun && create)
                    this._dict[key] = empty_item
                if (print)
                    console.log(`${'+ '.green + key}: ${JSON.stringify(empty_item)}`)
            } else
                if (print)
                    console.log(`${'! 未翻译：'.red}${key}`)
            
            return
        }
        
        Object.entries(item).forEach( ([language, translation]: [Language, string]) => {
            this.set_translation(key, language, translation, { print, overwrite, dryrun, create })
        })
    }
    
    
    /** 更新词条翻译 */
    set_translation (key: string, language: Language, translation: string, {
        /** 允许新增词条 */
        create = true, 
        /** 允许更新翻译 */
        overwrite = false,
        print = true, 
        placeholder = false, 
        dryrun = false
    } = { }) {
        if (!key || !language) throw new Error('key/language 不能为空')
        if (!translation) return
        
        // --- add item
        let item = this._dict[key]
        
        const id = `(${key.replace(/\n/g, '\\n')}).${language}`
        
        if (!item) {
            if (!create) {
                console.log(`${'+ '.red + id} ${translation.replace(/\n/g, '\\n')}`)
                return
            }
            if (print)
                console.log(`${'+ '.green}${key.replace(/\n/g, '\\n')}`)
                
            item = { }
            
            if (!dryrun)
                this._dict[key] = item
        }
        
        
        // --- update translation
        const _translation = item[language]
        
        
        // add
        if (!_translation) {
            if (print)
                console.log(`${'+ '.green + id}:    ${translation.replace(/\n/g, '\\n')}`)
            if (!dryrun)
                item[language] = translation
            return
        }
        
        // modify
        if (_translation !== translation)
            if (!overwrite) {
                console.error(`${`已存在 ${id} 词条:`.red} ${JSON.stringify(item)}`)
                console.error(`${'M? '.yellow}${_translation.replace(/\n/g, '\\n')} → ${translation.replace(/\n/g, '\\n')}`)
                if (!dryrun)
                    console.error(`如要更新翻译请设置 { overwrite: true }，否则使用 i18n.t('text', { context: 'xxx' }) 标记文本以区分。\n`)
                return
            } else {
                if (print)
                    console.log(`${'M '.yellow}${_translation.replace(/\n/g, '\\n')} → ${translation.replace(/\n/g, '\\n')}`)
                if (!dryrun)
                    item[language] = translation
            }
    }
    
    /** 合并、更新词典  
        print?: true  
        dryrun?: false  
        overwrite?: false  
        create?: true  
    */
    merge (_dict: _Dict, { print = true, overwrite = false, dryrun = false, create = true } = { }) {
        Object.entries(_dict).forEach( ([key, item]) => {
            this.set_item(key, item, { print, overwrite, dryrun, create })
        })
        
        if (dryrun) {
            console.log('dry run completed'.green)
            return
        }
        
        if (print)
            console.log('词典合并完成'.green)
        
        return this
    }
    
    
    
    /** trim?: [true] 是否过滤掉空词条及空翻译 */ 
    to_json (trim: boolean = true) {
        if (trim)
            this._dict = Object.fromEntries(
                (Object.entries(this._dict)
                    .map( ([key, item]) => ([
                        key,
                        Object.fromEntries(
                            Object.entries(item).filter( ([ language, translation ]) => translation )
                        )
                    ])
                    ).filter( ([ key, item ]: [string, Item]) => Object.keys(item).length )
                )
            )
        
        return JSON.stringify(this._dict, null, 4)
    }
}

export default RWDict
