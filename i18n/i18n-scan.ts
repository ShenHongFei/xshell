#!/usr/bin/env node

import path from 'upath'
import { program } from 'commander'

import { scanner } from './scanner/index.js'
import { try_load_dict } from './utils.js'

;(async function main () {
    program.name('i18n-scan')
        .option('-r, --rootdir [rootdir]'   , '根目录：默认为当前工作目录', path.normalize(process.cwd()))
        .option('-i, --input [input]'       , '扫描 pattern：多个 pattern 用分号分割，采用 glob pattern 匹配，如 `src/**/*.{js,jsx,ts,tsx}`', v => v.split(';'))
        .option('-o, --output [output]'     , 'i18n 目录：默认为 <rootdir>/i18n/')
        .option('-c, --config [config]'     , '自定义配置文件，默认为 <rootdir>/i18n/config.js ，可参考默认配置 xshell/i18n/index.ts 以及 https://github.com/i18next/i18next-scanner', 'i18n/config.js')
        .parse(process.argv)
    
    const { rootdir, config, input, output } = program.opts()
    scanner(rootdir, {
        ... await try_load_dict(
            path.resolve(rootdir, config)
        ),
        ... input  ?  { input }   :  { },
        ... output ?  { output }  :  { },
    })
})()
