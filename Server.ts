import { createServer as create_server } from 'http'
import type { Server as HttpServer, IncomingHttpHeaders } from 'http'

import zlib from 'zlib'

// --- 3-rd party
import invoke from 'lodash/invoke'
import qs from 'qs'


// --- Koa & Koa Middleware
import Koa from 'koa'
import type { Context, Next } from 'koa'

import KoaCors from '@koa/cors'
import KoaCompress from 'koa-compress'
import { userAgent as KoaUserAgent } from 'koa-useragent'


declare module 'koa' {
    interface Request {
        _path: string
        body: any
    }
    
    interface Context {
        compress: boolean
    }
}

// --- My Lib
import { request as _request } from './Net'
import { stream_to_buffer, delay, log_section, inspect } from './Utils'


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

// ------------ CONSTs
export const LOCALHOST_IPS = new Set(['127.0.0.1', '::ffff:127.0.0.1', '::1'])
export const ROUTER_IP     = '192.168.1.1'
export const PHONE_IP      = '192.168.1.113'
export const KNOWN_IPS     = new Set([...LOCALHOST_IPS, ROUTER_IP, PHONE_IP])


// ------------ MyServer
export const server = {
    app: null as Koa,
    
    handler: null as ReturnType<Koa['callback']>,
    
    server_80: null as HttpServer,
    
    
    /** start http server and listen */
    async start () {
        let app = new Koa()
        app.on('error', (error, ctx) => {
            console.error(error)
            console.log(ctx)
        })
        
        app.use(this.entry.bind(this))
        
        app.use(KoaCompress({
            br: {
                // https://nodejs.org/api/zlib.html#zlib_class_brotlioptions
                params: {
                    [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
                    [zlib.constants.BROTLI_PARAM_QUALITY]: 6  // 默认为 11 (最大压缩)，会导致 news/get 生成的 14MB 的 JSON 压缩时长高达 24s
                },
            },
            threshold: 512
        }))
        
        app.use(KoaCors({ credentials: true }))
        app.use(KoaUserAgent)
        
        app.use(this.router.bind(this))
        
        this.app = app
        
        await this.listen()
    },
    
    
    async listen () {
        this.handler = this.app.callback()
        this.server_80  = create_server(this.handler)
        
        await Promise.all([
            new Promise<void>( resolve => { this.server_80.listen(8421, resolve) }),
        ])
    },
    
    
    stop () {
        this.server_80.close()
    },
    
    
    async entry (ctx: Context, next: Next) {
        const { req: { tunnel, id }, res } = ctx
        let { req, request } = ctx
        
        if (!tunnel) {
            const buf = await stream_to_buffer(req)
            if (buf.length)
                req.body = buf
        }
        
        // ------------ parse req.body to request.body
        if (req.body)
            if (ctx.is('application/json') || ctx.is('text/plain'))
                request.body = JSON.parse(req.body.toString())
            else if (ctx.is('application/x-www-form-urlencoded'))
                request.body = qs.parse(req.body.toString())
            else if (ctx.is('multipart/form-data')) {
                throw new Error('multipart/form-data is not supported')
            } else
                request.body = req.body
        
        
        // ------------ parse request.ip
        request.ip = (request.headers['x-real-ip'] as string || request.ip).replace(/^::ffff:/, '')
        
        
        // ------------ next
        await next()
        // ------------ post processing
    },
    
    
    
    async router (ctx: Context, next: Next) {
        let { request, response } = ctx
        request.path
        request._path = decodeURIComponent(request.path)
        Object.defineProperty(request, 'path', {
            value: request._path,
            configurable: true,
            enumerable: true,
            writable: true
        })
        
        const { path }  = request
        
        // ------------ RPC
        if (path === '/api/rpc') {
            await this.rpc(ctx)
            return
        }
        
        
        // ------------ log
        this.logger(ctx)
        
        await next?.()
    },
    
    
    /** args are array http://127.0.0.1/repl/rpc?func=to_json&args=aaa&args=bbb  
        should use POST when arg is number, otherwise type will be string  
        queries:
        - func: function name
        - args?: `[]` args array
        - async?: `false` don't wait
        - ignore?: `false` don't serialize result into response
    */
    async rpc (ctx: Context) {
        const { request: { query, body }, response } = ctx
        
        let { func, args = [], ignore = false, async: _async = false }: { func: string, args: any[] | string, ignore: boolean | string, async: boolean | string } = { ...query, ...body }
        
        if (!func) throw new Error('rpc no func')
        
        if (!Array.isArray(args))
            args = [args]
        
        // ?async=1 或 ?async=0 或 ?async=false
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
            response.status = 500
            response.body = error
            throw error
        }
    },
    
    
    logger (ctx: Context) {
        const { request } = ctx
        const { query, body, path, method, req: { httpVersion, tunnel }, ip } = request
        
        const known = KNOWN_IPS.has(ip)
        const ua    = ctx.userAgent
        
        let s = ''
        
        // --- time
        s += new Date().to_time_str() + '  '
        
        
        let t: string
        // --- IP  50
        if (known)
            if (LOCALHOST_IPS.has(ip))
                t = ''
            else if (ip === ROUTER_IP)
                t = 'Router'.grey
            else if (ip === PHONE_IP)
                t = 'Phone'
            else
                t = ip
        else
            t = ip
            
        s += t.pad(50) + '  '
        
        
        // --- UA
        t = ''
        if (!known) {
            if (ua.isMobile)
                t += ' Mobile'.magenta
            if (ua.isBot)
                t += ' Robot'.blue
            if (ua.isDesktop)
                t += ' Desktop'
            if (ua.platform !== 'unknown' && !ua.os.startsWith('Windows'))
                t += '／'  + ua.platform
            if (ua.os       !== 'unknown' && ua.platform !== 'Android')
                t += '／' + ua.os
            if (ua.browser  !== 'unknown')
                t += '／' + ua.browser
            if (ua.version  !== 'unknown')
                t += '／' + ua.version
        }
        s += t.pad(50) + '  '
        
        
        // --- Tunnel/HTTP version
        s += tunnel ? 
            ('Tunnel/' + httpVersion).pad(10).cyan
        :
            ('HTTP/' + httpVersion).pad(10)
            
        s += '    '
        
        
        // --- Method  8
        if (method === 'GET')
            t = method
        else
            t = method.red
        
        s += t.pad(8)
        
        
        // --- Path 60
        if (path.toLowerCase() !== request._path.toLowerCase())
            t = request._path.blue + ' → ' + path
        else
            if (!path.includes('.'))
                t = path.yellow
            else
                t = path
        
        s += t.pad(60) + '  '
        
        
        // --- Query
        if (query && Object.keys(query).length) {
            t = `    ${inspect(query, { compact: true }).replace('[Object: null prototype] ', '')}`
            if ((s + t).width > global.WIDTH)
                s += '\n'
            s += t
        }
        
        
        // --- Body
        if (body && Object.keys(body).length)
            s += '\n' + inspect(body).replace('[Object: null prototype] ', '')
        
        
        console.log(s)
    },
}


export default server

export type Server = typeof server
