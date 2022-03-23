import {
    spawn,
    type SpawnOptions,
    type ChildProcess
} from 'child_process'
import { Readable } from 'stream'

import iconv from 'iconv-lite'

import './prototype.js'
import { Encoding } from './file.js'
import { inspect } from './utils.js'

export const fp_root = `${__dirname}/`.to_slash()

export const exe_node = process.execPath.to_slash()


// ------------------------------------ start & call
interface StartOptions {
    /** `'d:/'` */
    cwd?: string
    
    /** `process.env` overwrite/add to process.env */
    env?: Record<string, string>
    
    /** `'utf-8'` child output encoding */
    encoding?: Encoding
    
    /** `true` print option (with details) */
    print?: boolean | {
        stdout: boolean
        stderr: boolean
        command: boolean
        code: boolean
    }
    
    /** `'pipe'` when 'ignore' then ignore stdio processing */
    stdio?: 'pipe' | 'ignore' | ['pipe' | 'ignore' | 'inherit', 'pipe' | 'ignore' | 'inherit', 'pipe' | 'ignore' | 'inherit']
    
    /** `false` whether to break the connection with child (ignore stdio, unref) */
    detached?: boolean
}

/** start process 
    - exe: .exe path or filename (full path is recommanded to skip path searching for better perf)
    - args: `[]` arguments list
    - options
        - cwd?: `fp_root`
        - env?: `process.env` overwrite/add to process.env
        - encoding?: `'utf-8'` child output encoding
        - print?: `true` print option (with details)
        - stdio?: `'pipe'` when 'ignore' then ignore stdio processing
        - detached?: `false` whether to break the connection with child (ignore stdio, unref)
*/
export function start (exe: string, args: string[] = [ ], {
    cwd = fp_root,
    
    encoding = 'utf-8',
    
    print = true,
    
    stdio = 'pipe',
    
    detached = false,
    
    env,
}: StartOptions = { }): ChildProcess {
    const options: SpawnOptions = {
        cwd,
        shell: false,
        windowsHide: !detached,
        stdio,
        ... env ? {
            env: { ...process.env, ...env }
        } : { },
    }
    
    if (typeof print === 'boolean')
        print = {
            stdout: print,
            stderr: print,
            command: print,
            code: print,
        }
    
    if (typeof stdio === 'string')
        stdio = [stdio, stdio, stdio]
    
    if (print.command)
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
    
    // 防止 child spawn 失败时 crash nodejs 进程
    child.on('error', error => {
        console.error(error)
    })
    
    if (stdio[0] === 'pipe')
        child.stdin.setDefaultEncoding('utf8')
    
    if (
        stdio.every(s => 
            s === 'ignore')
    )
        return child
    
    if (encoding !== 'binary') {
        if (stdio[1] === 'pipe') {
            if (encoding === 'utf-8')
                child.stdout.setEncoding('utf-8')
            else
                child.stdout = child.stdout.pipe(
                    iconv.decodeStream(encoding)
                ) as any as Readable
            
            if (print.stdout)
                child.stdout.pipe(process.stdout, { end: false })
        }
        
        if (stdio[2] === 'pipe') {
            if (encoding === 'utf-8')
                child.stderr.setEncoding('utf-8')
            else
                child.stderr = child.stderr.pipe(
                    iconv.decodeStream(encoding)
                ) as any as Readable
            
            if (print.stderr)
                child.stderr.pipe(process.stderr, { end: false })
        }
    }
    
    return child
}


