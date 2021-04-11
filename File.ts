import { promises as fsp, watch } from 'fs'
import type fs from 'fs'

import path from 'upath'
import iconv from 'iconv-lite'
import is_regx from 'lodash/isRegExp'
import is_str  from 'lodash/isString'
import debounce from 'lodash/debounce'
import { readdirAsync } from 'readdir-enhanced'
import fse from 'fs-extra'
import trash from 'trash'


import { to_json } from './Prototype'
import { dedent } from './Utils'


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
    return (await fread(fp, options)).split_lines()
}

export async function fread_json <T = any> (fp: string, options: { dir?: string, encoding?: Encoding, print?: boolean } = { }): Promise<T> {
    return JSON.parse( await fread(fp, options) )
}


export async function fwrite (fp: string, data: any, { dir, encoding = 'UTF-8', print = true }: { dir?: string, encoding?: Encoding, print?: boolean } = { }) {
    if (dir)
        fp = path.join(dir, fp)
    
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
    
    if (print)
        console.log('append:', fp)
        
    if (!Buffer.isBuffer(data) && !is_str(data))
        throw new Error('data is not Buffer or string')
        
    await fsp.appendFile(fp, data)
}


/**
    - deep?: `false` recursively
    - absolute?: `false` return absolute path
    - print?: `true`
    - filter?: `true`  RegExp | (fp: string) => any
*/
export async function flist (dirp: string, {
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
    let fps = await readdirAsync(dirp, {
        ...(absolute ? { basePath: dirp } : { }),
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


export async function fdelete (fp: string, { print = true }: { print?: boolean } = { }) {
    if (fp.is_dir && fp.length > 5) {
        console.log(( 'delete directory: ' + fp ).red)
        await trash(fp, { glob: false })
    } else {
        if (print)
            console.log('delete:', fp)
        await fsp.unlink(fp)
    }
}


/** 复制文件  
    - dst: 目标文件路径或文件夹
*/
export async function fcopy (src: string, dst: string, { print = true }: { print?: boolean } = { }) {
    if (!path.isAbsolute(dst))
        dst = `${src.fdir}${dst.fname}`
    if (dst.is_dir && dst.fexists)
        dst += src.fname
    if (print)
        console.log(`copy: ${src} → ${dst}`)
    await fse.copy(src, dst)
}


export async function fmove (src: string, dst: string, { overwrite = false, print = true }: { overwrite?: boolean, print?: boolean } = { }) {
    if (!src.is_dir && dst.fexists && dst.is_dir)
        dst = path.join(dst, src.fname)
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
    }
    
    if (print)
        console.log('rename:', fp, '→', fp_)
    
    if (!overwrite && fp_.fexists) throw new Error('file already exists：' + fp_)
    
    await fsp.rename(fp, fp_)
}


export async function fmkdir (fp: string, options: fs.MakeDirectoryOptions & { print?: boolean, suppress_existence?: boolean } = { }) {
    options.print ?? true
    
    if (fp.fexists)
        if (fp.is_dir) {
            if (options.print && !options.suppress_existence)
                console.log('directory already exists:', fp)
            return
        } else throw new Error('file with same name already exists, cannot create directory: ' + fp)
    else if (options.print)
        console.log('create new directory:', fp)
    
    await fsp.mkdir(fp, { recursive: true })
}


/** - link: 可以是文件路径或文件夹 */
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
    const _watcher = fwatchers[fp]
    if (_watcher)
        _watcher.close()
    
    if (exec)
        await onchange('change', fp)
    
    const debounced_onchange = debounce((event, filename) => {
        console.log(`文件修改 (${event}): ${filename}`)
        onchange(event, path.normalize(filename))
    }, 500, { leading: false, trailing: true })
    const watcher = watch(fp, debounced_onchange)
    watcher.on('error', error => { console.error(error) })
    return fwatchers[fp] = watcher
}


/** open a file and replace certain pattern */
export async function freplace (fp: string, pattern: string | RegExp, replacement: string) {
    let text = await fread(fp)
    text = text.replaceAll(pattern, replacement)
    await fwrite(fp, text)
}

