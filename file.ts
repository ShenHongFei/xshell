import {
    promises as fsp,
    default as fs,
} from 'fs'
type FileHandle = fsp.FileHandle & { fp: string }

import path from 'upath'
import iconv from 'iconv-lite'
import fse from 'fs-extra'
import rimraf from 'rimraf'

import debounce from 'lodash/debounce.js'


import MFS from 'memfs'
declare module 'memfs' {
    interface IFs {
        join: typeof path.join
        is_mfs: true
    }
}

import { to_json } from './prototype.js'
export * from './ufs.js'


export { MFS }

export type Encoding = 'utf-8' | 'gb18030' | 'shift-jis' | 'binary'


/** Does the file/folder pointed to by fp exist? */
export function fexists (fp: string, { print = true }: { print?: boolean } = { }) {
    const exists = fs.existsSync(fp)
    
    if (print)
        console.log(
            exists ? 'exists:' : 'not exists:',
            fp
        )
    
    return exists
}


/**
    open file, return FileHandle  
    Some characters (`< > : " / \ | ? *`) are reserved under Windows as documented
    by [Naming Files, Paths, and Namespaces](https://docs.microsoft.com/en-us/windows/desktop/FileIO/naming-a-file). Under NTFS, if the filename contains
    a colon, Node.js will open a file system stream, as described by [this MSDN page](https://docs.microsoft.com/en-us/windows/desktop/FileIO/using-streams).
    
    - flags: `'r'`
    - options?:
        - mode?: `'0o666'` Sets the file mode (permission and sticky bits) if the file is created.
*/
export async function fopen (
    fp: string,
    flags: string | number,
    {
        mode,
        print
    }: {
        mode?: fs.Mode
        print?: boolean
    } = { }
) {
    if (print)
        console.log('fopen:', fp)
    return Object.assign(
        await fsp.open(fp, flags, mode),
        {
            fp,
            flags,
            mode
        }
    )
}


export function create_mfs () {
    let mfs = MFS.createFsFromVolume(
        new MFS.Volume()
    )
    
    mfs.join = path.join.bind(path)
    mfs.is_mfs = true
    
    return mfs
}


export async function fread (fp: string): Promise<string>
export async function fread (fp: string, { dir, encoding, print }?: { dir?: string, encoding: 'binary', print?: boolean }): Promise<Buffer>
export async function fread (fp: string, { dir, encoding, print }?: { dir?: string, encoding?: Encoding | 'auto', print?: boolean }): Promise<string>
export async function fread (fp: string, {
    dir, 
    encoding = 'utf-8', 
    print = true
}: {
    dir?: string
    encoding?: Encoding | 'auto'
    print?: boolean } = { }
) {
    if (dir)
        fp = path.join(dir, fp)
    else if (!path.isAbsolute(fp))
        throw new Error('fp must be absolute path, or pass in \'dir\' parameter')
    
    if (print)
        console.log(`read: ${fp}`)
    
    const buffer = await fsp.readFile(fp)
    
    if (encoding === 'binary')
        return buffer
    
    if (encoding === 'utf-8')
        return buffer.toString('utf8')
    
    if (encoding === 'auto') {
        const { detect } = await import('chardet')
        encoding = detect(buffer) as any
        if (print)
            console.log(`${fp} probably has encoding: ${encoding.toLowerCase()}`)
    }
    
    return iconv.decode(buffer, encoding)
}

export async function fread_lines (fp: string, options: { dir?: string, encoding?: Exclude<Encoding, 'binary'> | 'auto', print?: boolean } = { }) {
    return (await fread(fp, options))
        .split_lines()
}

export async function fread_json <T = any> (fp: string, options: { dir?: string, encoding?: Encoding, print?: boolean } = { }): Promise<T> {
    return JSON.parse(
        await fread(fp, options)
    )
}


