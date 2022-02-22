import { fsAsyncMethods as fs_async_methods, fsSyncMethods as fs_sync_methods } from 'fs-monkey/lib/util/lists.js'

import type fs from 'fs'


import './prototype.js'


type FS = typeof fs

// @ts-ignore
export interface UFS extends FS { }

export class UFS {
    fss: FS[]
    
    constructor (fss: any[]) {
        this.fss = fss || []
        
        const overriden_methods = Object.getOwnPropertyNames(UFS.prototype)
        
        const filter_out_overriden_methods = (method: string) => 
            !overriden_methods.includes(method)
        
        fs_sync_methods.filter(filter_out_overriden_methods).forEach( method => {
            this[method] = UFS.sync_method_wrapper.bind(this, method)
        }, this)
        
        fs_async_methods.filter(filter_out_overriden_methods).forEach( method => {
            this[method] = UFS.async_method_wrapper.bind(this, method)
        }, this)
    }
    
    
    use (fs: any) {
        this.fss = [fs, ...this.fss]
        return this
    }
    
    
    existsSync (path: string) {
        for (const fs of this.fss)
            if (fs.existsSync(path))
                return true
        return false
    }
    
    
    readdir (...args) {
        const method = 'readdir'
        
        let callback = args.last
        
        if (typeof callback !== 'function')
            callback = null
        else
            args.pop()
        
        let files = new Set()
        
        const iterate = (i: number, error: Error) => {
            if (i >= this.fss.length) return callback?.(error, [...files].sort())
            
            const fs = this.fss[i]
            
            if (!fs[method]) return iterate(i+1, new Error(`fs no method: ${method}, args: ${args}`))
            
            fs[method as string](...args, (fsError: Error & { prev: Error }, _files: string[]) => {
                if (!fsError) {
                    files = new Set([...files, ..._files])
                    return iterate(i+1, null)
                }
                fsError.prev = error
                return iterate(i+1, fsError)
            })
        }
        
        return iterate(0, null)
    }
    
    
    readdirSync (...args) {
        const method = 'readdirSync'
        
        let last_error = null
        let files = new Set()
        
        this.fss.forEach( fs => {
            try {
                if (!fs[method]) throw new Error(`fs no method: ${method}, args: ${args}`)
                
                files = new Set([...files, ...fs[method].apply(fs, args)])
            } catch (error) {
                error.prev = last_error
                last_error  = error
            }
        })
        
        if (last_error) throw last_error
        
        return [...files].sort()
    }
    
    
    createReadStream (path: string, options?: any) {
        let last_error = null
        
        for (const fs of this.fss)
            try {
                if (!fs.createReadStream)   throw new Error('method not supported: "createReadStream"')
                if (!fs.existsSync)         throw new Error('method not supported: "existsSync"')
                if (!fs.existsSync(path))   throw new Error(`文件不存在：${path}`)
                const read_stream = fs.createReadStream.apply(fs, arguments)
                if (!read_stream) throw new Error('no valid read stream')
                return read_stream
            } catch (error) {
                error.prev = last_error
                last_error  = error
            }
        
        throw last_error
    }
    
    
    createWriteStream (path: string, options?: any) {
        let last_error = null
        
        for (const fs of this.fss)
            try {
                if (!fs.createWriteStream) throw new Error('Method not supported: "createWriteStream"')
                fs.statSync(path)
                const write_stream = fs.createWriteStream.apply(fs, arguments)
                if (!write_stream) throw new Error('no valid write stream')
                return write_stream
            } catch (error) {
                error.prev = last_error
                last_error  = error
            }
        
        throw last_error
    }
    
    
    static sync_method_wrapper (this: UFS, method: string, ...args: any[]) {
        let last_error: Error = null
        for (let fs of this.fss)
            try {
                if (!fs[method]) throw new Error(`fs no method: ${method}, args: ${args}`)
                return fs[method].apply(fs, args)
            } catch (error) {
                error.prev = last_error
                last_error = error
            }
        throw last_error
    }
    
    
    static async_method_wrapper (this: UFS, method: string, ...args: any[]) {
        let callback = args.last
        
        if (typeof callback !== 'function')
            callback = null
        else
            args.pop()
            
        const iterate = (i: number, error: Error) => {
            if (i >= this.fss.length)
                return callback?.(error)
            
            const fs = this.fss[i]
            
            if (!fs[method])
                return iterate(i + 1, new Error(`fs no method: ${method}, args: ${args}`))
            
            return fs[method](...args, (fs_error: Error & { prev: Error }, ...results: any[]) => {
                if (!fs_error)
                    return callback?.call(fs, null, ...results)
                fs_error.prev = error
                return iterate(i + 1, fs_error)
            })
        }
        
        return iterate(0, null)
    }
}

export let ufs: UFS

export function set_ufs (_ufs: UFS) {
    ufs = _ufs
}

export default UFS