export interface CallOptions extends StartOptions {
    throw_code?: boolean
    input?: string
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
    - exe: .exe path or filename (full path is recommanded to skip path searching for better perf)
    - args: `[]` arguments list
    - options?:
        - cwd?: `'d:/'`
        - env?: `process.env` overwrite/add to process.env
        - encoding?: `'utf-8'` child output encoding
        - print?: `true` print option (with details)
        - stdio?: `'pipe'` when 'ignore' then ignore stdio processing
        - input?: string
        - detached?: `false` whether to break the connection with child (ignore stdio, unref)
        - throw_code?: `true` whether to throw Error when code is not 0
*/
export async function call (exe: string, args?: string[]): Promise<CallResult<string>>
export async function call (exe: string, args?: string[], options?: CallOptions & { encoding?: 'utf-8' | 'gb18030' }): Promise<CallResult<string>>
export async function call (exe: string, args?: string[], options?: CallOptions & { encoding: 'binary' }): Promise<CallResult<Buffer>>
export async function call (exe: string, args: string[] = [], options: CallOptions = { }): Promise<CallResult<string | Buffer>> {
    const {
        encoding = 'utf-8', 
        throw_code = true,
        input,
    } = options
    
    let {
        stdio = 'pipe',
        print = true
    } = options
    
    if (typeof print === 'boolean')
        print = {
            command: print,
            stdout: print,
            stderr: print,
            code: print,
        }
    
    if (typeof stdio === 'string')
        stdio = [stdio, stdio, stdio]
    
    const cmd = 
        (exe.includes(' ') ? exe.quote() : exe) + 
        args.length ? (
            ' ' + 
            args.map(arg => 
                arg.includes(' ') ? arg.quote() : arg
            ).join(' ')
        ) : ''
    
    if (print.command)
        console.log(cmd.blue)
    
    let child = start(exe, args, {
        ...options,
        print: false,
    })
    
    if (input)
        child.stdin.write(input)
    
    // --- collect output
    let stdouts: (string | Buffer)[] = [ ]
    let stderrs: (string | Buffer)[] = [ ]
    
    let code: number | null, 
        signal: NodeJS.Signals
    
    await Promise.all([
        new Promise<void>(resolve => {
            child.once('exit', (_code, _signal) => {
                code = _code
                signal = _signal
                resolve()
            })
        }),
        (async () => {
            if (stdio[1] === 'pipe')
                for await (const chunk of child.stdout as AsyncIterable<string | Buffer>) {
                    if (encoding !== 'binary' && print.stdout)
                        process.stdout.write(chunk)
                    stdouts.push(chunk)
                }
        })(),
        (async () => {
            if (stdio[2] === 'pipe')
                for await (const chunk of child.stderr as AsyncIterable<string | Buffer>) {
                    if (encoding !== 'binary' && print.stderr)
                        process.stderr.write(chunk)
                    stderrs.push(chunk)
                }
        })()
    ])
    
    const message = `process(${child.pid}) (${cmd}) exited ${code}${ signal ? `, by signal ${ signal }` : '' }.`
    
    if (print.code || code || signal)
        console.log(message[code || signal ? 'red' : 'blue'])
    
    const result = {
        pid: child.pid,
        
        stdout: encoding === 'binary' ?
            Buffer.concat(stdouts as Buffer[])
        :
            (stdouts as string[]).join(''),
        
        stderr: encoding === 'binary' ?
            Buffer.concat(stderrs as Buffer[])
        :
            (stderrs as string[]).join(''),
        
        code,
        
        signal,
        
        child,
        
        [inspect.custom] () {
            return inspect(this, { omit: ['child'] })
        }
    }
    
    if (code && throw_code)
        throw Object.assign(
            new Error(message), 
            result
        )
    
    return result
}


/** call node <js> for result
    - js: .js path (relative path will resolve based on cwd)
    - args: `[]` arguments list
    - options
        - cwd?: `'d:/'`
        - env?: `process.env` overwrite/add to process.env
        - encoding?: `'utf-8'` child process output encoding
        - print?: `true` print option (with details)
        - stdio?: `'pipe'` when 'ignore' then ignore stdio processing
        - detached?: `false` whether to break the connection with child (ignore stdio, unref)
        - throw_code?: `true` whether to throw Error when code is not 0
*/
export async function call_node (js: string, args: string[] = [], options?: CallOptions & { encoding?: 'utf-8' | 'gb18030' }) {
    return call(exe_node, [js, ...args], options)
}