export async function fwrite (fp: string | FileHandle, data: Buffer, options?: { dir?: string, print?: boolean, mkdir?: boolean }): Promise<void>
export async function fwrite (fp: string | FileHandle, data: any, options?: { dir?: string, encoding?: Encoding, print?: boolean, mkdir?: boolean }): Promise<void>
export async function fwrite (
    fp: string | FileHandle,
    data: any,
    {
        dir,
        encoding = 'utf-8',
        print = true,
        mkdir = false,
    }: {
        dir?: string
        encoding?: Encoding
        print?: boolean
        mkdir?: boolean
    } = { }
) {
    const is_handle = typeof fp === 'object' && fp && 'fd' in fp
    if (is_handle) {
        if (print)
            console.log('write:', (fp as FileHandle).fp)
    } else {
        if (dir)
            fp = path.join(dir, fp)
        else if (!path.isAbsolute(fp as string))
            throw new Error('fp must be absolute path, or pass in "dir" parameter')
        
        if (print)
            console.log('write:', fp)
    }
    
    if (encoding === 'gb18030')
        data = iconv.encode(data, encoding)
    
    if (!Buffer.isBuffer(data) && typeof data !== 'string')
        data = to_json(data)
    
    try {
        await fsp.writeFile(fp, data)
    } catch (error) {
        if (!mkdir || error.code !== 'ENOENT' || is_handle)
            throw error
        
        await fmkdir((fp as string).fdir)
        await fsp.writeFile(fp, data)
    }
}

export async function fappend (fp: string, data: any, { dir, print = true }: { dir?: string, print?: boolean } = { }) {
    if (dir)
        fp = path.join(dir, fp)
    else if (!path.isAbsolute(fp))
        throw new Error('fp must be absolute path, or pass in "dir" parameter')
    
    if (print)
        console.log('append:', fp)
        
    if (!Buffer.isBuffer(data) && typeof data !== 'string')
        throw new Error('data is not Buffer or string')
        
    await fsp.appendFile(fp, data)
}


/**
    - fpd: absolute path of directory
    - optoins?:
        - deep?: `false` recursively
        - absolute?: `false` Return, print full path instead of relative path
        - print?: `true`
        - filter?: `true`  RegExp | (fp: string) => any, Note that when deep = true, 
            directories and files in directories that are filtered out by the filter will not be included in the results
*/
export async function flist (
    fpd: string,
    options: {
        filter?: RegExp | ((fp: string) => any)
        deep?: boolean
        absolute?: boolean
        print?: boolean
    } = { }
): Promise<string[]> {
    const {
        filter,
        deep = false,
        absolute = false,
        print = true,
    } = options
    
    if (!path.isAbsolute(fpd))
        throw new Error(`fpd (${fpd}) must be absolute path`)
    
    if (!fpd.endsWith('/'))
        throw new Error(`Argument fpd (${fpd}) must end with /`)
    
    // readdir withFileTypes 参数在底层有什么区别，速度上有什么差异
    // 都调用了 uv_fs_scandir, 且调用参数相同，仅仅是 Node.js 侧的回调不同 AfterScanDir / AfterScanDirWithTypes
    // 回调中通过 uv_fs_scandir_next 获取到每个条目的信息，而 uv_fs_scandir_next 中都会读取 type
    // 速度上：都在 0.2 ms 左右就可以完成
    
    const files = await fsp.readdir(fpd, {
        withFileTypes: true,
        encoding: 'utf-8',
    })
    
    const filter_regexp = filter instanceof RegExp
    const filter_fn = Boolean(filter && !filter_regexp)
    
    let fps: string[] = [ ]
    
    for (const file of files) {
        const fp = 
            (absolute ? fpd : '') +
            file.name +
            (file.isDirectory() ? '/' : '')
        
        if (filter_regexp && !filter.test(fp))
            continue
        
        if (filter_fn && !(filter as Function)(fp))
            continue
        
        if (print)
            console.log(
                deep || absolute ? fpd + fp : fp
            )
        
        fps.push(fp)
    }
    
    return deep ? (
                await Promise.all(
                    fps.map(async fp => 
                        fp.endsWith('/') ?
                            [
                                fp,
                                ... (await flist(
                                    absolute ? fp : fpd + fp,
                                    options
                                )).map(fp_ => 
                                    absolute ? fp_ : fp + fp_)
                            ]
                        :
                            fp)
                )
            ).flat()
        :
            fps
}


