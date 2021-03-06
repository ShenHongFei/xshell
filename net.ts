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
                console.log(`${`retry (${count}) ???`.yellow} ${request_options.url.toString().blue.underline}`)
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
        - raw: `false` ????????????????????? response
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
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36',
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
            let s = '???'.repeat(output_width / 2) + '\n' +
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
                '???'.repeat(output_width / 2)
            
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
        console.error(resp)
        throw error
    }
}


/** use $.html(cheerio_element) to get outer html */
export async function parse_html (html: string) {
    const { default: cheerio } = await import('cheerio')
    
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
    if (!func)
        throw new Error('rpc argument error: no func')
    
    return request_json(url, {
        body: {
            func,
            args,
            async: _async,
            ignore,
        }
    })
}



let decoder = new TextDecoder()

let encoder = new TextEncoder()


/** ?????? websocket url, ???????????????????????????  
    - url
    - options:
        - on_message: ?????? websocket frame ??? opcode ?????? (text frame ??? binary frame) event ?????? data ????????? ArrayBuffer ?????? string
          https://datatracker.ietf.org/doc/html/rfc6455#section-5.2
*/
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
        on_message (event: { data: ArrayBuffer | string }, websocket: WebSocket): any
    }
) {
    let websocket = new WebSocket(
        url,
        protocols,
        {
            maxPayload: max_payload,
            skipUTF8Validation: true
        }
    )
    
    // https://stackoverflow.com/questions/11821096/what-is-the-difference-between-an-arraybuffer-and-a-blob/39951543
    websocket.binaryType = 'arraybuffer'
    
    return new Promise<WebSocket>((resolve, reject) => {
        websocket.addEventListener('open', async event => {
            console.log(`${websocket.url} opened`)
            
            await on_open?.(event, websocket)
            
            resolve(websocket)
        })
        
        websocket.addEventListener('close', event => {
            console.log(`${websocket.url} closed with code = ${event.code}, reason = '${event.reason}'`)
            on_close?.(event, websocket)
        })
        
        websocket.addEventListener('error', event => {
            const message = `${websocket.url} errored`
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


/** ????????????????????? 
    - json.length (?????????): 4 ??????
    - json ??????
    - binary ??????
*/
export interface Message <T extends any[] = any[]> {
    /** ?????? rpc ??? id */
    id?: number
    
    /** rpc ??????????????????????????? function name, ???????????? id, func ??? message ????????????????????? */
    func?: string
    
    /** ??????????????????????????????????????? func ??????????????? (message ?????? args) */
    ignore?: boolean
    
    /** ????????? func ?????????remote ??????????????????????????? (message ??? done = true) */
    async?: boolean
    
    /** ???????????????????????????????????? JS ?????????????????? Uint8Array ??????????????? binary length  
        args ?????????:  
        - rpc ??????????????? func ??????????????????????????? message ???????????????
        - ?????????????????????????????? message ??????????????????????????????
    */
    args?: T
    
    /** bins: ????????? arg ??? Uint8Array ???????????????: [0, 3] */
    bins?: number[]
    
    /** ??????????????? func ??????????????? */
    error?: Error
    
    /** ??????????????????????????????????????????????????? flag ????????????????????? message, ?????????????????? handler ??? */
    done?: boolean
}

/** ???????????? Remote ????????? WebSocket RPC ????????????  
    ??????????????? remote.call ????????????  
    ?????????????????? Remote ??????????????? funcs ?????????????????????????????? Remote.handle ???????????? WebSocket message  
*/
export class Remote {
    url: string
    
    websocket: WebSocket
    
    id = 0
    
    /** ???????????? message ????????? */
    funcs: Record<
        string, 
        (message: Message, websocket?: WebSocket) => void | Promise<void>
    > = { }
    
    /** ?????????????????? rpc ??????????????? message ????????? */
    handlers: ((message: Message) => any)[] = [ ]
    
    print = false
    
    /** ?????????????????????????????????????????? call ????????????????????? remote */
    autoconnect = true
    
    pconnect: Promise<any>
    
    
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
        
        if (message.bins) {
            const { bins } = message
            let { args } = message
            
            for (const ibin of bins) {
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
        funcs,
        websocket,
        autoconnect
    }: {
        url?: string
        funcs?: Remote['funcs']
        websocket?: WebSocket
        autoconnect?: boolean
    } = { }) {
        this.url = url
        
        if (funcs)
            this.funcs = funcs
        
        this.websocket = websocket
        
        if (typeof autoconnect !== 'undefined')
            this.autoconnect = autoconnect
    }
    
    
    async connect () {
        this.websocket = await connect_websocket(this.url, {
            on_message: this.handle.bind(this),
            on_close: () => {
                this.id = 0
                this.handlers = [ ]
            },
        })
    }
    
    
    disconnect () {
        this.websocket?.close()
        this.id = 0
        this.handlers = [ ]
    }
    
    
    send (message: Message, websocket = this.websocket) {
        if (websocket?.readyState !== WebSocket.OPEN)
            throw new Error(`${websocket?.url || 'websocket'} ???????????????????????? remote.send`)
        
        if (!('id' in message))
            message.id = this.id
        
        websocket.send(
            Remote.pack(message)
        )
    }
    
    
    /** ?????? remote ?????? func, ????????????????????????????????? handler ??????????????? done message ???????????????????????? call ?????????????????? 
        ????????? unary rpc, ???????????? handler, await call ???????????????????????? message ??? args
    */
    async call <T extends any[] = any[]> (
        message: Message,
        handler?: (message: Message<T>) => any
    ) {
        if (!this.connected)
            if (this.autoconnect) {
                // ???????????????????????? call ????????????????????????
                const ptail = this.pconnect
                
                let resolve: () => void
                this.pconnect = new Promise<void>((_resolve, _reject) => {
                    resolve = _resolve
                })
                
                try {
                    await ptail
                } catch { }
                // ?????????????????????????????? call ?????????????????????????????????????????? WebSocket
                
                if (!this.connected) {
                    if (this.websocket)
                        console.log(`${this.url} ??????????????????????????????`)
                    else
                        console.log(`${this.url} ??????????????????????????????`)
                    
                    try {
                        await this.connect()
                    } finally {
                        resolve()
                    }
                }
            } else
                throw new Error(`${this.url} ???????????????????????????????????? remote.call`)
        
        return new Promise<T>((resolve, reject) => {
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
                
                const result = handler ?
                        await handler(message)
                    :
                        message.args
                
                if (done)
                    resolve(result)
            }
            
            this.send(message)
            
            this.id++
        })
    }
    
    
    /** ?????????????????? WebSocket message
        1. ?????????????????? message ???????????????
        2. ??????????????? message ??????
    */
    async handle (event: { data: ArrayBuffer }, websocket: WebSocket) {
        const message = Remote.parse(event.data)
        
        const { func, id, done } = message
        
        if (this.print)
            console.log(message)
        
        if (func) // ???????????????
            try {
                const handler = this.funcs[func]
                
                if (!handler)
                    throw new Error(`????????? rpc handler for '${func}'`)
                
                await handler(message, websocket)
            } catch (error) {
                this.send(
                    {
                        id,
                        error,
                        done: true
                    },
                    websocket
                )
                
                throw error
            }
        else {  // ???????????????
            this.handlers[id](message)
            
            if (done)
                this.handlers[id] = null
        }
    }
}


