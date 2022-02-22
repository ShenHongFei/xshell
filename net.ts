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
import { inspect, output_width } from './utils.js'

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
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.82 Safari/537.36',
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

