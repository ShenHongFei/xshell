import {
    default as request_lib,
    type OptionsWithUri,
    type OptionsWithUrl
} from 'request'

import {
    default as request_promise,
    type FullResponse,
} from 'request-promise-native'
import { RequestError, StatusCodeError } from 'request-promise-native/errors.js'

import promise_retry from 'promise-retry'

import { WebSocket } from 'ws'

import iconv from 'iconv-lite'
import cheerio from 'cheerio'
import qs from 'qs'
import { Cookie, MemoryCookieStore } from 'tough-cookie'

declare module 'tough-cookie' {
    interface MemoryCookieStore {
        idx: Record<string, any>
    }
}


import './prototype.js'
import type { Encoding } from './file.js'
import { inspect, output_width, concat } from './utils.js'

export enum MyProxy {
    socks5  = 'http://localhost:10080',
    whistle = 'http://localhost:8899',
}


// ------------------------------------ Fetch, Request
const cookie_store = new MemoryCookieStore()

export const cookies = {
    store: cookie_store,
    
    jar: request_promise.jar(cookie_store),
    
    get (domain_or_url: string, str = false) {
        if (domain_or_url.startsWith('http'))
            if (str)
                return this.jar.getCookieString(domain_or_url)
            else
                return this.jar.getCookies(domain_or_url)
        
        let cookies: Cookie[]
        this.store.findCookies(domain_or_url, null, true, (error, _cookies) => {
            if (error) throw error
            cookies = _cookies
        })
        return cookies
    },
}

export { Cookie }


export const _request = request_promise.defaults({
    // rejectUnauthorized: false,
    
    /** prevent 302 redirect cause error, which is a boolean to set whether status codes other than 2xx should also reject the promise */
    simple: false,
    
    jar: cookies.jar
})


