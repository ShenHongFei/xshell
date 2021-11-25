declare global {
    interface String {
        readonly width: number
        
        // --- util methods
        /** truncate string with fixed width and preserve color */
        truncate (this: string, width: number): string
        
        /** pad string to `<width>`  
            - character?: `' '`
            - position?: `'right'`
         */
        pad (this: string, width: number, { character, position }?: { character?: string,  position?: 'left' | 'right'}): string
        
        limit (this: string, width: number, { character, position }?: { character?: string,  position?: 'left' | 'right'}): string
        
        to_regx (this: string, preservations?: string, flags?: string): RegExp
        
        to_bool (this: string): boolean
        
        /** string pattern replacement
            - pattern: pattern of matched string part
            - pattern_: pattern of target string part
            - preservations?: `''` preserved regexp characters
            - flags?: `''` regexp flags
            - transformer?: `(name, matched) => matched || ''` placeholder transformer
            - pattern_placeholder?: `/\{.*?\}/g`
            
            ```ts
            'g:/acgn/海贼王/[Skytree][海贼王][One_Piece][893][GB_BIG5_JP][X264_AAC][1080P][CRRIP][天空树双语字幕组].mkv'.reformat(  
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
            
            preservations?: string,
            
            flags?: string,
            
            transformer?: (name: string, value: string, placeholders: { [name: string]: string }) => string,
            
            pattern_placeholder?: RegExp
            
        ): string
        
        
        /** string pattern match
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
            
            - preservations?: `''` preserved regexp characters
            - flags?: `''` regexp flags
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
            if pattern is string then RegExp will add flags (default 'g'), else ignore flags
        */
        rm (this: string, pattern: string | RegExp, flags?: string): string
        
        
        // --- chalk colors
        readonly red: string
        readonly red_: string
        
        readonly green: string
        readonly green_: string
        
        readonly yellow: string
        readonly yellow_: string
        
        readonly blue: string
        readonly blue_: string
        
        readonly magenta: string
        readonly magenta_: string
        
        readonly cyan: string
        readonly cyan_: string
        
        readonly grey: string
        
        readonly underline: string
        
        strip_ansi (this: string): string
        
        
        // --- text processing
        /** split string to lines and strip last '' after last \n */
        split_lines (this: string): string[]
        
        trim_doc_comment (this: string): string
        
        split_indent (this: string): { indent: number, text: string }
        
        
        to_base64 (this: string): string
        
        /** - buffer: `false` return raw Buffer */
        decode_base64 (this: string): string
        decode_base64 (this: string, buffer: true): Buffer
        decode_base64 (this: string, buffer?: boolean): string | Buffer
        
        
        space (this: string): string
        
        
        // --- path ops
        fdir: string
        
        /** path.basename, e.g.  
            - D:/0/aaa.txt -> aaa.txt
            - D:/aaa/ -> aaa
        */
        fname: string
        
        /** .txt */
        fext: string
        
        /** fs.existsSync */
        fexists: boolean
        
        is_dir: boolean
        
        to_slash (this: string): string
        
        to_backslash (this: string): string
    }
    
    
    interface Date {
        /** - ms?: `false` show ms */
        to_str (this: Date, ms?: boolean): string
        
        to_date_str (this: Date): string
        
        to_time_str (this: Date): string
    }
    
    
    interface Number {
        /** 12.4 KB (1 KB = 1024 B) */
        to_fsize_str (this: number, units?: 'iec' | 'metric'): string
        
        
        to_bin_str (this: number): string
        
        to_hex_str (this: number, length?: number): string
        
        to_oct_str (this: number): string
    }
    
    
    interface Array<T> {
        last: T
        
        log (this: string[], limit?: number): void
        
        indent (this: string[], width: number, c?: string): string[]
        
        indent2to4 (this: string[]): string[]
        
        
        // --- text processing
        /**
            - trim_line?: `true`
            - rm_empty_lines?: `true`
            - rm_last_empty_lines?: `false`
        */
        trim_lines (this: string[], { trim_line, rm_empty_lines, rm_last_empty_lines }?: { trim_line?: boolean, rm_empty_lines?: boolean, rm_last_empty_lines?: boolean }): string[]
        
        trim_license (this: string[]): string[]
        
        split_indents (this: string[]): { indent: number, text: string }[]
        
        join_lines (): string
    }
}


