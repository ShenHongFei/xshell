import { Readable } from 'stream'

import util from 'util'
import omit from 'lodash/omit'

import './prototype'

export const output_width = 230


export function dedent (
    templ: TemplateStringsArray | string,
    ...values: any[]
): string {
    let strings = Array.from(typeof templ === 'string' ? [templ] : templ.raw)
    
    // 1. remove trailing whitespace
    strings[strings.length - 1] = strings[strings.length - 1].replace(
        /\r?\n([\t ]*)$/,
        '',
    )
    
    // 2. find all line breaks to determine the highest common indentation level
    const indent_lengths = strings.reduce<number[]>(
        (arr, str) => {
            const matches = str.match(/\n[\t ]+/g)
            if (matches) 
                return arr.concat(matches.map(match => match.length - 1))
            
            return arr
        },
        [],
    )
    
    // 3. remove the common indentation from all strings
    if (indent_lengths.length) {
        const pattern = new RegExp(`\n[\t ]{${Math.min(...indent_lengths)}}`, 'g')
        
        strings = strings.map(str => str.replace(pattern, '\n'))
    }
    
    // 4. remove leading whitespace
    strings[0] = strings[0].replace(/^\r?\n/, '')
    
    // 5. perform interpolation
    let string = strings[0]
    
    values.forEach((value, i) => {
        string += value + strings[i + 1]
    })
    
    string += '\n'
    
    return string
}


/** unique iterable or array (by selector)  
    - selector?: 可以是 key (string) 或 (obj: any) => any
*/
export function unique <T> (iterable: T[] | Iterable<T>, selector?: string | ((obj: T) => any)) {
    if (!selector)
        return [...new Set(iterable)]
    
    let map = new Map()
    if (typeof selector === 'string')
        for (const x of iterable)
            map.set(x[selector], x)
    else
        for (const x of iterable)
            map.set(
                selector(x),
                x
            )
    
    return [...map.values()]
}


/** sort keys in object and returns new object */
export function sort_keys <T> (obj: T) {
    return Object.fromEntries(
        Object.entries(obj)
            .sort(([key_l], [key_r]) => 
                strcmp(key_l, key_r))
    ) as T
}


/** string compare in lexicographic order */
export function strcmp (l: string, r: string) {
    if (l === r) return 0
    if (l < r)   return -1
    return 1
}


// ------------------------------------ log: module loaded, section, line
export function log_section (
    message: string, 
    {
        time = false,
        timestamp = false,
        color = undefined,
        left_width = 30,
        full_width = 110
    }: {
        time?: boolean
        timestamp?: boolean | Date
        color?: 'green' | 'red' | 'yellow'
        left_width?: number
        full_width?: number
    } = { }
) {
    const stime = (() => {
        if (time)
            return ` [${String(new Date().getTime() - global.started_at.getTime()).pad(4, { position: 'left' })} ms]`
        if (timestamp)
            if (typeof timestamp === 'object')
                return ` [${timestamp.to_str()}]`
            else
                return ` [${new Date().to_str()}]`
        return ''
    })()
    
    message = `${'-'.repeat(left_width)}${stime} ${message} `.pad(full_width, { character: '-' })
    
    if (color)
        message = message[color]
    
    console.log(message)
}


/** '─' === '\u2500' */
export function log_line (width: number = output_width) {
    console.log('─'.repeat(width / 2))
}


export async function delay (milliseconds: number) {
    return new Promise( resolve => {
        setTimeout(resolve, milliseconds)
    })
}


// ------------ text
export function has_chinese (str: string) {
    return /[\u4E00-\u9FA5]/.test(str)
}


export function escape_line_feed (str: string) {
    return str.replace(/\n/g, '\\n')
}

/** util.inspect(obj) 
    - options
        - limit?: `10000`
*/
export function inspect (
    obj: any, 
    options: util.InspectOptions & {
        limit?: number
        omit?: string[]
    } = { }
) {
    if (options.omit)
        obj = omit(obj, [inspect.custom, ...(options.omit || [])])
    
    let text = util.inspect(obj, options)
    
    if (!('limit' in options))
        options.limit = 10000
    if (options.limit && text.length > options.limit)
        return `${text.slice(0, options.limit)}……'\u001b[39m\n`
    else
        return text
}

export namespace inspect {
    export const custom: typeof util.inspect.custom = util.inspect.custom
}


// ------------------------------------ Steam
export async function stream_to_buffer (stream: Readable) {
    let chunks = [ ]
    for await (const chunk of stream)
        chunks.push(chunk)
    return Buffer.concat(chunks)
}