export async function request_retry (retries: number, request_options: request_promise.OptionsWithUrl) {
    return promise_retry<FullResponse>({
        retries,
        minTimeout: 1000,
        maxTimeout: Infinity,
        factor: 2
    }, async (retry, count) => {
        try {
            return await _request(request_options)
        } catch (error) {
            if (!['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(error.cause?.code)) throw error
            if (count <= retries)
                console.log(`${`retry (${count}) …`.yellow} ${request_options.url.toString().blue.underline}`)
            return retry(error)
        }
    })
}


export interface RequestOptions {
    method?: 'get' | 'post' | 'put' | 'head' | 'delete' | 'patch'
    
    queries?: Record<string, any>
    
    headers?: Record<string, string>
    
    body?: string | Record<string, any>
    
    type?: 'application/json' | 'application/x-www-form-urlencoded' | 'multipart/form-data'
    
    
    proxy?: boolean | MyProxy | string
    
    encoding?: Encoding
    
    retries?: true | number
    
    timeout?: number
    
    auth?: {
        username: string
        password: string
    }
    
    gzip?: boolean
    
    cookies?: Record<string, string>
}

export interface RequestRawOptions extends RequestOptions {
    raw: true
}

/** 
    - url: must be full url
    - options:
        - raw: `false` 传入后返回整个 response
        - encoding: `(response content-type: charset=gb18030) || 'utf-8'` when 'binary' then return buffer
        - type: `'application/json'` request content-type header (if has body)
        - proxy: `false` proxy === true then use MyProxy.whistle
        - retries: `false` could be true (default 3 times) or retry times
        - timeout: `20 * 1000`
        - gzip: `raw -> false; else -> true`
*/
export async function request (url: string | URL): Promise<string>
export async function request (url: string | URL, options: RequestRawOptions): Promise<request_lib.Response>
export async function request (url: string | URL, options: RequestOptions & { encoding: 'binary' }): Promise<Buffer>
export async function request (url: string | URL, options: RequestOptions): Promise<string>
export async function request (url: string | URL, {
    queries,
    
    body,
    
    type = 'application/json',
    
    proxy,
    
    method,
    
    headers,
    
    encoding,
    
    raw = false,
    
    retries,
    
    timeout = 20 * 1000,
    
    auth,
    
    gzip,
    
    cookies,
    
}: RequestOptions & { raw?: boolean } = { }) {
    url = url.toString()
    
    const _body = body  // for error log
    
    if (body && !method)
        method = 'post'
    
    if (type === 'application/json' && typeof body !== 'undefined' && (typeof body !== 'string' && !Buffer.isBuffer(body)))
        body = JSON.stringify(body)
    
    // --- proxy
    if (proxy) {
        if (proxy === true)
            proxy = MyProxy.whistle
    } else
        proxy = false
    
    // --- gzip
    if (gzip === undefined)
        gzip = !raw
    
    
    const options: request_lib.Options & { resolveWithFullResponse: boolean } = {
        url,
        
        ... method ? { method: method.toUpperCase() } : { },
        
        proxy,
        
        gzip,
        
        encoding: null,
        
        resolveWithFullResponse: true,
        
        headers: {
            'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,ja-JP;q=0.6,ja;q=0.5',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.60 Safari/537.36',
            ... body ? { 'content-type': type } : { }, 
            ... cookies ? {
                cookie: Object.entries(cookies)
                    .map(([key, value]) => 
                        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
                    ).join('; ')
            } : { },
            ... headers
        },
        
        ... queries ? { qs: queries } : { },
        
        // --- body
        ... (() => {
            if (!body) return { }
            if (type === 'application/x-www-form-urlencoded') return { form: body }
            if (type === 'multipart/form-data') return { formData: body as Record<string, any> }
            return { body }
        })(),
        
        ... timeout ? { timeout } : { },
        
        ... auth ? { auth } : { },
    }
    
    let resp: request_lib.Response
    
    try {
        if (retries) {
            if (retries === true)
                retries = 3
            
            resp = await request_retry(retries, options)
        } else
            resp = await _request(options)
        
        if (!(200 <= resp.statusCode && resp.statusCode <= 299))
            throw new StatusCodeError(resp.statusCode, resp.body, options, resp)
        
    } catch (error) {
        const {
            name, 
            options: { method, url, uri, qs }, 
            response,
        }: {
            options: OptionsWithUri & OptionsWithUrl
            response: FullResponse
        } & Error = error
        
        error[inspect.custom] = () => {
            let s = '─'.repeat(output_width / 2) + '\n' +
                `${(method || 'get').toLowerCase().red} ${String(url || uri).blue.underline}\n`
            
            if (qs)
                s += `\n${'request.query:'.blue}\n` +
                    inspect(qs) + '\n'
            
            if (_body)
                s += `\n${'request.body:'.blue}\n` +
                    inspect(_body) + '\n'
            
            if (name === 'StatusCodeError')
                s += `\n${'response.status:'.yellow} ${String(error.statusCode).red}\n`
            else if (error instanceof RequestError)
                s += `\n${'response.cause:'.yellow}\n` +
                    `${inspect(error.cause)}\n`
            else
                s += `\n${inspect(error)}\n`
                
            if (response) {
                s += `\n${'response.headers:'.yellow}\n` + 
                    `${inspect(response.headers)}\n`
                
                if (response.body)
                    s += `\n${'response.body:'.yellow}\n` +
                        `${inspect(response.body.toString())}\n`
            }
            
            s += `\n${'stack:'.yellow}\n` +
                `${new Error().stack}\n` +
                '─'.repeat(output_width / 2)
            
            return s
        }
        
        throw error
    }
    
    if (raw)
        return resp
    
    if (!resp.body)
        return resp.body
    
    // --- decode body
    if (encoding === 'binary')
        return resp.body
        
    encoding ||= /charset=(.*)/.exec(resp.headers['content-type'])?.[1] as Encoding || 'utf-8'
    
    if (/utf-?8/i.test(encoding))
        return (resp.body as Buffer).toString('utf-8')
    
    return iconv.decode((resp.body as Buffer), encoding)
}


/** make http request and parse body as json */
export async function request_json <T = any> (url: string | URL, options?: RequestOptions): Promise<T> {
    const resp = await request(url, options)
    if (!resp) return
    try {
        return JSON.parse(resp)
    } catch (error) {
        console.log(resp)
        throw error
    }
}


/** use $.html(cheerio_element) to get outer html */
export function parse_html (html: string) {
    let $ = cheerio.load(html, { decodeEntities: false })
    
    Object.defineProperty($, inspect.custom, {
        configurable: true,
        enumerable: false,
        value () {
            return this.html()
        }
    })
    
    Object.defineProperty($.prototype, inspect.custom, {
        configurable: true,
        enumerable: false,
        // @ts-ignore
        value (this: cheerio.Cheerio) {
            if (this.length > 1)
                return this.map((index, element) => {
                    if (typeof element === 'string') return element
                    return $.html(element)
                }).get().join_lines()
            
            return this.toString()
        }
    })
    
    return $
}


/** use $.html(cheerio_element) to get outer html */
export async function request_page (url: string | URL, options?: RequestOptions) {
    return parse_html(
        await request(url, options)
    )
}


export function to_curl (url: string | URL, { queries, headers, method, body, proxy, exe = true }: RequestOptions & { exe?: boolean } = { }) {
    if (proxy === true)
        proxy = process.env.http_proxy
    
    url = url.toString()
    
    if (!url.startsWith('http'))
        url = `http://${url}`
    
    return (exe ? 'curl.exe' : 'curl') + 
        ' ' + ( url + (queries ? '?' : '') + qs.stringify(queries) ).quote() +
        // ( typeof proxy === 'undefined' ?
        //     ''
        //     :
        //     ( proxy  ?  ' --proxy ' + proxy.quote()  :  ' --noproxy ' + '*'.quote())
        // ) +
        ( proxy  ?  ` --proxy ${proxy.quote()}`  :  '' ) +
        ( method && method !== 'get'  ?  ` -X ${method.toUpperCase()}`  :  '' ) +
        ( headers  ?  Object.entries(headers).map( ([key, value]) => ' -H ' + `${key}: ${value}`.quote() ).join('') : '' ) +
        ( body  ?  ' -H ' + 'content-type: application/json'.quote()  :  '') +
        ( body  ?  ' --data ' + JSON.stringify(body).quote()  :  '')
}




// ------------------------------------ rpc client
/** post json to http://localhost:8421/api/rpc
    - func: function name
    - args?: argument array
    - options?:
        - ignore?: `false` wait for execution but do not serialize result to response
        - async?: `false` do not wait for exec
*/
export async function rpc (
    func: string, 
    args?: any[], 
    { url = 'http://localhost:8421/api/rpc', async: _async = false, ignore = false }: { url?: string, async?: boolean, ignore?: boolean } = { }
) {
    if (!func) throw new Error('rpc argument error: no func')
    
    return request_json(url, {
        body: {
            func,
            args,
            async: _async,
            ignore,
        }
    })
}


export function rpc_curl (func: string, args: any[]) {
    const cmd = args.find( arg => typeof arg === 'object') ?
            to_curl('http://localhost:8421/api/rpc', { body: { func, args } })
        :
            to_curl('http://localhost:8421/api/rpc', { queries: { func, args } })
    return cmd
}


let decoder = new TextDecoder()

let encoder = new TextEncoder()


export async function connect_websocket (
    url: string | URL,
    {
        protocols,
        max_payload = 2 ** 33,  // 8 GB
        on_open,
        on_close,
        on_error,
        on_message
    }: {
        protocols?: string | string[]
        max_payload?: number
        on_open? (event: any, websocket: WebSocket): any
        on_close? (event: { code: number, reason: string }, websocket: WebSocket): any
        on_error? (event: any, websocket: WebSocket): any
        on_message (event: { data: ArrayBuffer }, websocket: WebSocket): any
    }
) {
    let websocket = new WebSocket(url, protocols, { maxPayload: max_payload })
    
    // https://stackoverflow.com/questions/11821096/what-is-the-difference-between-an-arraybuffer-and-a-blob/39951543
    websocket.binaryType = 'arraybuffer'
    
    return new Promise<WebSocket>((resolve, reject) => {
        websocket.addEventListener('open', async event => {
            console.log(`websocket opened: ${websocket.url}`)
            
            await on_open?.(event, websocket)
            
            resolve(websocket)
        })
        
        websocket.addEventListener('close', event => {
            console.log(`websocket closed: ${websocket.url} (code = ${event.code}, reason = '${event.reason}')`)
            on_close?.(event, websocket)
        })
        
        websocket.addEventListener('error', event => {
            const message = `websocket errored: ${websocket.url}`
            on_error?.(event, websocket)
            reject(
                Object.assign(
                    new Error(message),
                    { event }
                )
            )
        })
        
        websocket.addEventListener('message', event => {
            on_message(event as any, websocket)
        })
    })
}


/** 二进制消息格式 
    - json.length (小端序): 4 字节
    - json 数据
    - binary 数据
*/
export interface Message <T extends any[] = any[]> {
    /** 本次 rpc 的 id */
    id?: number
    
    /** rpc 发起方指定被调用的 function name, 多个相同 id, func 的 message 组成一个请求流 */
    func?: string
    
    /** 等待执行，但不要序列化返回 func 的执行结果 (message 中无 args) */
    ignore?: boolean
    
    /** 不等待 func 执行，remote 收到后直接确认返回 (message 中 done = true) */
    async?: boolean
    
    /** 这个数组里面要么是对应的 JS 参数，要么是 Uint8Array 参数对应的 binary length  
        args 可以是:  
        - rpc 发起方调用 func 的参数，或者请求流 message 携带的数据
        - 作为结果或者响应流的 message 数据，传给请求发起方
    */
    args?: T
    
    /** bins: 哪几个 arg 是 Uint8Array 类型的，如: [0, 3] */
    bins?: number[]
    
    /** 被调方执行 func 产生的错误 */
    error?: Error
    
    /** 如果请求或者响应是一个流，通过这个 flag 表明是最后一个 message, 并且可以销毁 handler 了 */
    done?: boolean
}

/** 通过创建 Remote 对象对 WebSocket RPC 进行抽象  
    调用方使用 remote.call 进行调用  
    被调方在创建 Remote 对象时传入 funcs 注册处理函数，并使用 Remote.handle 方法处理 WebSocket message  
*/
export class Remote {
    url: string
    
    websocket: WebSocket
    
    id = 0
    
    /** 被调方的 message 处理器 */
    funcs: Record<
        string, 
        (message: Message, websocket?: WebSocket) => void | Promise<void>
    >
    
    /** 调用方发起的 rpc 对应响应的 message 处理器 */
    handlers: ((message: Message) => any)[] = [ ]
    
    print = false
    
    get connected () {
        return this.websocket?.readyState === WebSocket.OPEN
    }
    
    
    static parse <T extends any[] = any[]> (array_buffer: ArrayBuffer) {
        const buf = new Uint8Array(array_buffer as ArrayBuffer)
        const dv = new DataView(array_buffer)
        
        const len_json = dv.getUint32(0, true)
        
        let offset = 4 + len_json
        
        let message: Message<T> = JSON.parse(
            decoder.decode(
                buf.subarray(4, offset)
            )
        )
        
        message.args ||= [ ] as T
        
        if (message.bins) {
            let args = message.args
            
            for (const ibin of message.bins) {
                const len_buf = args[ibin]
                args[ibin] = buf.subarray(offset, offset + len_buf)
                offset += len_buf
            }
        }
        
        return message
    }
    
    
    static pack ({
        id,
        func,
        ignore,
        async: _async,
        done,
        error,
        args: _args = [ ],
    }: Message) {
        let args = [..._args]
        
        let bins: number[] = [ ]
        let bufs: Uint8Array[] = [ ]
        
        for (let i = 0;  i < args.length;  i++) {
            const arg = args[i]
            if (arg instanceof Uint8Array) {
                bins.push(i)
                bufs.push(arg)
                args[i] = arg.length
            }
        }
        
        const data_json = {
            id,
            ... func ? { func } : { },
            ... ignore ? { ignore } : { },
            ... _async ? { async: _async } : { },
            ... done ? { done } : { },
            ... error ? { error } : { },
            ... args.length ? { args } : { },
            ... bins.length ? { bins } : { },
        }
        
        const str_json = encoder.encode(
            JSON.stringify(data_json)
        )
        
        let dv = new DataView(
            new ArrayBuffer(4)
        )
        
        dv.setUint32(0, str_json.length, true)
        
        return concat([
            dv,
            str_json,
            ... bufs
        ])
    }
    
    
    constructor ({
        url,
        funcs = { },
        websocket,
    }: {
        url?: string
        funcs?: Remote['funcs']
        websocket?: WebSocket
    } = { }) {
        this.url = url
        this.funcs = funcs
        this.websocket = websocket
    }
    
    
    async connect () {
        this.websocket = await connect_websocket(this.url, {
            on_message: this.handle.bind(this)
        })
    }
    
    
    disconnect () {
        this.websocket?.close()
        this.id = 0
        this.handlers = [ ]
    }
    
    
    send (message: Message, websocket = this.websocket) {
        if (!('id' in message))
            message.id = this.id
        
        websocket.send(
            Remote.pack(message)
        )
    }
    
    
    /** 调用 remote 中的 func, 返回结果由 handler 处理，处理 done message 之后的返回值作为 call 函数的返回值 */
    async call <T extends any[] = any[], R = any> (
        message: Message,
        handler: (message: Message<T>) => any
    ) {
        return new Promise<R>((resolve, reject) => {
            this.handlers[this.id] = async (message: Message<T>) => {
                const { error, done } = message
                
                if (error) {
                    reject(
                        Object.assign(
                            new Error(),
                            error
                        )
                    )
                    return
                }
                
                let result = await handler(message)
                
                if (done)
                    resolve(result)
            }
            
            this.send(message)
            
            this.id++
        })
    }
    
    
    /** 处理接收到的 WebSocket message
        1. 被调用方接收 message 并开始处理
        2. 调用方处理 message 响应
    */
    async handle (event: { data: ArrayBuffer }, websocket: WebSocket) {
        const message = Remote.parse(event.data)
        const { func, id, done } = message
        
        if (this.print)
            console.log(message)
        
        if (func) // 作为被调方
            try {
                const handler = this.funcs[func] || this.funcs.default
                
                if (!handler)
                    throw new Error(`找不到 rpc handler: ${func}`)
                
                await handler(message, websocket)
            } catch (error) {
                this.send(
                    {
                        id: message.id,
                        error,
                        done: true
                    },
                    websocket
                )
                throw error
            }
        else {  // 作为发起方
            this.handlers[id](message)
            if (done)
                this.handlers[id] = null
        }
    }
}