import fs from 'fs'

import path from 'upath'
// @ts-ignore
import byte_size from 'byte-size'

import EmojiRegex from 'emoji-regex'

import strip_ansi from 'strip-ansi'
import chalk from 'chalk'

export const emoji_regex = EmojiRegex()

export { chalk }


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
    single:     "'",
    double:     '"',
    backtick:   '`',
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

const color_map = Object.fromEntries(
    ['red_', 'green_', 'yellow_', 'blue_', 'magenta_', 'cyan_'].map(color =>
        [color, `${color.slice(0, -1)}Bright`])
)

// ------------------------------------ String.prototype
Object.defineProperties(String.prototype, {
    ... to_getter_property_descriptors({
        width (this: string) {
            const s = strip_ansi(
                this.replace(emoji_regex, '  ')
            )
            let width = 0
            for (let i = 0;  i < s.length;  i++) {
                const code = s.codePointAt(i)
                
                if (
                    (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) ||  // ignore control characters
                    code >= 0x300 && code <= 0x36f  // ignore combining characters
                ) continue
                
                // surrogates
                if (code > 0xffff)
                    i++
                
                width += is_codepoint_fullwidth(code) ? 2 : 1
            }
            return width
        }
    }),
    
    
    // ------------ text processing utils
    ... to_method_property_descriptors({
        /** truncate string with fixed width and preserve color */
        truncate (this: string, width: number) {
            const color_bak = this.startsWith('\u001b') ? this.slice(0, 5) : ''
            const s = strip_ansi(this)
            if (width <= 2) return this.slice(0, width)
            let i_fitted     = 0
            let fitted_width = 0
            let cur_width    = 0
            for (let i = 0;  i < s.length;  i++) {
                const code = s.codePointAt(i)
                
                if (
                    (code <= 0x1F || (code >= 0x7F && code <= 0x9F)) ||  // Ignore control characters
                    code >= 0x300 && code <= 0x36F  // Ignore combining characters
                ) continue
                
                // surrogates (codepoint need two utf-16 encoding units, thus here skip the first in order to prevent repeated counting) 
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
                    const t = s.slice(0, i_fitted_next) + ' '.repeat(width - 2 - fitted_width) + '…' 
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
        
        
        to_bool (this: string) {
            return this.length && this !== '0' && this.toLowerCase() !== 'false'
        },
        
        refmt (this: string, 
            pattern : string,
            pattern_: string,
            preservations: string = '',
            flags = '',
            transformer: (name: string, value: string, placeholders: { [name: string]: string }) => string = (name, value) => value || '',
            pattern_placeholder = /\{.*?\}/g,
        ): string {
            // --- convert pattern to pattern_regx
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
                $placeholders[placeholder_name] = regx_parts.push(
                    placeholder_pattern ? 
                        `${placeholder_pattern.bracket()}${optional ?  '?' : ''}`
                    :
                        '(.*?)'
                )
                return ''
            })
            
            add_part(last_end)
            
            // modify last (.*?) to greedy in order to satisfy the situation of .{suffix}
            regx_parts = regx_parts.filter(part => part)
            if (regx_parts.last === '(.*?)')
                regx_parts[regx_parts.length - 1] = '(.*)'
            
            const pattern_regx = new RegExp(regx_parts.join(''), flags)
            
            
            // --- match original string based on pattern_regx, and get result to build placeholders dict
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
            
            
            // --- convert pattern_ to replacement_str, if transformer exists then apply on placeholder
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
            // --- convert pattern to pattern_regx
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
            
            // convert last (.*?) to greedy, to make .{suffix} work
            regx_parts = regx_parts.filter(part => part)
            if (regx_parts[regx_parts.length - 1] === '(.*?)')
                regx_parts[regx_parts.length - 1] = '(.*)'
            
            const pattern_regx = new RegExp(regx_parts.join(''), flags)
            
            
            // --- match original string based on pattern_regx, and get result to build placeholders dict
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
            if (type === 'psh')
                return `& ${this.quote()}`
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
        
        
        trim_doc_comment (this: string) {
            return '/** ' + this.slice(3, -2).replace(/\s*\*\s*/g, '  ').replace(/@(param|params|return) \{.*?\}\s*/g, '').trim() + ' */'
        },
        
        
        to_base64 (this: string) {
            return Buffer.from(this).toString('base64')
        },
        
        
        decode_base64 (this: string, buffer = false) {
            const buf = Buffer.from(this, 'base64')
            if (buffer)
                return buf
            return buf.toString()
        },
        
        
        strip_ansi (this: string) {
            return strip_ansi(this)
        },
        
        
        space (this: string) {
            if (!this) return this
            let text_: string
            text_ = this
                .replace(new RegExp(cjk + `(['"])`, 'g'), '$1 $2')
                .replace(new RegExp(`(['"])` + cjk, 'g'), '$1 $2')
                
                .replace(/(["']+)\s*(.+?)\s*(["']+)/g, '$1$2$3')
                
                .replace(new RegExp(cjk + '([\\+\\-\\*\\/=&\\\\\\|<>])([A-Za-z0-9])', 'g'), '$1 $2 $3')
                .replace(new RegExp('([A-Za-z0-9])([\\+\\-\\*\\/=&\\\\\\|<>])' + cjk, 'g'), '$1 $2 $3')
                
            const textBak = text_
            
            text_ = text_.replace(new RegExp(cjk + '([\\(\\[\\{<\u201c]+(.*?)[\\)\\]\\}>\u201d]+)' + cjk, 'g'), '$1 $2 $4')
            
            if (text_ === textBak)
                text_ = text_
                    .replace(new RegExp(cjk + '([\\(\\[\\{<\u201c>])', 'g'), '$1 $2')
                    .replace(new RegExp('([\\)\\]\\}>\u201d<])' + cjk, 'g'), '$1 $2')
            
            return text_
                // eslint-disable-next-line no-useless-escape
                .replace(/([\(\[\{<\u201c]+)(\s*)(.+?)(\s*)([\)\]\}>\u201d]+)/g, '$1$3$5')
                .replace(new RegExp(cjk + '([~!;:,\\.\\?\u2026])([A-Za-z0-9])', 'g'), '$1$2 $3')
                .replace(new RegExp(cjk + '([A-Za-z0-9`\\$%\\^&\\*\\-=\\+\\\\\\|\\/@\u00a1-\u00ff\u2022\u2027\u2150-\u218f])', 'g'), '$1 $2')
                .replace(new RegExp('([A-Za-z0-9`\\$%\\^&\\*\\-=\\+\\\\\\|\\/@\u00a1-\u00ff\u2022\u2027\u2150-\u218f])' + cjk, 'g'), '$1 $2')
        }
    }),
    
    
    // ------------ chalk colors
    ... Object.fromEntries(
        [
            'red',  'green',  'yellow',  'blue',  'magenta',  'cyan',  'grey', 
            'red_', 'green_', 'yellow_', 'blue_', 'magenta_', 'cyan_',
            'underline',
        ].map(color =>
            ([color, {
                configurable: true,
                get (this: string) {
                    return chalk[color_map[color] || color](this)
                }
            }]))
        ),
    
    
    // ------------ file path ops
    ... to_getter_property_descriptors({
        fdir (this: string) {
            const dir = path.dirname(this)
            return dir.endsWith('/') ? dir : `${dir}/`
        },
        
        fname (this: string) {
            return path.basename(this)
        },
        
        fext (this: string) {
            return path.extname(this)
        },
        
        fexists (this: string) {
            return fs.existsSync(this)
        },
        
        is_dir (this: string) {
            if (this.endsWith('/')) return true
            try {
                return fs.lstatSync(this).isDirectory()
            } catch (error) {
                return false
            }
        },
    }),
    
    ... to_method_property_descriptors({
        to_slash (this: string) {
            if (!this) return this
            return path.normalizeSafe(this)
        },
        
        to_backslash (this: string) {
            return this.replaceAll('/', '\\')
        },
    })
})


// ------------------------------------ Date.prototype
Object.defineProperties(Date.prototype, to_method_property_descriptors({
    to_str (this: Date, ms = false) {
        return this.toLocaleString().replace(/(\d+)\/(\d+)\/(\d+) ?(上午|下午)(\d+):(\d{2}):(\d{2}).*/, (matches, year, month, day, ampm, hour, minute, second) => {
            hour = Number(hour)
            if (ampm === '上午' && hour === 12) {
                hour = 0
                ampm = '凌晨'
            }
            else if (ampm === '上午' && hour <= 6)   ampm = '凌晨'
            else if (ampm === '上午' && hour <= 8 )  ampm = '早上'
            else if (ampm === '上午' && hour <= 10)  ampm = '上午'
            else if (ampm === '上午' && hour <= 11)  ampm = '中午'
            else if (ampm === '下午' && hour === 12) ampm = '中午'
            else if (ampm === '下午' && hour <= 5 )  ampm = '下午'
            else ampm = '晚上'
            
            return `${year}.${month.pad(2, { character: '0', position: 'left' })}.${day.pad(2, { character: '0', position: 'left' })} ` +
                `${ampm} ${String(hour).pad(2, { character: '0', position: 'left' })}:${minute}:${second}${ ms ? `.${this.getMilliseconds().toString().pad(3, { character: '0', position: 'left' })}` : '' }`
        })
    },
    
    to_date_str (this: Date) {
        return this.to_str().split(' ')[0]
    },
    
    to_time_str (this: Date, ms = false) {
        const [, ampm, time ] = this.to_str(ms).split(' ')
        return `${ampm} ${time}`
    },
}))



// ------------------------------------ Number.prototype
Object.defineProperties(Number.prototype, to_method_property_descriptors({
    to_fsize_str (this: number, units: 'iec' | 'metric' = 'iec') {
        const { value, unit } = byte_size(this, { units })
        return `${value} ${(unit as string).rm('i')}`
    },
    
    to_bin_str (this: number) {
        return `0b${this.toString(2)}`
    },
    
    to_hex_str (this: number, length?: number) {
        const s = this.toString(16)
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
    ... to_getter_property_descriptors({
        last (this: any[]) {
            return this[this.length - 1]
        }
    }),
    
    
    // --- text processing methods
    ... to_method_property_descriptors({
        log (this: string[], limit: number = 10000) {
            const text = this.join('\n') + '\n'
            if (limit === -1 || this.length <= limit)
                console.log(text)
            else if (limit > 0)
                console.log(text.slice(0, limit) + '\n...'.blue)
            else 
                console.log('...\n'.blue + text.slice(limit))
        },
        
        trim_lines (this: string[], { trim_line = true, rm_empty_lines = true, rm_last_empty_lines = false }: { trim_line?: boolean, rm_empty_lines?: boolean, rm_last_empty_lines?: boolean } = { }) {
            if (!this.length) return this
            let lines = this
            
            if (trim_line)
                lines = lines.map(line => line.trim() )
            
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
        
        
        trim_license (this: string[]) {
            const i =  this.indexOf('/*')
            const j =  this.indexOf('*/')
            if (i === 0 && this[i+1].includes('License'))
                return this.slice(j+1)
            else
                return this
        },
        
        split_indents (this: string[]): { indent: number, text: string }[] {
            return this.map(line => 
                line.split_indent()
            )
        },
        
        indent (this: string[], width?: number, character: string = ' ') {
            return this.map(line => 
                character.repeat(width) + line
            )
        },
        
        indent2to4 (this: string[]) {
            return this.split_indents()
                .map(line => 
                    ' '.repeat(
                        Math.floor(line.indent / 2) * 4
                    ) + line.text
            )
        },
        
        join_lines (this: string[], append = true) {
            return `${this.join('\n')}${append ? '\n' : ''}`
        }
    })
})


export function to_json (obj: any, replacer?: any) {
    return JSON.stringify(obj, replacer, 4) + '\n'
}

export function to_json_safely (obj: any, replacer?: any) {
    return to_json(obj, replacer)
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')
        .replace(/<\/script>/g, '<\\/script>')
}


export function is_codepoint_fullwidth (codepoint: number) {
    // code points are derived from:
    // http://www.unix.org/Public/UNIDATA/EastAsianWidth.txt
    return (
        !Number.isNaN(codepoint) &&
        codepoint >= 0x1100 &&
        (
            codepoint <= 0x115f || // hangul jamo
            
            codepoint === 0x201c || codepoint === 0x201d ||  // 
            codepoint === 0x2026 ||  // …
            codepoint === 0x203b ||  // ※
            
            // arrows
            (0x2190 <= codepoint && codepoint <= 0x21FF) ||
            
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
            (0x4E00 <= codepoint && codepoint <= 0xA4C6) ||
            
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
