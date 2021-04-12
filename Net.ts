import request_lib from 'request'
import type { OptionsWithUri, OptionsWithUrl } from 'request'

import request_promise from 'request-promise-native'
import type { FullResponse } from 'request-promise-native'
import { RequestError, StatusCodeError } from 'request-promise-native/errors'

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


import './Prototype'
import type { Encoding } from './File'
import { inspect } from './Utils'

export enum MyProxy {
    HTTP1080 = 'http://127.0.0.1:1080',
    whistle = 'http://127.0.0.1:8899',
}


// ------------------------------------ Fetch, Request
const DEFAULT_RETRIES = 3

const cookie_store = new MemoryCookieStore()

export const Cookies = {
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
    rejectUnauthorized: false,
    gzip: true,
    /** prevent 302 redirect cause error, which is a boolean to set whether status codes other than 2xx should also reject the promise */
    simple: false,
    
    jar: Cookies.jar
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
    queries?: Record<string, any>
    
    /** HTTP request body data */
    body?: string | Record<string, any>
    
    /** is JSON format */
    json?: boolean
    
    /** form (x-www-form-urlencoded or multipart)  format */
    form?: boolean | 'application/x-www-form-urlencoded' | 'multipart/form-data'
    
    /** `false` when proxy is true then use MyProxy.whistle */
    proxy?: boolean | MyProxy | string
    
    method?: 'GET' | 'POST' | 'PUT' | 'HEAD' | 'DELETE' | 'PATCH'
    
    headers?: Record<string, string>
    
    /** `(webpage content-type: charset=gb18030) || 'UTF-8'` */
    encoding?: Encoding
    
    /** `false` */
    retries?: boolean | number
    
    /** `20 * 1000` */
    timeout?: number
    
    auth?: {
        username: string
        password: string
    }
    
    /** `raw -> false; else -> true` */
    gzip?: boolean
    
    cookies?: Record<string, string>
    
    /** `true` */
    print_error?: boolean
}

export interface RequestRawOptions extends RequestOptions {
    raw: true
}

export async function request (url: string | URL): Promise<string>
export async function request (url: string | URL, options: RequestRawOptions): Promise<request_lib.Response>
export async function request (url: string | URL, options: RequestOptions & { encoding: 'BINARY' }): Promise<Buffer>
export async function request (url: string | URL, options: RequestOptions): Promise<string>
export async function request (url: string | URL, {
    queries,
    
    body,
    
    json,
    
    form,
    
    proxy,
    
    method,
    
    headers,
    
    encoding,
    
    raw = false,
    
    retries = false,
    
    timeout = 20 * 1000,
    
    auth,
    
    gzip,
    
    cookies,
    
}: RequestOptions & { raw?: boolean } = { }) {
    url = url.toString()
    
    if (!url.startsWith('http'))
        url = 'http://' + url
    
    if (body && !method)
        method = 'POST'
    
    if (form) {
        // pass
    } else if (typeof body !== 'undefined' && (typeof body !== 'string' && !Buffer.isBuffer(body))) {
        json = true
        body = JSON.stringify(body)
    }
    
    
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
        method,
        proxy,
        gzip,
        encoding: null,
        resolveWithFullResponse: true,
        headers: {
            'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,ja-JP;q=0.6,ja;q=0.5',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.146 Safari/537.36',
            ... json ? { 'content-type': 'application/json' } : { }, 
            ... cookies ? { cookie: Object.entries(cookies).map( ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('; ') } : { },
            ... headers
        },
        
        ... queries  ?  { qs: queries }  :  { },
        ... (!form && body)  ?  { body }  :  { },
        ... (form === true || form === 'application/x-www-form-urlencoded')  ? { form: body } : { },
        ... (form === 'multipart/form-data') ? { formData: body as Record<string, any> } : { },
        ... timeout ? { timeout } : { },
        ... auth    ? { auth } : { },
    }
    
    let resp: request_lib.Response
    
    try {
        if (retries) {
            if (retries === true)
                retries = DEFAULT_RETRIES
            
            resp = await request_retry(retries, options)
        } else
            resp = await _request(options)
        if (![200, 201, 204, 301, 302].includes(resp.statusCode))
            throw new StatusCodeError(resp.statusCode, resp.body, options, resp)
        
    } catch (error) {
        const {
            name, 
            options: { method, url, uri, qs, body }, 
            response,
        }: {
            options: OptionsWithUri & OptionsWithUrl
            response: FullResponse
        } & Error = error
        
        error[inspect.custom] = () => {
            let s = '─'.repeat(global.WIDTH / 2) + '\n' +
                `${name.red} ${(method || 'GET').blue} ${String(url || uri).blue.underline}\n`
            
            if (qs)
                s += `\n${'Request Query:'.blue}\n` +
                    inspect(qs) + '\n'
            
            if (body)
                s += `\n${'Request Body:'.blue}\n` +
                    inspect(body) + '\n'
            
            if (name === 'StatusCodeError')
                s += `\n${'Status Code:'.yellow} ${String(error.statusCode).red}\n`
            else if (error instanceof RequestError)
                s += `\n${'Cause:'.yellow}\n` +
                    `${inspect(error.cause)}\n`
            else
                s += `\n${inspect(error)}\n`
                
            if (response) {
                s += `\n${'Response Headers:'.yellow}\n` + 
                    `${inspect(response.headers)}\n`
                
                if (response.body)
                    s += `\n${'Response Body:'.yellow}\n` +
                        `${inspect(response.body.toString())}\n`
            }
            
            s += `\n${'Stack:'.yellow}\n` +
                `${new Error().stack}\n` +
                '─'.repeat(global.WIDTH / 2)
            
            return s
        }
        
        throw error
    }
    
    if (encoding === 'BINARY')
        return resp.body
    
    encoding = (encoding || /charset=(.*)/.exec(resp.headers['content-type'])?.[1] || 'UTF-8') as Encoding
    
    if (raw)
        return resp
    
    if (!resp.body)
        return resp.body
    
    return iconv.decode((resp.body as Buffer), encoding)
}


