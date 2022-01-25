/** 在浏览器端修改 prototype，需要更加小心 */

declare global {
    interface String {
        readonly width: number
        
        // --- 工具方法
        /** 截取字符串不超过 width 显示宽度的部分，并保留颜色  
            找到并记录能容纳 字符串 + … 的最后一个字符的位置 i_fitted  
                若完整的字符串长度超过 width，返回 slice(0, i_fitted + 1) + …  
                否则                          返回 this  
         */
        truncate (this: string, width: number): string
        
        pad (this: string, width: number, { character, position }?: { character?: string,  position?: 'left' | 'right'}): string
        
        limit (this: string, width: number, { character, position }?: { character?: string,  position?: 'left' | 'right'}): string
        
        to_regx (this: string, preservations?: string, flags?: string): RegExp
        
        /** ```ts
            'g:/acgn/海贼王/[Skytree][海贼王][One_Piece][893][GB_BIG5_JP][X264_AAC][1080P][CRRIP][天空树双语字幕组].mkv'.refmt(  
                '{dirp}/[Skytree][海贼王][{ en_name: \\w+ }][{ episode: \\d+ }][GB_BIG5_JP][{encoding}_AAC][1080P][CRRIP][天空树双语字幕组].{format}',  
                'g:/acgn/海贼王/{episode} {encoding}.{format}',  
                '\\+',  
                'i',  
                (name, value) => name === 'episode'  ?  String(+value + 1)  :  value.toLowerCase()  
            )
            ```
         */
        refmt ( this: string,
            pattern: string,
            
            pattern_: string,
            
            /** `''` 保留的正则表达式字符 */
            preservations?: string,
            
            /** `''` 正则匹配选项 */
            flags?: string,
            
            /** `(name, matched) => matched || ''` placeholder transformer */
            transformer?: (name: string, value: string, placeholders: { [name: string]: string }) => string,
            
            /** `/\{.*?\}/g` */
            pattern_placeholder?: RegExp
            
        ): string
        
        
        /** 字符串模式搜索
            ```ts
            'git+https://github.com/tamino-martinius/node-ts-dedent-123.git'.find(
                '^{protocol:[\\w+]+}://{hostname:[\\w\\.]+}/{username}/{project}-{index:\\d+}.{suffix}', '^', 'i'
            )
            {
                protocol: 'git+https',
                hostname: 'github.com',
                ...
            }
            ```
            
            - preservations?: `''` 保留的正则表达式字符
            - flags?: `''` 正则匹配选项
            - pattern_placeholder?: `/\{.*?\}/g`
        */
        find (this: string,
            
            pattern: string, 
            
            preservations?: string, 
            
            flags?: string, 
            
            pattern_placeholder?: RegExp
        
        ): { [name: string]: string }
        
        
        /** - type?: `'single'` */
        quote (this: string, type?: keyof typeof quotes | 'psh'): string
        
        /** - shape?: `'parenthesis'` */
        bracket (this: string, shape?: keyof typeof brackets): string
        
        surround (this: string, left: string, right?: string): string
        
        surround_tag (this: string, tag_name: string): string
        
        to_lf (this: string): string
        
        to_crlf (this: string): string
        
        /** 'xxx'.replace(/pattern/g, '')  
            如果 pattern 是 string 则在创建 RegExp 时自动加上 flags (默认 'g'), 否则忽略 flags
        */
        rm (this: string, pattern: string | RegExp, flags?: string): string
        
        
        // --- 文本处理
        split_lines (this: string): string[]
        
        trim_doc_comment (this: string): string
        
        split_indent (this: string): { indent: number, text: string }
        
        
        space (this: string): string
        
        to_slash (this: string): string
        
        to_backslash (this: string): string
    }
    
    
    interface Date {
        to_str (this: Date): string
        
        to_date_str (this: Date): string
        
        to_time_str (this: Date): string
    }
    
    
    interface Number {
        to_bin_str (this: number): string
        
        to_hex_str (this: number): string
        
        to_oct_str (this: number): string
    }
    
    
    interface Array<T> {
        indent (this: string[], width: number, c?: string): string[]
        
        // --- 文本处理
        /**
            - trim_line?: `true`
            - rm_empty_lines?: `true`
            - rm_last_empty_lines?: `false`
        */
        trim_lines (this: string[], { trim_line, rm_empty_lines, rm_last_empty_lines }?: { trim_line?: boolean, rm_empty_lines?: boolean, rm_last_empty_lines?: boolean }): string[]
        
        join_lines (): string
    }
}

