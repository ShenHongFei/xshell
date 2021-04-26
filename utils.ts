import { Readable } from 'stream'

import path from 'upath'
import util from 'util'
import omit from 'lodash/omit'
import sort_by from 'lodash/sortBy'

import { colors } from './prototype'


export function assert (shoud_be_true_expr: any): never | void {
    if (!shoud_be_true_expr) {
        debugger
        throw new Error(`Assertion Failed: ${inspect(shoud_be_true_expr)}`)
    }
}


export function dedent (
    templ: TemplateStringsArray | string,
    ...values: any[]
): string {
    let strings = Array.from(typeof templ === 'string' ? [templ] : templ.raw)
    
    // 1. Remove trailing whitespace.
    strings[strings.length - 1] = strings[strings.length - 1].replace(
        /\r?\n([\t ]*)$/,
        '',
    )
    
    // 2. Find all line breaks to determine the highest common indentation level.
    const indentLengths = strings.reduce<number[]>(
        (arr, str) => {
            const matches = str.match(/\n[\t ]+/g)
            if (matches) 
                return arr.concat(matches.map(match => match.length - 1))
            
            return arr
        },
        [],
    )
    
    // 3. Remove the common indentation from all strings.
    if (indentLengths.length) {
        const pattern = new RegExp(`\n[\t ]{${Math.min(...indentLengths)}}`, 'g')
        
        strings = strings.map(str => str.replace(pattern, '\n'))
    }
    
    // 4. Remove leading whitespace.
    strings[0] = strings[0].replace(/^\r?\n/, '')
    
    // 5. Perform interpolation.
    let string = strings[0]
    
    values.forEach((value, i) => {
        string += value + strings[i + 1]
    })
    
    string += '\n'
    
    return string
}


export function unique (iterable: any[] | Set<any>) {
    return [... new Set(iterable)]
}


export function sort_keys <T> (obj: T) {
    return Object.fromEntries(
        sort_by(
            Object.entries(obj),
            ([key, ]) => key
        )
    ) as T
}


// ------------------------------------ Log: module loaded, section, line
export function log_module_loaded (id: string) {
    const fname = path.basename(id).replace(/\.(coffee|ts)$/, '')
    console.log(`${ fname }${ ' '.repeat(20 - fname.length) }loaded`)
}


export function log_section (
    message: string, 
    {
        timestamp = false,
        time = false,
        color = undefined,
        left_width = 30,
        full_width = 110
    }: {
        timestamp?: boolean
        time?: boolean | Date
        color?: 'green' | 'red' | 'yellow'
        left_width?: number
        full_width?: number
    } = { }
) {
    const stime = (() => {
        if (timestamp)
            return ` [${String(new Date().getTime() - global.started_at.getTime()).pad(4, { position: 'left' })} ms]`
        if (time)
            if (typeof time === 'object')
                return ` [${time.to_str()}]`
            else
                return ` [${new Date().to_str()}]`
        return ''
    })()
    
    message = `${'-'.repeat(left_width)}${stime} ${message} `.pad(full_width, { character: '-' })
    
    if (color)
        message = colors[color](message)
    
    console.log(message)
}


/** '─' === '\u2500' */
export function log_line (width: number = global.WIDTH || 240) {
    console.log('─'.repeat(width / 2))
}


export async function delay (milliseconds: number) {
    return new Promise( resolve => {
        setTimeout(resolve, milliseconds)
    })
}


// ------------ Text
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
    
    if (obj && typeof obj === 'object')
        text = text.split_lines().indent2to4().join_lines()

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
