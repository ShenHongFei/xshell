import { promises as fsp, watch } from 'fs'
import type fs from 'fs'

import path from 'upath'
import iconv from 'iconv-lite'
import { readdirAsync } from 'readdir-enhanced'
import fse from 'fs-extra'
import rimraf from 'rimraf'

import debounce from 'lodash/debounce'


import MFS from 'memfs'
declare module 'memfs' {
    interface IFs {
        join: typeof path.join
        is_mfs: true
    }
}

import { to_json } from './prototype'
import { dedent } from './utils'
export * from './ufs'

export { MFS }

export type Encoding = 'utf-8' | 'gb18030' | 'shift-jis' | 'binary'


export function create_mfs () {
    mfs = MFS.createFsFromVolume(
        new MFS.Volume()
    )
    
    mfs.join = path.join.bind(path)
    mfs.is_mfs = true
    
    return mfs
}

export let mfs: MFS.IFs


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
        throw new Error('fp must be absolute path, or pass in "dir" parameter')
    
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


export async function fwrite (fp: string, data: Buffer, options?: { dir?: string, print?: boolean }): Promise<void>
export async function fwrite (fp: string, data: any, options?: { dir?: string, encoding?: Encoding, print?: boolean }): Promise<void>
export async function fwrite (fp: string, data: any, { dir, encoding = 'utf-8', print = true }: { dir?: string, encoding?: Encoding, print?: boolean } = { }) {
    if (dir)
        fp = path.join(dir, fp)
    else if (!path.isAbsolute(fp))
        throw new Error('fp must be absolute path, or pass in "dir" parameter')
    
    if (print)
        console.log('write:', fp)
    
    if (encoding === 'gb18030')
        data = iconv.encode(data, encoding)
    
    if (!Buffer.isBuffer(data) && typeof data !== 'string')
        data = to_json(data)
    
    await fsp.writeFile(fp, data)
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
        - absolute?: `false` return absolute path
        - print?: `true`
        - filter?: `true`  RegExp | (fp: string) => any
*/
export async function flist (fpd: string, {
    filter, 
    deep = false, 
    absolute = false,
    print = true
}: {
    filter?: RegExp | ((fp: string) => any)
    deep?: boolean
    absolute?: boolean
    print?: boolean
} = { }) {
    if (!path.isAbsolute(fpd))
        throw new Error('fpd must be absolute path')
    
    let fps = await readdirAsync(fpd, {
        ...(absolute ? { basePath: fpd } : { }),
        deep,
        stats: false,
    })
    
    let fps_ = [ ]
    
    const filter_regexp = filter instanceof RegExp
    const filter_fn = Boolean(filter && !filter_regexp)
    
    for (let fp of fps) {
        fp = path.normalize(fp)
        
        if (filter_regexp && !filter.test(fp))
            continue
            
        if (filter_fn && !(filter as Function)(fp))
            continue
            
        if (print)
            console.log(fp)
        
        fps_.push(fp)
    }
    
    return fps_
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
    
    if (fp.is_dir) {
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
export async function fcopy (src: string, dst: string, {
    print = true,
    overwrite = true,
}: {
    print?: boolean
    overwrite?: boolean
} = { }) {
    if (src.endsWith('/') !== dst.endsWith('/')) throw new Error('src and dst must be both file path or directory path')
    if (!path.isAbsolute(src) || !path.isAbsolute(dst)) throw new Error('src and dst must be absolute path')
    if (print)
        console.log(`copy: ${src} → ${dst}`)
    await fse.copy(src, dst, { overwrite, errorOnExist: true })
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
    if (src.endsWith('/') !== dst.endsWith('/')) throw new Error('src and dst must be both file path or directory path')
    if (!path.isAbsolute(src) || !path.isAbsolute(dst)) throw new Error('src and dst must be absolute path')
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
    
    if (!overwrite && fp_.fexists)
        throw new Error(`file already exists：${fp_}`)
    
    await fsp.rename(fp, fp_)
}


export async function fmkdir (fpd: string, options: fs.MakeDirectoryOptions & { print?: boolean, suppress_existence?: boolean } = { }) {
    if (!path.isAbsolute(fpd))
        throw new Error('fpd must be absolute path')
    
    options.print ??= true
    
    if (fpd.fexists)
        if (fpd.is_dir) {
            if (options.print && !options.suppress_existence)
                console.log('directory already exists:', fpd)
            return
        } else throw new Error(`file with same name already exists, cannot create directory: ${fpd}`)
    else if (options.print)
        console.log('mkdir:', fpd)
    
    await fsp.mkdir(fpd, { recursive: true })
}


/** - link: can be file path or directory path */
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
        throw new Error('fpd must be absolute path')
    
    if (fp_link.fexists)
        if (fp_link.is_dir)
            fp_link = path.join(fp_link, fp_real.fname)
        else if ( (await fsp.lstat(fp_link)).isSymbolicLink() ) {
            console.log('link already exists:', fp_link)
            return
        } else
            throw new Error('file with same name already exists, cannot create new link')
        
    
    if (print)
        console.log(`source file ${fp_real} linked to ${fp_link}`)
    
    if (junction)
        fsp.symlink(fp_real, fp_link, 'junction')
    else
        fsp.symlink(fp_real, fp_link, fp_real.is_dir ? 'dir' : 'file')
}


export function link_shortcut (target: string, name: string, { args }: { args?: string[] } = { }) {
    const cmd = dedent`
        $wsh_shell                 = New-Object -comObject WScript.Shell
        $shortcut                  = $wsh_shell.CreateShortcut("d:/links/#{name}.lnk")
        $shortcut.TargetPath       = '${target}'
        $shortcut.Arguments        = "${args || ''}"
        $shortcut.WorkingDirectory = '${target.fdir}'
        ${ target.is_dir ? '$shortcut.IconLocation = "%SystemRoot%\\System32\\SHELL32.dll,3"' : '' }
        $shortcut.Save()
    `
    console.log(cmd)
    // await psh(cmd)
}


export let fwatchers: Record<string, fs.FSWatcher> = { }

/**
    - fp: path of file or directory
    - callback: called when modified
    - exec: call callback when watch is executed
    
    save fs.FSWatcher in watchers, subsequent call will auto close existing watcher for the same fp
    
    https://nodejs.org/dist/latest-v15.x/docs/api/fs.html#fs_fs_watch_filename_options_listener  
    The listener callback gets two arguments (event, filename). 
        event is either 'rename' or 'change', and filename is the name of the file which triggered the event.
        On most platforms, 'rename' is emitted whenever a filename appears or disappears in the directory.
    
    The listener callback is attached to the 'change' event fired by fs.FSWatcher, but it is not the same thing as the 'change' value of event.  
    
*/
export async function fwatch (
    fp: string, 
    onchange: (event: string, filename: string) => any,
    { exec = true }: { exec?: boolean } = { }
) {
    if (!path.isAbsolute(fp)) throw new Error('fp must be absolute path')
    
    const _watcher = fwatchers[fp]
    if (_watcher)
        _watcher.close()
    
    if (exec)
        await onchange('change', fp)
    
    const debounced_onchange = debounce((event, filename) => {
        console.log(`file changed (${event}): ${filename}`)
        onchange(event, path.normalize(filename))
    }, 500, { leading: false, trailing: true })
    const watcher = watch(fp, debounced_onchange)
    watcher.on('error', error => { console.error(error) })
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
    if (!fp_bak.fexists)
        await fcopy(fp, fp_bak)
    
    await fwrite(fp, text)
}

