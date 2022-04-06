import { concat } from './utils.browser.js'

export interface RequestOptions {
    method?: 'get' | 'post' | 'put' | 'head' | 'delete' | 'patch'
    
    queries?: Record<string, any>
    
    headers?: Record<string, string>
    
    body?: string | object | HTMLFormElement
    
    type?: 'application/json' | 'application/x-www-form-urlencoded' | 'multipart/form-data'
    
    cors?: boolean
    
    by?: 'fetch' | 'GM_xmlhttpRequest'
}

export interface RequestRawOptions extends RequestOptions {
    raw: true
}

/**
    - url: 可以只有 pathname 部分
    - options:
        - type: `'application/json'` 请求的 content-type 头 (如果有 body)
        - by: `window.GM_xmlhttpRequest ? 'GM_xmlhttpRequest' : 'fetch'` 发起请求所使用的底层方法
*/
export async function request (url: string | URL): Promise<string>
export async function request (url: string | URL, options: RequestRawOptions): Promise<Response>
export async function request (url: string | URL, options: RequestOptions): Promise<string>
export async function request (url: string | URL, {
    method,
    
    queries,
    
    headers,
    
    body,
    
    type = 'application/json',
    
    cors,
    
    by = window.GM_xmlhttpRequest ? 'GM_xmlhttpRequest' : 'fetch',
    
    raw,
}: RequestOptions & { raw?: boolean } = { }) {
    url = new URL(url, location.href)
    
    if (queries)
        for (const key in queries) {
            let value = queries[key]
            if (typeof value === 'boolean')
                value = value ? '1' : '0'
            url.searchParams.append(key, value)
        }
    
    if (body && !method)
        method = 'post'
    
    if (type === 'application/json' && typeof body !== 'undefined' && typeof body !== 'string')
        body = JSON.stringify(body)
    
    url = url.toString()
    
    if (by === 'fetch') {
        const options: RequestInit = {
            ... method ? { method: method.toUpperCase() } : { },
            
            ... cors ? { mode: 'cors' } : { },
            
            credentials: 'include',
            
            headers: {
                ... body ? { 'content-type': type } : { },
                ... headers,
            },
            
            ... body   ? { body: body as string } : { },
        }
        
        const response = await fetch(
            url,
            options
        )
        
        if (!response.ok)
            throw Object.assign(
                new Error(`StatusCodeError: ${response.status}`),
                { url, response, ...options }
            )
        
        if (raw)
            return response
        
        return response.text()
    }
    
    
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            ... method ? { method: (method as any).toUpperCase() } : { },
            
            url: url as string,
            
            headers: {
                ... body ? { 'content-type': type } : { },
                ... headers,
            },
            
            ... body ? { data: body as string, } : { },
            
            onload (response) {
                if (!(200 <= response.status && response.status <= 299)) {
                    reject(
                        Object.assign(
                            new Error(`StatusCodeError: ${response.status}`), 
                            { url, queries, method, headers, body, response }
                        )
                    )
                    return
                }
                
                resolve(response.responseText)
            }
        })
    })
}


/** 发起 http 请求并将响应体作为 json 解析 */
export async function request_json <T = any> (url: string, options?: RequestOptions): Promise<T> {
    const resp = await request(url, options)
    if (!resp) return
    try {
        return JSON.parse(resp)
    } catch (error) {
        console.error(resp)
        throw error
    }
}



let decoder = new TextDecoder()

let encoder = new TextEncoder()


export async function connect_websocket (
    url: string | URL,
    {
        protocols,
        on_open,
        on_close,
        on_error,
        on_message
    }: {
        protocols?: string | string[]
        on_open? (event: any, websocket: WebSocket): any
        on_close? (event: { code: number, reason: string }, websocket: WebSocket): any
        on_error? (event: any, websocket: WebSocket): any
        on_message (event: { data: ArrayBuffer }, websocket: WebSocket): any
    }
) {
    let websocket = new WebSocket(url, protocols)
    
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
    
    /** 在未连接时或连接断开后，调用 call 是否自动连接到 remote */
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
        funcs = { },
        websocket,
        autoconnect
    }: {
        url?: string
        funcs?: Remote['funcs']
        websocket?: WebSocket
        autoconnect?: boolean
    } = { }) {
        this.url = url
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
            throw new Error(`${websocket?.url || 'websocket'} 已断开，无法调用 remote.send`)
        
        if (!('id' in message))
            message.id = this.id
        
        websocket.send(
            Remote.pack(message)
        )
    }
    
    
    /** 调用 remote 中的 func, 中间消息及返回结果可由 handler 处理，处理 done message 之后的返回值作为 call 函数的返回值 
        如果为 unary rpc, 可以不传 handler, await call 之后可以得到响应 message 的 args
    */
    async call <T extends any[] = any[]> (
        message: Message,
        handler?: (message: Message<T>) => any
    ) {
        if (!this.connected)
            if (this.autoconnect) {
                // 临界区：保证多个 call 并发时只连接一次
                const ptail = this.pconnect
                
                let resolve: () => void
                this.pconnect = new Promise<void>((_resolve, _reject) => {
                    resolve = _resolve
                })
                
                try {
                    await ptail
                } catch { }
                // 临界区结束，只有一个 call 调用运行到这里，可以开始连接 WebSocket
                
                if (!this.connected) {
                    if (this.websocket)
                        console.log(`${this.url} 已断开，尝试自动重连`)
                    else
                        console.log(`${this.url} 未连接，尝试自动连接`)
                    
                    try {
                        await this.connect()
                    } finally {
                        resolve()
                    }
                }
            } else
                throw new Error(`${this.url} 未连接或已断开，无法调用 remote.call`)
        
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
                const handler = this.funcs[func]
                
                if (!handler)
                    throw new Error(`找不到 rpc handler for '${func}'`)
                
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
        else {  // 作为发起方
            this.handlers[id](message)
            
            if (done)
                this.handlers[id] = null
        }
    }
}


