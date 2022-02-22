import {
    Stream,
    type Readable,
    type Duplex
} from 'stream'
import util from 'util'

import type Vinyl from 'vinyl'
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
                return arr.concat(
                    matches.map(match => 
                        match.length - 1)
                )
            
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
    const is_str_selector = typeof selector === 'string'
    for (const x of iterable)
        map.set(
            is_str_selector ? x[selector] : selector(x),
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


/** 拼接 TypedArrays 生成一个完整的 Uint8Array */
export function concat (arrays: ArrayBufferView[]) {
    let length = 0
    for (const a of arrays)
        length += a.byteLength
    
    let buf = new Uint8Array(length)
    let offset = 0
    for (const a of arrays) {
        const uint8view = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
        buf.set(uint8view, offset)
        offset += uint8view.byteLength
    }
    
    return buf
}


export function typed_array_to_buffer (view: ArrayBufferView) {
    return Buffer.from(
        view.buffer,
        view.byteOffset,
        view.byteLength
    )
}


// ------------------------------------ log: module loaded, section, line
export function log_section (
    message: string, 
    {
        time = false,
        timestamp = false,
        color = undefined,
    }: {
        time?: boolean
        timestamp?: boolean | Date
        color?: 'green' | 'red' | 'yellow'
    } = { }
) {
    const stime = (() => {
        if (time)
            return `${String(new Date().getTime() - global.started_at.getTime()).pad(4, { position: 'left' })} ms`
        if (timestamp)
            if (typeof timestamp === 'object')
                return `${timestamp.to_str()}`
            else
                return `${new Date().to_str()}`
        return ''
    })()
    
    message = `${message.pad(20, { character: '-' })}${stime}`
    
    if (color)
        message = message[color]
    
    console.log(message)
}


export function log_line () {
    console.log('---')
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
/** npm map-stream  
    filter will reemit the data if cb(err,pass) pass is truthy 
    
    reduce is more tricky  
    maybe we want to group the reductions or emit progress updates occasionally  
    the most basic reduce just emits one 'data' event after it has recieved 'end'
    
    create an event stream and apply function to each .write,  
    emitting each response as data unless it's an empty callback
 */
export function map_stream <Out, In = Vinyl> (
    mapper: (obj: In, cb: Function) => any, 
    options?: { failures?: boolean }
) {
    options = options || { }
    
    let inputs = 0,
        outputs = 0,
        ended = false,
        paused = false,
        destroyed = false,
        last_written = 0,
        in_next = false
    
    
    let stream = Object.assign(new Stream(), {
        readable: true, 
        writable: true,
        
        write (data?: any) {
            if (ended) throw new Error('map stream is not writable')
            in_next = false
            inputs++
            
            try {
                // catch sync errors and handle them like async errors
                const written = wrapped_mapper(data, inputs, next)
                paused = (written === false)
                return !paused
            } catch (err) {
                // if the callback has been called syncronously, and the error has occured in an listener, throw it again.
                if (in_next)
                    throw err
                next(err)
                return !paused
            }
        },
        
        end (data?: any) {
            if (ended) return
            _end(data)
        },
        
        destroy () {
            ended = destroyed = true
            stream.writable = stream.readable = paused = false
            process.nextTick(function () {
                stream.emit('close')
            })
        },
        
        pause () {
            paused = true
        },
        
        resume () {
            paused = false
        }
    })
    
    
    let error_event_name = options.failures ? 'failure' : 'error'
    
    // Items that are not ready to be written yet (because they would come out of order) get stuck in a queue for later.
    let write_queue = { }
    
    
    function queue_data (data, number) {
        let next_to_write = last_written + 1
        
        if (number === next_to_write) {
            // If it's next, and its not undefined write it
            if (data !== undefined) 
                stream.emit('data', data)
            
            last_written++
            next_to_write++
        } else 
            // Otherwise queue it for later.
            write_queue[number] = data
        
        
        // If the next value is in the queue, write it
        if (Object.prototype.hasOwnProperty.call(write_queue, next_to_write)) {
            let data_to_write = write_queue[next_to_write]
            delete write_queue[next_to_write]
            return queue_data(data_to_write, next_to_write)
        }
        
        outputs++
        if (inputs === outputs) {
            if (paused) {
                paused = false
                stream.emit('drain') // written all the incoming events
            }
            if (ended) _end()
        }
    }
    
    function next (err?: Error, data?: any, number?: number) {
        if (destroyed) return
        in_next = true
        
        if (!err || options.failures)
            queue_data(data, number)
        
        if (err)
            stream.emit(error_event_name, err)
        
        in_next = false
    }
    
    /** Wrap the mapper function by calling its callback with the order number of the item in the stream. */ 
    function wrapped_mapper (input, number, callback) {
        return mapper.call(null, input, function (err, data) {
            callback(err, data, number)
        })
    }
    
    function _end (data?: any) {
        // if end was called with args, write it, 
        ended = true // write will emit 'end' if ended is true
        stream.writable = false
        if (data !== undefined) 
            return queue_data(data, inputs)
        else if (inputs === outputs) { // wait for processing 
            stream.readable = false
            stream.emit('end')
            stream.destroy() 
        }
    }
    
    return stream as Duplex
}


export async function stream_to_buffer (stream: Readable) {
    let chunks = [ ]
    for await (const chunk of stream as AsyncIterable<Buffer>)
        chunks.push(chunk)
    return Buffer.concat(chunks)
}


export async function * stream_to_lines (stream: Readable) {
    let buf = ''
    for await (const chunk of stream as AsyncIterable<string>) {
        let i = 0, j = 0
        for (;  (i = chunk.indexOf('\n', j)) >= 0;  ) {
            let line = chunk.slice(j, i)
            if (buf) {
                line = buf + line
                buf = ''
            }
            j = i + 1
            yield line
        }
        buf = chunk.slice(j)
    }
}