import byte_size from 'byte-size'
import EmojiRegex from 'emoji-regex'

export const emoji_regex = EmojiRegex()


export function to_method_property_descriptors (methods: { [name: string]: Function }): PropertyDescriptorMap {
    return Object.fromEntries(
        Object.entries(methods)
            .map(([name, value]) => ([name, {
                configurable: true,
                writable: true,
                enumerable: false,
                value,
            } as PropertyDescriptor])
        ))
}


export function to_getter_property_descriptors (getters: { [name: string]: Function }): PropertyDescriptorMap {
    return Object.fromEntries(
        Object.entries(getters)
            .map(([name, get]) => ([name, {
                configurable: true,
                enumerable: false,
                get,
            } as PropertyDescriptor])
        ))
}


export const cjk = '([\u2e80-\u9fff\uf900-\ufaff])'

export const quotes = {
    single:   "'",
    double:   '"',
    backtick: '`',
}

export const brackets = {
    round:  ['(', ')'],
    square: ['[', ']'],
    curly:  ['{', '}'],
    pointy: ['<', '>'],
    corner: ['「', '」'],
    fat:    ['【', '】'],
    tortoise_shell: ['〔', '〕'],
} as const



// ------------------------------------ String.prototype
Object.defineProperties(String.prototype, {
    ... to_getter_property_descriptors({
        width (this: string) {
            const s = this.replace(emoji_regex, '  ')
            let width = 0
            for (let i = 0;  i < s.length;  i++) {
                const code = s.codePointAt(i)
                
                if (
                    (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) ||  // ignore control characters
                    code >= 0x300 && code <= 0x36f  // ignore combining characters
                ) continue
                
                // surrogates
                if (code > 0xFFFF)
                    i++
                
                width += is_codepoint_fullwidth(code) ? 2 : 1
            }
            return width
        }
    }),
    
    
    
    // ------------ 文本处理工具方法
    ... to_method_property_descriptors({
        /** 截取字符串不超过 width 显示宽度的部分，并保留颜色  
            找到并记录能容纳 字符串 + … 的最后一个字符的位置 i_fitted  
              - 若完整的字符串长度超过 width，返回 slice(0, i_fitted + 1) + …  
              - 否则                          返回 this  
         */
        truncate (this: string, width: number) {
            const color_bak = this.startsWith('\u001b') ? this.slice(0, 5) : ''
            if (width <= 2) return this.slice(0, width)
            let i_fitted     = 0
            let fitted_width = 0
            let cur_width    = 0
            for (let i = 0;  i < this.length;  i++) {
                const code = this.codePointAt(i)
                
                if (
                    (code <= 0x1F || (code >= 0x7F && code <= 0x9F)) ||  // Ignore control characters
                    code >= 0x300 && code <= 0x36F  // Ignore combining characters
                ) continue
                
                // surrogates (codepoint 需要用两个 utf-16 编码单位表示，因此这里跳过第二个编码单位，防止重复计算显示宽度)
                if (code > 0xFFFF)
                    i++
                
                const w = is_codepoint_fullwidth(code) ? 2 : 1
                
                if (cur_width + w + 2 <= width) {
                    i_fitted = i
                    fitted_width += w
                }
                
                cur_width += w
                
                if (cur_width > width) {
                    const i_fitted_next = i_fitted + 1
                    const t = this.slice(0, i_fitted_next) + ' '.repeat(width - 2 - fitted_width) + '…' 
                    return color_bak  ?  color_bak + t + '\u001b[39m'  :  t
                }
            }
            return this
        },
        
        
        pad (this: string, width: number, { character = ' ', position = 'right' }: { character?: string,  position?: 'left' | 'right'} = { }) {
            const _width = this.width
            if (_width >=  width) return this
            if (position === 'right') return this + character.repeat( (width - _width) / character.width )
            return character.repeat(width - _width) + this
        },
        
        
        limit (this: string, width: number, { character = ' ', position = 'right' }: { character?: string,  position?: 'left' | 'right'} = { }) {
            return this.pad(width, { character, position }).truncate(width)
        },
        
        
        to_regx (this: string, preservations: string, flags = ''): RegExp {
            const preserved_chars = new Set(preservations)
            const replace_chars: string = Array.prototype.filter.call('|\\{}()[]^$+*?.-', (c: string) => !preserved_chars.has(c))
                .map((c: string) =>
                    c === ']' ? '\\]' : c
                ).join('')
            
            return new RegExp( this.replace(new RegExp(`[${replace_chars}]`, 'g'), '\\$&'),  flags)
        },
        
        
        refmt (this: string, 
            pattern : string,
            pattern_: string,
            preservations: string = '',
            flags = '',
            transformer: (name: string, value: string, placeholders: { [name: string]: string }) => string = (name, value) => value || '',
            pattern_placeholder = /\{.*?\}/g,
        ): string {
            // --- 转换 pattern 为 pattern_regx
            let last_end = 0
            
            // placeholder matched group indexes
            let $placeholders: Record<string, number> = { }
            
            let regx_parts = [ ]
            
            function add_part (left: number, right?: number) {
                const part = pattern.slice(left, right)
                if (part)
                    regx_parts.push(
                        part.to_regx(preservations).source.bracket()
                    )
            }
            
            pattern.replace(pattern_placeholder, ($0, offset) => {
                add_part(last_end, offset)
                last_end = offset + $0.length
                
                const placeholder = $0.slice(1, -1)
                let [placeholder_name, placeholder_pattern] = placeholder.split(':').map(s => s.trim())
                let optional = false
                if (placeholder_name.endsWith('?')) {
                    placeholder_name = placeholder_name.slice(0, -1)
                    optional = true
                }
                $placeholders[placeholder_name] = regx_parts.push(placeholder_pattern ? 
                        `${placeholder_pattern.bracket()}${optional ?  '?' : ''}`
                    :
                        '(.*?)'
                )
                return ''
            })
            
            add_part(last_end)
            
            // 最后一个 (.*?) 改为贪心匹配，满足 .{suffix} 的需要
            regx_parts = regx_parts.filter(part => part)
            if (regx_parts.last === '(.*?)')
                regx_parts[regx_parts.length - 1] = '(.*)'
            
            const pattern_regx = new RegExp(regx_parts.join(''), flags)
            
            
            // --- 根据 pattern_regx 去匹配原有字符串，获取匹配结果，生成 placeholders 词典
            const matches = pattern_regx.exec(this)
            
            if (!matches) return this
            
            const placeholders = Object.fromEntries(
                    Object.entries($placeholders)
                        .map(([name, $i]) => [
                            [name, matches[$i]],
                            [`${name}.before`, matches[$i - 1] || ''],
                            [`${name}.after`,  matches[$i + 1] || ''],
                        ])
                        .flat()
            )
            
            
            // --- 转换 pattern_ 为 replacement_str，如果有 transformer 则在遇到 placeholder 时应用
            last_end = 0
            let replacement_parts = [ ]
            
            pattern_.replace(pattern_placeholder, ($0, offset) => {
                replacement_parts.push(
                    pattern_.slice(last_end, offset)
                )
                last_end = offset + $0.length
                
                const placeholder_name = $0.slice(1, -1)
                
                replacement_parts.push(
                    transformer(placeholder_name, placeholders[placeholder_name], placeholders)
                )
                
                return ''
            })
            replacement_parts.push(
                pattern_.slice(last_end)
            )
            
            return this.replace(pattern_regx, replacement_parts.join(''))
        },
        
        
        find (this: string,
            pattern: string, 
            preservations: string = '', 
            flags = '', 
            pattern_placeholder = /\{.*?\}/g
        ): { [name: string]: string } {
            // --- 转换 pattern 为 pattern_regx
            let last_end = 0
            
            // placeholder matched group index
            let $placeholders: Record<string, number> = { }
            
            let regx_parts = [ ]
            
            function add_part (left: number, right?: number) {
                const part = pattern.slice(left, right)
                if (part)
                    regx_parts.push(
                        part.to_regx(preservations).source.bracket()
                    )
            }
            
            pattern.replace(pattern_placeholder, ($0, offset) => {
                add_part(last_end, offset)
                last_end = offset + $0.length
                
                const placeholder = $0.slice(1, -1)
                let [placeholder_name, placeholder_pattern] = placeholder.split(':').map(s => s.trim())
                let optional = false
                if (placeholder_name.endsWith('?')) {
                    placeholder_name = placeholder_name.slice(0, -1)
                    optional = true
                }
                
                $placeholders[placeholder_name] = regx_parts.push(
                    placeholder_pattern ? 
                        `${placeholder_pattern.bracket()}${optional ?  '?' : ''}`
                    :
                        '(.*?)'
                )
                return ''
            })
            
            add_part(last_end)
            
            // 最后一个 (.*?) 改为贪心匹配，满足 .{suffix} 的需要
            regx_parts = regx_parts.filter(part => part)
            if (regx_parts[ regx_parts.length - 1 ] === '(.*?)')
                regx_parts[regx_parts.length - 1] = '(.*)'
            
            const pattern_regx = new RegExp(regx_parts.join(''), flags)
            
            
            // --- 根据 pattern_regx 去匹配原有字符串，获取匹配结果，生成 placeholders 词典
            const matches = pattern_regx.exec(this)
            
            if (!matches) return { }
            
            return Object.fromEntries(
                Object.entries($placeholders)
                    .map(([name, $i]) => 
                        [name, matches[$i] || '']
                    )
            )
        },
        
        quote (this: string, type: keyof typeof quotes | 'psh' = 'single') {
            if (type === 'psh') return '& ' + this.quote()
            return this.surround(quotes[type])
        },
        
        
        bracket (this: string, shape: keyof typeof brackets = 'round') {
            return this.surround(...brackets[shape] as [string, string])
        },
        
        
        surround (this: string, left: string, right?: string) {
            return left + this + (right || left)
        },
        
        surround_tag (this: string, tag_name: string): string {
            return '<' + tag_name + '>' + this + '</' + tag_name + '>'
        },
        
        
        to_lf (this: string) {
            return this.replace(/\r\n/g, '\n')
        },
        
        
        to_crlf (this: string) {
            return this.replace(/\n/g, '\r\n')
        },
        
        
        rm (this: string, pattern: string | RegExp, flags: string = 'g') {
            if (typeof pattern === 'string')
                pattern = new RegExp(pattern, flags)
            
            return this.replace(pattern, '')
        },
        
        
        split_lines (this: string, delimiter: string | RegExp = /\r?\n/) {
            let lines = this.split(delimiter)
            if (lines.last === '')
                lines.pop()
            return lines
        },
        
        
        split_indent (this: string): { indent: number, text: string } {
            let i = 0
            let indent = 0
            for (;  i < this.length;  i++)
                if (this[i] === ' ')
                    indent += 1
                else if (this[i] === '\t')
                    indent += 4
                else
                    break
            
            return {
                indent,
                text: this.slice(i)
            }
        },
        
        
        space (this: string) {
            if (!this) return this
            let text_: string
            text_ = this
                .replace(new RegExp(cjk + `(['"])`, 'g'), '$1 $2')
                .replace(new RegExp(`(['"])` + cjk, 'g'), '$1 $2')
                
                .replace(/(["']+)\s*(.+?)\s*(["']+)/g, '$1$2$3')
                
                .replace(new RegExp(cjk + '([\\+\\-\\*\\/=&\\\\\\|<>])([A-Za-z0-9])', 'g'), '$1 $2 $3')
                .replace(new RegExp('([A-Za-z0-9])([\\+\\-\\*\\/=&\\\\\\|<>])' + cjk, 'g'), '$1 $2 $3')
                
            const textBak = text_
            
            text_ = text_.replace(new RegExp(cjk + '([\\(\\[\\{<\u201c]+(.*?)[\\)\\]\\}>\u201d]+)' + cjk, 'g'), '$1 $2 $4')
            
            if (text_ === textBak)
                text_ = text_
                    .replace(new RegExp(cjk + '([\\(\\[\\{<\u201c>])', 'g'), '$1 $2')
                    .replace(new RegExp('([\\)\\]\\}>\u201d<])' + cjk, 'g'), '$1 $2')
            
            return text_
                // eslint-disable-next-line no-useless-escape
                .replace(/([\(\[\{<\u201c]+)(\s*)(.+?)(\s*)([\)\]\}>\u201d]+)/g, '$1$3$5')
                .replace(new RegExp(cjk + '([~!;:,\\.\\?\u2026])([A-Za-z0-9])', 'g'), '$1$2 $3')
                .replace(new RegExp(cjk + '([A-Za-z0-9`\\$%\\^&\\*\\-=\\+\\\\\\|\\/@\u00a1-\u00ff\u2022\u2027\u2150-\u218f])', 'g'), '$1 $2')
                .replace(new RegExp('([A-Za-z0-9`\\$%\\^&\\*\\-=\\+\\\\\\|\\/@\u00a1-\u00ff\u2022\u2027\u2150-\u218f])' + cjk, 'g'), '$1 $2')
        },
        
        to_slash (this: string) {
            return this.replaceAll('\\', '/')
        },
        
        to_backslash (this: string) {
            return this.replaceAll('/', '\\')
        },
    }),
})


// ------------------------------------ Date.prototype
Object.defineProperties(Date.prototype, to_method_property_descriptors({
    to_str (this: Date) {
        const [ampm, hour] = (() => {
            let hour = this.getHours()
            if (hour <= 6)
                return ['凌晨', hour]
            
            if (hour <= 8)
                return ['清晨', hour]
                
            if (hour <= 9)
                return ['早上', hour]
                
            if (hour <= 10)
                return ['上午', hour]
                
            if (hour <= 12)
                return ['中午', hour]
                
            hour -= 12
            
            if (hour <= 5)
                return ['下午', hour]
                
            if (hour <= 10)
                return ['晚上', hour]
                
            return ['深夜', hour]
        })()
        
        
        return '' +
            // year.month.date
            `${this.getFullYear()}.${String(this.getMonth() + 1).pad(2, { character: '0', position: 'left' })}.${String(this.getDate()).pad(2, { character: '0', position: 'left' })} ` +
            // 上午 10:03:02
            `${ampm} ${String(hour).pad(2, { character: '0', position: 'left' })}:${String(this.getMinutes()).pad(2, { character: '0', position: 'left' })}:${String(this.getSeconds()).pad(2, { character: '0', position: 'left' })}`
    },
    
    to_date_str (this: Date) {
        return this.to_str().split(' ')[0]
    },
    
    to_time_str (this: Date) {
        const [, ampm, time ] = this.to_str().split(' ')
        return `${ampm} ${time}`
    },
}))



// ------------------------------------ Number.prototype
Object.defineProperties(Number.prototype, to_method_property_descriptors({
    to_fsize_str (this: number, units: 'iec' | 'metric' = 'iec') {
        const { value, unit } = byte_size(this, { units })
        return `${value} ${unit.replace('i', '')}`
    },
    
    to_bin_str (this: number) {
        return `0b${this.toString(2)}`
    },
    
    to_hex_str (this: number, length?: number) {
        const s = this.toString(16)
        // 长度自动对齐到 4 的倍数
        if (!length)
            length = Math.ceil(s.length / 4) * 4
        return `0x${'0'.repeat(length - s.length)}${s}`
    },
    
    to_oct_str (this: number) {
        return `0o${this.toString(8)}`
    },
}))



// ------------------------------------ Array.prototype
Object.defineProperties(Array.prototype, {
    // --- 文本处理工具方法
    ... to_method_property_descriptors({
        trim_lines (this: string[], { trim_line = true, rm_empty_lines = true, rm_last_empty_lines = false }: { trim_line?: boolean, rm_empty_lines?: boolean, rm_last_empty_lines?: boolean } = { }) {
            if (!this.length) return this
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            let lines = this
            
            if (trim_line)
                lines = lines.map(line => line.trim())
            
            if (rm_empty_lines)
                return lines.filter( line => line )
            
            if (rm_last_empty_lines) {
                lines.reverse()
                const i_not_empty = lines.findIndex( line => line )
                if (i_not_empty !== -1)
                    lines = lines.slice(i_not_empty)
                lines.reverse()
                return lines
            }
            
            return lines
        },
        
        
        indent (this: string[], width?: number, character: string = ' ') {
            return this.map(line => 
                character.repeat(width) + line
            )
        },
        
        
        join_lines (this: string[], append = true) {
            return `${this.join('\n')}${append ? '\n' : ''}`
        }
    })
})


export function to_json (object: any, replacer?: any) {
    return JSON.stringify(object, replacer, 4)
}

export function is_codepoint_fullwidth (codepoint: number) {
    // Code points are derived from:
    // http://www.unix.org/Public/UNIDATA/EastAsianWidth.txt
    return (
        !Number.isNaN(codepoint) &&
        codepoint >= 0x1100 &&
        (
            codepoint <= 0x115F || // Hangul Jamo
            
            codepoint === 0x2026 ||  // …
            codepoint === 0x203B ||  // ※
            
            // arrows
            (0x2190 <= codepoint && codepoint <= 0x21ff) ||
            
            codepoint === 0x2329 || // left-pointing angle bracket
            codepoint === 0x232a || // right-pointing angle bracket
            
            // ①
            (0x2460 <= codepoint && codepoint <= 0x24ff) ||
            
            // box drawing
            (0x2500 <= codepoint && codepoint <= 0x257f) ||
            
            // shapes, symbols, …
            (0x2580 <= codepoint && codepoint <= 0x2bef) ||
            
            // cjk radicals supplement .. enclosed cjk letters and months
            (0x2e80 <= codepoint && codepoint <= 0x3247 && codepoint !== 0x303f) ||
            
            // enclosed cjk letters and months .. cjk unified ideographs extension a
            (0x3250 <= codepoint && codepoint <= 0x4dbf) ||
            
            // cjk unified ideographs .. yi radicals
            (0x4e00 <= codepoint && codepoint <= 0xa4c6) ||
            
            // hangul jamo extended-a
            (0xa960 <= codepoint && codepoint <= 0xa97c) ||
            
            // hangul syllables
            (0xac00 <= codepoint && codepoint <= 0xd7a3) ||
            
            // cjk compatibility ideographs
            (0xf900 <= codepoint && codepoint <= 0xfaff) ||
            
            // vertical forms
            (0xfe10 <= codepoint && codepoint <= 0xfe19) ||
            
            // cjk compatibility forms .. small form variants
            (0xfe30 <= codepoint && codepoint <= 0xfe6b) ||
            
            // halfwidth and fullwidth forms
            (0xff01 <= codepoint && codepoint <= 0xff60) ||
            (0xffe0 <= codepoint && codepoint <= 0xffe6) ||
            
            // kana supplement
            (0x1b000 <= codepoint && codepoint <= 0x1b001) ||
            
            // enclosed ideographic supplement
            (0x1f200 <= codepoint && codepoint <= 0x1f251) ||
            
            // cjk unified ideographs extension b .. tertiary ideographic plane
            (0x20000 <= codepoint && codepoint <= 0x3fffd)
        )
    )
}