export async function request_json <T = any> (url: string | URL, options?: RequestOptions): Promise<T> {
    const resp = await request(url, {
        json: true,
        ... options
    })
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
    return parse_html( await request(url, options) )
}


export function to_curl (url: string | URL, { queries, headers, method, body, json, proxy, exe = true }: RequestOptions & { exe?: boolean } = { }) {
    if (proxy === true)
        proxy = process.env.http_proxy
    
    url = url.toString()
    
    if (!url.startsWith('http'))
        url = 'http://' + url
    
    return (exe ? 'curl.exe' : 'curl') + 
        ' ' + ( url + (queries ? '?' : '') + qs.stringify(queries) ).quote() +
        // ( typeof proxy === 'undefined' ?
        //     ''
        //     :
        //     ( proxy  ?  ' --proxy ' + proxy.quote()  :  ' --noproxy ' + '*'.quote())
        // ) +
        ( proxy  ?  ` --proxy ${proxy.quote()}`  :  '' ) +
        ( method && method !== 'GET'  ?  ` -X ${method}`  :  '' ) +
        ( headers  ?  Object.entries(headers).map( ([key, value]) => ' -H ' + `${key}: ${value}`.quote() ).join('') : '' ) +
        ( json  ?  ' -H ' + 'content-type: application/json'.quote()  :  '') +
        ( body  ?  ' --data ' + JSON.stringify(body).quote()  :  '')
}




// ------------------------------------ RPC Client
/** POST JSON to http://127.0.0.1:8421/api/rpc */
export async function rpc (
    func: string, 
    args?: any[], 
    { url = 'http://127.0.0.1:8421/api/rpc', async: _async = false, ignore = false }: { url?: string, async?: boolean, ignore?: boolean } = { }
) {
    if (!func) {
        console.error('RPC Client Error: NO FUNC')
        throw new Error('RPC Client Error: NO FUNC')
    }
    return request_json(url, {
        body: {
            func,
            ... args?.length  ?  { args }  :  { },
            ... _async ? { async: _async } : { },
            ... ignore ? { ignore } : { },
        }
    })
}


export function rpc_curl (func: string, args: any[]) {
    const cmd = args.find( arg => typeof arg === 'object') ?
            to_curl('http://127.0.0.1:8421/api/rpc', { body: { func, args } })
        :
            to_curl('http://127.0.0.1:8421/api/rpc', { queries: { func, args } })
    return cmd
}