export async function fstat (fp: string) {
    if (!path.isAbsolute(fp))
        throw new Error(`fp (${fp}) must be absolute path`)
    
    return fsp.stat(fp, { bigint: true })
}


/** delete file or directory (use rimraf to delete directory fast)  
    - fp: path
    - options?:
        - print?: `true` (effective only delete single file)
*/
export async function fdelete (fp: string, { print = true, fast = false }: { print?: boolean, fast?: boolean } = { }) {
    if (fp.length < 6) throw new Error(`${fp} too short`)
    if (!path.isAbsolute(fp))
        throw new Error('fpd must be absolute path')
    
    if (fp.endsWith('/')) {
        if (print)
            console.log(`delete directory: ${fp}`.red)
        await new Promise<void>((resolve, reject) => {
            rimraf(fp, { glob: false, disableGlob: true }, error => {
                if (error)
                    reject(error)
                else
                    resolve()
            })
        })
    } else {
        if (print)
            console.log('delete:', fp)
        await fsp.unlink(fp)
    }
}


/** copy file or direcotry
    - src: src file/directory absolute path
    - dst: dst file/directory absolute path
    @example
    fcopy('d:/temp/camera/', 'd:/camera/')
*/
export async function fcopy (fp_src: string, fp_dst: string, {
    print = true,
    overwrite = true,
}: {
    print?: boolean
    overwrite?: boolean
} = { }) {
    if (fp_src.endsWith('/') !== fp_dst.endsWith('/'))
        throw new Error('fp_src and fp_dst must be both file path or directory path')
    
    if (!path.isAbsolute(fp_src) || !path.isAbsolute(fp_dst))
        throw new Error('fp_src and fp_dst must be absolute path')
    
    if (print)
        console.log(`copy: ${fp_src} → ${fp_dst}`)
    
    await fse.copy(fp_src, fp_dst, { overwrite, errorOnExist: true })
}


/** move file or direcotry
    - src: src file/directory absolute path
    - dst: dst file/directory absolute path
    @example
    fmove('d:/temp/camera/', 'd:/camera/')
*/
export async function fmove (src: string, dst: string, {
    overwrite = false,
    print = true
}: {
    overwrite?: boolean
    print?: boolean
} = { }) {
    if (src.endsWith('/') !== dst.endsWith('/'))
        throw new Error('src and dst must be both file path or directory path')
    
    if (!path.isAbsolute(src) || !path.isAbsolute(dst))
        throw new Error('src and dst must be absolute path')
    
    if (print)
        console.log(`move: ${src} → ${dst}`)
    
    await fse.move(src, dst, { overwrite })
}


/** rename file  
    - fp:  current filename/path
    - fp_: new filename/path
    - options?:
        - fpd?: fp and fp_ is in same directory
        - print?: `true`
        - overwrite?: `true`  better performance without check
 */
export async function frename (
    fp: string, 
    fp_: string,
    {
        fpd,
        print = true,
        overwrite = true
    }: {
        fpd?: string
        print?: boolean
        overwrite?: boolean
    } = { }
) {
    if (fpd) {
        fp = path.join(fpd, fp)
        fp_ = path.join(fpd, fp_)
    } else if (!path.isAbsolute(fp) || !path.isAbsolute(fp_))
        throw new Error('fp and fp_ must be absolute path')
    
    if (print)
        console.log('rename:', fp, '→', fp_)
    
    if (!overwrite && fexists(fp_))
        throw new Error(`file already exists：${fp_}`)
    
    await fsp.rename(fp, fp_)
}


/**
    Create folders recursively, make sure the folder pointed to by fpd exists  
    Returns the first created folder or undefined
    
    - fpd: Folder full path
    - options?:
        - print?: `true`
        - mode?: `'0o777'`
*/
export async function fmkdir (
    fpd: string,
    {
        print = true,
        mode,
    }: {
        print?: boolean
        
        /** `0o777` A file mode. If a string is passed, it is parsed as an octal integer. */
        mode?: string | number
    } = { }
) {
    if (!path.isAbsolute(fpd))
        throw new Error(`fpd must be an absolute path: ${fpd}`)
    
    if (!fpd.endsWith('/'))
        throw new Error(`fpd must end with /: ${fpd}`)
    
    // CallingfsPromises.mkdir() when path is a directory that exists results in a rejection only when recursive is false.
    const fpd_ = (
        await fsp.mkdir(fpd, { recursive: true, mode })
    )?.replaceAll('\\', '/')
    
    if (fpd_) {
        if (print)
            console.log('folder created:', fpd)
    } else
        if (print)
            console.log('folder already exists:', fpd)
    
    return fpd_
}


