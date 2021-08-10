import { spawn } from 'child_process'
import type { SpawnOptions, ChildProcess } from 'child_process'
import { Readable, Writable } from 'stream'


import { WritableStreamBuffer } from 'stream-buffers'
import type { WritableStreamBufferOptions } from 'stream-buffers'
import iconv from 'iconv-lite'


import './prototype'
import { Encoding } from './file'
import { inspect } from './utils'


export const EXE_NODE = process.execPath.to_slash()

// ------------------------------------ Start & Call
interface StartOptions {
    /** `'D:/'` */
    cwd?: string
    
    /** `process.env` overwrite/add to process.env */
    env?: Record<string, string>
    
    /** `'UTF-8'` child output encoding */
    encoding?: Encoding
    
    /** `true` print option (with details) */
    print?: boolean | {
            command?: boolean
            stdout?: boolean
            stderr?: boolean
            code?: boolean
            error?: boolean
        }
    
    /** `'pipe'` when 'ignore' then ignore stdio processing */
    stdio?: 'pipe' | 'ignore'
    
    /** `false` whether to break the connection with child (ignore stdio, unref) */
    detached?: boolean
}

/** start process 
    - exe: .exe path or filename (full path is recommanded to skip PATH searching for better perf)
    - args: `[]` arguments list
    - options
        - cwd?: `'D:/'`
        - env?: `process.env` overwrite/add to process.env
        - encoding?: `'UTF-8'` child output encoding
        - print?: `true` print option (with details)
        - stdio?: `'pipe'` when 'ignore' then ignore stdio processing
        - detached?: `false` whether to break the connection with child (ignore stdio, unref)
*/
export function start (exe: string, args: string[] = [], {
    cwd = 'D:/',
    
    encoding = 'UTF-8',
    
    print = true,
    
    stdio = 'pipe',
    
    detached = false,
    
    env,
    
}: StartOptions = { }): ChildProcess {
    const options: SpawnOptions = {
        cwd,
        shell: false,
        windowsHide: true,
        stdio,
        ... env  ?  { ...process.env, ...env }  :  { },
    }
    
    if (print)
        console.log(`${exe} ${ args.map(arg => arg.includes(' ') ? arg.quote() : arg).join(' ') }`.blue)
    
    if (detached) {
        let child = spawn(exe, args, {
            ...options,
            stdio: 'ignore',
            detached: true,
        })
        
        child.unref()
        return child
    }
    
    let child = spawn(exe, args, options)
    
    if (stdio === 'pipe')
        child.stdin.setDefaultEncoding('utf8')
    
    // prevent child spawn error crashing NodeJS process
    child.on('error', error => {
        console.error(error)
    })
    
    if (stdio === 'ignore') return child
    
    if (encoding !== 'BINARY') {
        child.stdout = child.stdout.pipe(iconv.decodeStream(encoding)) as any as Readable
        child.stderr = child.stderr.pipe(iconv.decodeStream(encoding)) as any as Readable
        
        if (print) {
            child.stdout.on('data', (chunk) => {
                process.stdout.write(chunk)
            })
            child.stderr.on('data', (chunk) => {
                process.stderr.write(chunk)
            })
        }
    }
    
    return child
}


export interface CallOptions extends StartOptions {
    /** `true` whether to throw Error when code is not 0 */
    throw_code?: boolean
}

export interface CallResult<T = string> {
    pid: number
    stdout: T
    stderr: T
    code: number | null
    signal: NodeJS.Signals | null
    child: ChildProcess
    [inspect.custom] (): string
}


