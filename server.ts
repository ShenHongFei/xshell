import { createServer as http_create_server } from 'http'
import type { Server as HttpServer, IncomingHttpHeaders } from 'http'

import zlib from 'zlib'

// --- 3rd party
import invoke from 'lodash/invoke'
import qs from 'qs'


// --- koa & koa middleware
import Koa from 'koa'
import type { Context, Next } from 'koa'

import KoaCors from '@koa/cors'
import KoaCompress from 'koa-compress'
import { userAgent as KoaUserAgent } from 'koa-useragent'
import type { UserAgentContext } from 'koa-useragent'


declare module 'koa' {
    interface Request {
        _path: string
        body: any
    }
    
    interface Context {
        compress: boolean
        userAgent: UserAgentContext['userAgent'] & { isWechat: boolean }
    }
}

// --- my libs
import { request as _request } from './net'
import { stream_to_buffer, inspect } from './utils'
import { output_width } from './utils'


declare module 'http' {
    interface IncomingMessage {
        tunnel?: boolean
        id?: string
        body?: Buffer
    }
    
    interface ServerResponse {
        body?: Buffer
    }
}

interface Message {
    id: string
    headers: IncomingHttpHeaders
    body: {
        buffer: Buffer
    }
}

// ------------ my server
export const server = {
    app: null as Koa,
    
    handler: null as ReturnType<Koa['callback']>,
    
    server_80: null as HttpServer,
    
    
    /** start http server and listen */
    async start () {
        // --- init koa app
        let app = new Koa()
        
        app.on('error', (error, ctx) => {
            console.error(error)
            console.log(ctx)
        })
        
        app.use(
            this.entry.bind(this)
        )
        
        app.use(KoaCompress({
            br: {
                // https://nodejs.org/api/zlib.html#zlib_class_brotlioptions
                params: {
                    [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
                    [zlib.constants.BROTLI_PARAM_QUALITY]: 6  // default 11 (maximized compression), may lead to news/get generated 14mb json taking 24s
                },
            },
            threshold: 512
        }))
        
        app.use(
            KoaCors({ credentials: true })
        )
        app.use(KoaUserAgent)
        
        app.use(this.router.bind(this))
        
        this.app = app
        
        this.handler = this.app.callback()
        
        this.server_80  = http_create_server(this.handler)
        
        await new Promise<void>(resolve => {
            this.server_80.listen(8421, resolve)
        })
    },
    
    
    stop () {
        this.server_80.close()
    },
    
    
    async entry (ctx: Context, next: Next) {
        let { response } = ctx
        
        await this.parse(ctx)
        
        // ------------ next
        try {
            await next()
        } catch (error) {
            if (error.status !== 404)
                console.error(error)
            response.status = error.status || 500
            response.body = inspect(error, { colors: false })
            response.type = 'text/plain'
        }
    },
    
    
    /** 
        parse req.body to request.body  
        process request.ip
    */
    async parse (ctx: Context) {
        const {
            request,
            req,
            req: { tunnel },
        } = ctx
        
        if (!tunnel) {
            const buf = await stream_to_buffer(req)
            if (buf.length)
                req.body = buf
        }
        
        // --- parse request.ip
        request.ip = (request.headers['x-real-ip'] as string || request.ip).replace(/^::ffff:/, '')
        
        
        // --- parse body
        if (!req.body) return
        
        if (ctx.is('application/json') || ctx.is('text/plain'))
            request.body = JSON.parse(req.body.toString())
        else if (ctx.is('application/x-www-form-urlencoded'))
            request.body = qs.parse(req.body.toString())
        else if (ctx.is('multipart/form-data')) {
            throw new Error('multipart/form-data is not supported')
        } else
            request.body = req.body
    },
    
    
    async router (ctx: Context, next: Next) {
        let { request } = ctx
        const _path = request._path = decodeURIComponent(request.path)
        Object.defineProperty(request, 'path', {
            value: _path,
            configurable: true,
            enumerable: true,
            writable: true
        })
        
        const { path }  = request
        
        // ------------ /repl/rpc
        if (path === '/api/rpc') {
            await this.rpc(ctx)
            return
        }
        
        
        // ------------ log
        this.logger(ctx)
        
        // ------------ repl_router hook
        if (await global.repl_router?.(ctx))
            return
        
        await next?.()
    },
    
    
    /** args are array http://localhost/repl/rpc?func=to_json&args=aaa&args=bbb  
        should use POST when arg is number, otherwise type will be string  
        queries:
        - func: function name
        - args?: `[]` args array
        - ignore?: `false` don't serialize result into response
        - async?: `false` don't wait
    */
    async rpc (ctx: Context) {
        const { request: { query, body }, response } = ctx
        
        let { func, args = [], ignore = false, async: _async = false }: { func: string, args: any[] | string, ignore: boolean | string, async: boolean | string } = { ...query, ...body }
        
        if (!func) {
            let error = new Error('rpc no func')
            ;(error as any).status = 400
            throw error
        }
        
        if (!Array.isArray(args))
            args = [args]
        
        // ?async=1 or ?async=0 or ?async=false
        if (typeof ignore === 'string')
            ignore = ignore.to_bool()
        
        if (typeof _async === 'string')
            _async = _async.to_bool()
        
        try {
            const presult = invoke(global, func, ...args)
            
            if (_async) {
                response.body = ''
                return
            }
            
            const result = await presult
            
            if (ignore) {
                response.body = ''
                return
            }
            
            response.body = JSON.stringify(result) || ''
        } catch (error) {
            error.status = 500
            throw error
        }
    },
    
    
    logger (ctx: Context) {
        const { request } = ctx
        const {
            query, 
            body, 
            path, _path, 
            protocol,
            host,
            req: { httpVersion: http_version },
            ip,
        } = request
        
        let { method } = request
        
        const ua = ctx.userAgent
        
        
        let s = ''
        
        // --- time
        s += `${new Date().to_time_str()}    `
        
        
        // --- ip
        s += (ip || '').pad(40) + '  '
        
        
        // --- ua
        s += (() => {
            let t = ''
            if (ua.isMobile)
                t += 'mobile'
            if (ua.isDesktop)
                t += 'desktop'
            if (ua.isBot)
                t += `${ t ? ' ' : '' }${'robot'.blue}`
            if (ua.platform !== 'unknown' && !ua.os.startsWith('Windows'))
                t += '／'  + ua.platform.toLowerCase().replace('apple mac', 'mac')
            if (ua.os       !== 'unknown' && ua.platform !== 'Android')
                t += '／' + ua.os.toLowerCase()
            if (ua.browser  !== 'unknown')
                t += '／' + ua.browser.toLowerCase()
            if (ua.isWechat)
                t += '／weixin'
            if (ua.version  !== 'unknown')
                t += '／' + ua.version.split('.').slice(0, 2).join('.')
            return t
        })().pad(40) + '  '
        
        
        // --- https／2.0
        // if (req.tunnel) `tunnel／${http_version}`.pad(10).cyan
        s += `${`${protocol.pad(5)}／${http_version}`.pad(10)}    `
        
        
        // --- method
        method = method.toLowerCase()
        s += method === 'get' ? method.pad(10) : method.pad(10).yellow
        
        
        // --- host
        s += `${host.pad(20)}  `
        
        
        // --- path
        s += (() => {
            if (path.toLowerCase() !== _path.toLowerCase())
                return `${_path.blue} → ${path}`
            if (!path.includes('.'))
                return path.yellow
            return path
        })()
        
        
        // --- query
        if (Object.keys(query).length) {
            let t = inspect(query, { compact: true })
                .replace('[Object: null prototype] ', '')
            
            if (t.endsWith('\n'))
                t = t.slice(0, -1)
            
            s += (s + t).width > output_width ? '\n' : '    '
            
            s += t
        }
        
        
        // --- body
        if (body && Object.keys(body).length)
            s += '\n' + inspect(body).replace('[Object: null prototype] ', '')
        
        
        // --- print log
        console.log(s)
    },
}


export default server

export type Server = typeof server