/** 
    - fp_real: current real file/directory path
    - fp_link: target file/directory path
*/
export async function flink (
    fp_real: string, 
    fp_link: string, 
    {
        junction = false,
        print = true 
    }: { 
        junction?: boolean
        print?: boolean
} = { }) {
    if (!path.isAbsolute(fp_real) || !path.isAbsolute(fp_link))
        throw new Error('fp must be absolute path')
    
    const is_fpd_real = fp_real.endsWith('/')
    const is_fpd_link = fp_link.endsWith('/')
    
    if (is_fpd_real !== is_fpd_link)
        throw new Error('fp_real and fp_link must be both file path or folder path')
    
    if (fexists(fp_link))
        throw new Error(`${ is_fpd_link ? 'folder' : 'file' } exists: ${fp_link}, could not create link`)
    
    if (print)
        console.log(`source file ${fp_real} linked to ${fp_link}`)
    
    if (junction)
        fsp.symlink(fp_real, fp_link, 'junction')
    else
        fsp.symlink(fp_real, fp_link, is_fpd_real ? 'dir' : 'file')
}


export let fwatchers: Record<string, fs.FSWatcher> = { }

/**
    - fp: path of file or directory
    - callback: called when modified
    - exec: call callback when watch is executed
    
    save fs.FSWatcher in watchers, subsequent call will auto close existing watcher for the same fp
    
    https://nodejs.org/dist/latest-v15.x/docs/api/fs.html#fs_fs_watch_filename_options_listener  
    The listener callback gets two arguments (event, fname). 
        event is either 'rename' or 'change', and filename is the name of the file which triggered the event.
        On most platforms, 'rename' is emitted whenever a filename appears or disappears in the directory.
    
    The listener callback is attached to the 'change' event fired by fs.FSWatcher, but it is not the same thing as the 'change' value of event.  
    
*/
export async function fwatch (
    fp: string,
    onchange: (event: string, fname: string) => any, 
    { exec = true }: { exec?: boolean } = { }
) {
    if (!path.isAbsolute(fp))
        throw new Error('fp must be absolute path')
    
    const _watcher = fwatchers[fp]
    if (_watcher)
        _watcher.close()
    
    if (exec)
        await onchange('change', fp.fname)
    
    const start = new Date().getTime()
    
    const debounced_onchange = debounce(
        (event, fname) => {
            if (new Date().getTime() - start < 800)
                return
            console.log(`file ${event}: ${fname}`)
            onchange(event, path.normalize(fname))
        },
        500,
        { leading: false, trailing: true }
    )
    
    let watcher = fs.watch(fp, debounced_onchange)
    watcher.on('error', error => {
        console.error(error)
    })
    return fwatchers[fp] = watcher
}


/** open a file and replace certain pattern */
export async function freplace (fp: string, pattern: string | RegExp, replacement: string) {
    await fwrite(
        fp,
        (await fread(fp))
            .replaceAll(pattern, replacement)
    )
}

/** convert file encoding to UTF-8
    - fp: file absolute path
    - options?:
        - dryrun?: `true`
        - encoding?: `'auto'`
*/
export async function f2utf8 (fp: string, {
    dryrun = true,
    encoding = 'auto',
}: {
    dryrun?: boolean
    encoding?: Encoding | 'auto'
} = { }) {
    const text = await fread(fp, { encoding })
    if (dryrun) {
        console.log(text.slice(0, 10000))
        return
    }
    
    const fp_bak = `${fp.fdir}${fp.fname.replace(/(.*?)(\.[^.]+)?$/, '$1.bak$2')}`
    if (!fexists(fp_bak))
        await fcopy(fp, fp_bak)
    
    await fwrite(fp, text)
}