/** call process for result
    - exe: .exe path or filename (full path is recommanded to skip PATH searching for better perf)
    - args: `[]` arguments list
    - options
        - cwd?: `'D:/'`
        - env?: `process.env` overwrite/add to process.env
        - encoding?: `'UTF-8'` child output encoding
        - print?: `true` print option (with details)
        - stdio?: `'pipe'` when 'ignore' then ignore stdio processing
        - detached?: `false` whether to break the connection with child (ignore stdio, unref)
        - throw_code?: `true` whether to throw Error when code is not 0
*/
export async function call (exe: string, args?: string[]): Promise<CallResult<string>>
export async function call (exe: string, args?: string[], options?: CallOptions & { encoding: 'BINARY', init_buffer_size?: number }): Promise<CallResult<Buffer>>
export async function call (exe: string, args?: string[], options?: CallOptions & { encoding?: 'UTF-8' | 'GB18030' }): Promise<CallResult<string>>
export async function call (exe: string, args: string[] = [], {
    encoding = 'UTF-8', 
    
    print = true,
    
    init_buffer_size,
    
    throw_code = true,
}: CallOptions & { init_buffer_size?: number } = { }): Promise<CallResult<string | Buffer>> {
    const print_options = typeof print === 'boolean' ?
            {
                command: print,
                stdout: print,
                stderr: print,
                code: print,
                error: print
            }
        :
            print
    
    const cmd = `${exe} ${ args.map(arg => arg.includes(' ') ? arg.quote() : arg).join(' ') }`
    
    if (print_options.command)
        console.log(cmd.blue)
    
    let child = start(exe, args, Object.assign(arguments[2] || { }, { print: false }))
    
    // --- collect output
    let stdout: string | WritableStreamBuffer
    let stderr: string | WritableStreamBuffer
    
    
    if (encoding !== 'BINARY') {
        stdout = ''
        stderr = ''
        
        child.stdout.on('data', chunk => {
            if (print_options.stdout)
                process.stdout.write(chunk)
            
            stdout += chunk
        })
        
        child.stderr.on('data', chunk => {
            if (print_options.stderr)
                process.stderr.write(chunk)
            
            stderr += chunk
        })
    } else {
        const stream_buffer_options: WritableStreamBufferOptions = init_buffer_size ? {
            initialSize: init_buffer_size,
            incrementAmount: init_buffer_size,
        } : { }
        
        stdout = new WritableStreamBuffer(stream_buffer_options)
        stderr = new WritableStreamBuffer(stream_buffer_options)
        
        if (print_options.stdout)
            child.stdout.pipe(stdout as WritableStreamBuffer)
        if (print_options.stderr)
            child.stderr.pipe(stderr as WritableStreamBuffer)
    }
    
    
    let code: number | null, 
        signal: NodeJS.Signals
    
    await Promise.all([
        new Promise<void>( resolve => {
            child.stdout.on('end', () => { resolve() })
        }),
        new Promise<void>( resolve => {
            child.stderr.on('end', () => { resolve() })
        }),
        new Promise<void>( resolve => {
            child.on('exit', (_code, _signal: NodeJS.Signals) => {
                code = _code
                signal = _signal
                resolve()
            })
        })
    ])
    
    const message = `Process(${ child.pid }) '${ cmd }' exited ${ code }${ signal ? `, by signal ${ signal }` : '' }.  `
    
    if (print_options.code || code || signal)
        console.log(message[!code && !signal ? 'green' : 'red'].pad(global.WIDTH || 240, { character: '─' }))
    
    const result = {
        pid: child.pid,
        stdout: encoding !== 'BINARY' ? (stdout as string) : ((stdout as WritableStreamBuffer).getContents() || Buffer.alloc(0)),
        stderr: encoding !== 'BINARY' ? (stderr as string) : ((stderr as WritableStreamBuffer).getContents() || Buffer.alloc(0)),
        code,
        signal,
        child,
        [inspect.custom] () {
            return inspect(this, { omit: ['child'] })
        }
    }
    
    if (code && throw_code)
        throw Object.assign(new Error(message), result)
    
    return result
}


/** call node <js> for result
    - js: .js path (relative path will resolve based on cwd)
    - args: `[]` arguments list
    - options
        - cwd?: `'D:/'`
        - env?: `process.env` overwrite/add to process.env
        - encoding?: `'UTF-8'` child process output encoding
        - print?: `true` print option (with details)
        - stdio?: `'pipe'` when 'ignore' then ignore stdio processing
        - detached?: `false` whether to break the connection with child (ignore stdio, unref)
        - throw_code?: `true` whether to throw Error when code is not 0
*/
export async function call_node (js: string, args: string[] = [], options?: CallOptions & { encoding?: 'UTF-8' | 'GB18030' }) {
    return call(EXE_NODE, [js, ...args], options)
}

