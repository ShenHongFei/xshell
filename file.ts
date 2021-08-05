import { promises as fsp, watch } from 'fs'
import type fs from 'fs'

import path from 'upath'
import iconv from 'iconv-lite'
import { readdirAsync } from 'readdir-enhanced'
import fse from 'fs-extra'
import trash from 'trash'
import rimraf from 'rimraf'

import is_regx from 'lodash/isRegExp'
import is_str  from 'lodash/isString'
import debounce from 'lodash/debounce'


import { to_json } from './prototype'
import { dedent } from './utils'


export type Encoding = 'UTF-8' | 'GB18030' | 'Shift_JIS' | 'BINARY'


export async function fread (fp: string): Promise<string>
export async function fread (fp: string, { dir, encoding, print }?: { dir?: string, encoding: 'BINARY', print?: boolean }): Promise<Buffer>
export async function fread (fp: string, { dir, encoding, print }?: { dir?: string, encoding?: Encoding | 'AUTO', print?: boolean }): Promise<string>
export async function fread (fp: string, {
    dir, 
    encoding = 'UTF-8', 
    print = true
}: {
    dir?: string
    encoding?: Encoding | 'AUTO'
    print?: boolean } = { }
) {
    if (dir)
        fp = path.join(dir, fp)
    else if (!path.isAbsolute(fp))
        throw new Error('fp must be absolute path, or pass in "dir" parameter')
    
    if (print)
        console.log('read:', fp)
        
    const buffer = await fsp.readFile(fp)
    
    if (encoding === 'BINARY')
        return buffer
    
    if (encoding === 'UTF-8')
        return buffer.toString('utf8')
    
    if (encoding === 'AUTO') {
        const { detect } = await import('chardet')
        encoding = detect(buffer) as any
        if (print)
            console.log(`${fp} probably has encoding: ${encoding}`)
    }
    
    return iconv.decode(buffer, encoding)
}

export async function fread_lines (fp: string, options: { dir?: string, encoding?: Exclude<Encoding, 'BINARY'> | 'AUTO', print?: boolean } = { }) {
    return (await fread(fp, options))
        .split_lines()
}

export async function fread_json <T = any> (fp: string, options: { dir?: string, encoding?: Encoding, print?: boolean } = { }): Promise<T> {
    return JSON.parse(
        await fread(fp, options)
    )
}


export async function fwrite (fp: string, data: any, { dir, encoding = 'UTF-8', print = true }: { dir?: string, encoding?: Encoding, print?: boolean } = { }) {
    if (dir)
        fp = path.join(dir, fp)
    else if (!path.isAbsolute(fp))
        throw new Error('fp must be absolute path, or pass in "dir" parameter')
    
    if (print)
        console.log('write:', fp)
    
    if (encoding === 'GB18030')
        data = iconv.encode(data, encoding)
    
    if (!Buffer.isBuffer(data) && !is_str(data))
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
        
    if (!Buffer.isBuffer(data) && !is_str(data))
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
    
    fps = fps.map( fp => {
        fp = path.normalize(fp)
        if (print)
            console.log(fp)
        return fp
    })
    
    if (is_regx(filter))
        return fps.filter( fp => filter.test(fp))
    else if (filter)
        return fps.filter(filter)
    else
        return fps
}


/** delete file or directory  
    - fp: path
    - options?:
        - print?: `true` (effective only delete single file)
        - fast?: `false` use rimraf to delete quickly
*/
export async function fdelete (fp: string, { print = true, fast = false }: { print?: boolean, fast?: boolean } = { }) {
    if (fp.length < 6) throw new Error(`${fp} too short`)
    if (!path.isAbsolute(fp))
        throw new Error('fpd must be absolute path')
    if (fp.is_dir) {
        console.log(`delete directory: ${fp}`.red)
        if (fast)
            await new Promise<void>((resolve, reject) => {
                rimraf(fp, { glob: false, disableGlob: true }, error => {
                    if (error)
                        reject(error)
                    else
                        resolve()
                })
            })
        else
            await trash(fp, { glob: false })
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
    fcopy('D:/temp/Camera/', 'D:/Camera/')
*/
export async function fcopy (src: string, dst: string, { print = true }: { print?: boolean } = { }) {
    if (src.endsWith('/') !== dst.endsWith('/')) throw new Error('src and dst must be both file path or directory path')
    if (!path.isAbsolute(src) || !path.isAbsolute(dst)) throw new Error('src and dst must be absolute path')
    if (print)
        console.log(`copy: ${src} → ${dst}`)
    await fse.copy(src, dst)
}


/** move file or direcotry
    - src: src file/directory absolute path
    - dst: dst file/directory absolute path
    @example
    fmove('D:/temp/Camera/', 'D:/Camera/')
*/
export async function fmove (src: string, dst: string, { overwrite = false, print = true }: { overwrite?: boolean, print?: boolean } = { }) {
    if (src.endsWith('/') !== dst.endsWith('/')) throw new Error('src and dst must be both file path or directory path')
    if (!path.isAbsolute(src) || !path.isAbsolute(dst)) throw new Error('src and dst must be absolute path')
    if (print)
        console.log(`move: ${src} → ${dst}`)
    await fse.move(src, dst, { overwrite })
}


/** rename file  
    - dir?
    - print?: `true`
    - overwrite?: `true`  better performance without check
 */
export async function frename (fp: string, fp_: string, { dir, print = true, overwrite = true }: { dir?: string, print?: boolean, overwrite?: boolean } = { }) {
    if (dir) {
        fp = path.join(dir, fp)
        fp_ = path.join(dir, fp_)
    } else if (!path.isAbsolute(fp) || !path.isAbsolute(fp_))
        throw new Error('fp and fp_ must be absolute path')
    
    if (print)
        console.log('rename:', fp, '→', fp_)
    
    if (!overwrite && fp_.fexists) throw new Error(`file already exists：${fp_}`)
    
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
        console.log('create new directory:', fpd)
    
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
        $shortcut                  = $wsh_shell.CreateShortcut("D:/Shortcuts/#{name}.lnk")
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
export async function fwatch (fp: string, onchange: (event: string, filename: string) => any, { exec = true }: { exec?: boolean } = { }) {
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
        - encoding?: `'AUTO'`
*/
export async function f2utf8 (fp: string, {
    dryrun = true,
    encoding = 'AUTO',
}: {
    dryrun?: boolean
    encoding?: Encoding | 'AUTO'
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

