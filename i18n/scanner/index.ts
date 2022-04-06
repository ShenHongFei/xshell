import type { Transform } from 'stream'

import i18n_scanner from 'i18next-scanner'
import path from 'upath'
import ejs from 'ejs'
import vfs from 'vinyl-fs'
import sort from 'gulp-sort'
import ora from 'ora'
import cli_truncate from 'cli-truncate'
import Vinyl from 'vinyl'
import through2 from 'through2'
import CliTable from 'cli-table3'

import '../../prototype.js'
import { map_stream } from '../../utils.js'

import {
    LANGUAGES,
    type Language,
} from '../index.js'
import { RWDict } from '../rwdict.js'
import type { _Dict } from '../dict.js'
import { try_load_dict } from '../utils.js'


import { mix_parse_trans_from_string_by_babel } from './parser.js'



/** 默认 i18next 扫描配置 */
const DEFAULT_CONFIG = {
    debug: false,
    
    input: [
        // 'src/**/*.{js,jsx,ts,tsx}',
        '!i18n/**',  // Use ! to filter out files or directories
        '!node_modules/**',
        '!**/*.d.ts',
    ],
    
    // 相对于根目录
    output: 'i18n/',
    
    // 若是相对路径，则以 output 为基准进行解析
    dict: ['dict.json', 'untranslateds.json'],
    
    lngs: ['zh', 'en', 'ja', 'ko'],
    ns: ['translation'],
    defaultLng: 'zh',
    defaultNs: 'translation',

    func: {
        list: [ 'i18next.t', 'i18n.t', 'i18n.__', 't', '__' ],
        extensions: [ ], // 避免在 transform 中执行原生的 parseFuncFromString
    },
    
    trans: {
        extensions: [ ], // 避免在 transform 中执行原生的 parseTransFromString
        fallbackKey: true,
        
        babylon: {
            sourceType: 'module',
            
            allowAwaitOutsideFunction: true,
            
            // https://babeljs.io/docs/en/babel-parser
            plugins: [
                // Language extensions
                'jsx',
                'typescript',
                
                // ECMAScript proposals
                'classProperties',
                'classPrivateProperties',
                'classPrivateMethods',
                'classStaticBlock',
                'decimal',
                ['decorators', { decoratorsBeforeExport: true }],
                'doExpressions',
                'exportDefaultFrom',
                'functionBind',
                'importAssertions',
                'moduleBlocks',
                'moduleStringNames',
                'partialApplication',
                ['pipelineOperator', { proposal: 'smart' }],
                'privateIn',
                ['recordAndTuple', { syntaxType: 'bar' }],
                'throwExpressions',
                'topLevelAwait',
            ],
        } as import('@babel/parser').ParserOptions,
        
        // 实际并没有用到 acorn, 用了 babel
        acorn: {
            ecmaVersion: 'latest',
            sourceType: 'module', // defaults to 'module'
            // Check out https://github.com/acornjs/acorn/tree/master/acorn#interface for additional options
        }
    },
    
    // 禁用 : 和 . 作为 seperator
    keySeparator: false, // char to separate keys
    nsSeparator: false, // char to split namespace from key
    
    // Context Form
    context: true, // whether to add context form key
    contextFallback: true, // whether to add a fallback key as well as the context form key
    contextSeparator: '_', // char to split context from key

    // Plural
    // whether to add plural form key
    plural (language: string, ns: string, key: string, options: any /** Config */) {
        return language === 'en'
    }, 
    pluralFallback: true, // whether to add a fallback key as well as the plural form key
    pluralSeparator: '_', // char to split plural from key
    
    // interpolation options
    interpolation: {
        prefix: '{{', // prefix for interpolation
        suffix: '}}' // suffix for interpolation
    }
}

const VALID_EXTENTIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.ejs'])

export type Config = Partial<(typeof DEFAULT_CONFIG) & {
    defaultValue?: string
    resource?: { loadPath?: string, savePath?: string, jsonIndent?: number, lineEnding?: '\n' }
}>


/** 扫描源码中的词条，以及收集未翻译的词条，将结果保存到 dict.json 和 untranslateds.json
    - `process.cwd()` rootdir 要扫描根目录
    - config 配置信息
*/
export async function scanner (rootdir: string = path.normalize(process.cwd()), config: Config = { }) {
    const output = path.resolve(rootdir, config.output || DEFAULT_CONFIG.output)
    
    if (!config.input.length)
        throw new Error('运行 i18n-scan 请指定 --input')
    
    const input  = [...config.input, ...DEFAULT_CONFIG.input]
    
    config = {
        ...DEFAULT_CONFIG,
        ...config,
        input,
        output,
        resource: {
            loadPath: '',
            savePath: path.resolve(output, 'translation/{{lng}}.js'),
            jsonIndent: 4,
            lineEnding: '\n'
        }
    }
    
    let dict = new RWDict()
    
    for (const fp_dict of config.dict)
        dict.merge(
            await try_load_dict(
                path.resolve(output, fp_dict)
            ), { print: false, overwrite: true }
        )
    
    
    let c_files = 0
    let c_scanneds = 0
    let error_handlers = []
    
    // 所有语言的扫描统计信息
    let stats: Record<Language, { translateds: Set<string>, untranslateds: Set<string> }> = { } as any
    
    for (const language of LANGUAGES)
        stats[language] = {
            translateds: new Set<string>(),
            untranslateds: new Set<string>()
        }
    
    
    let spinner = ora({ interval: 66 }).start('Scanning...')
    
    
    
    function on_scanned (text: string, { language, key, defaultValue, count, context }: { language?: Language, key?: string, defaultValue?: string, count?: number, context?: string }) {
        // console.log(text, { language, key, defaultValue, count, context })
        
        text = text || defaultValue
        
        if (!key)
            key = context ? `${text}_${context}` : text
        
        if (!language) {
            for (const language of LANGUAGES)
                on_scanned(text, { language, key, count, context })
            return
        }
        
        // console.log(text, { language, key, defaultValue, count, context })
        // debugger
        
        const stat = stats[language]
        
        // 获取已有翻译
        const translation = 
            dict.get(key, language) || 
            language === 'zh' && text || 
            ''
        
        if (language === 'zh' && !context)
            return
        
        if (translation)
            stat.translateds.add(key)
        else
            stat.untranslateds.add(key)
        
        if (language === 'en' && count !== undefined)
            on_scanned(text, { language, key: `${key}_plural`, context })
    }
    
    
    function new_vinyl_file (_path: string, data: string | object) {
        return new Vinyl({
            cwd: rootdir,
            base: rootdir,
            path: path.resolve(config.output, _path),
            contents: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data, null, 4))
        })
    }
    
    return new Promise<number>((resolve, reject) => {
        // ------------ scan by file
        vfs
            .src(config.input, { cwd: rootdir, sync: false })
            
            // 每个文件扫描前，统计文件数量
            .pipe(
                map_stream((file: Vinyl, cb: Function) => {
                    // 支持 `// @i18n-noscan` 忽略扫描
                    if (/\/\/\s*@i18n-noscan\s/.test(file.contents.toString()))
                        return cb()
                    c_files++
                    cb(null, file)
                })
            )
            
            // 对文件进行排序，保证词条有一定的顺序
            .pipe(
                sort()
            )
            
            // 分析代码提取词条
            .pipe(
                i18n_scanner.createStream( config, function transform (this: { parser: any }, file: Vinyl, encoding: string, callback: Function): void {
                    const { parser } = this
                    const ext = path.extname(file.path)
                    
                    // 只扫描源码文件
                    if (!VALID_EXTENTIONS.has(ext)) {
                        callback()
                        return
                    }
                    
                    c_scanneds++
                    const percent = Math.round(
                        100 * c_scanneds / c_files
                    )
                    const text = `Scanning (${percent}%): ${file.path.blue}`
                    spinner.text = cli_truncate(text, process.stdout.columns - 5, { position: 'middle', })
                    
                    let code = file.contents.toString()
                    
                    if (ext === '.ejs')
                        code = ejs.compile( code, { filename: file.path, client: true, legacyInclude: true } as any ).toString()
                    
                    
                    // --- 添加代码中扫描到的 i18n.t('key') 中的 key 到 parser
                    // parser.parseFuncFromString 使用 esprima 来解析代码，esprima 仍然不支持 optional chaining !!
                    parser.parseFuncFromString(code.replace(/\?\.\[/g, '[').replace(/\?\.\(/g, '(').replace(/\?\./g, '.'), on_scanned)
                    
                    // --- 添加代码中扫描到的 Trans 组件中的 key 到 parser
                    if (ext === '.jsx' || ext === '.tsx') {
                        // parser.parseTransFromString 使用 acorn 解析代码，不支持 TypeScript，添加 parser.parseTransFromStringByBabel
                        mix_parse_trans_from_string_by_babel(parser)
                        parser.parseTransFromStringByBabel(
                            code,
                            { filepath: file.path },
                            on_scanned,
                            (error: Error) => {
                                error_handlers.push(error)
                            }
                        )
                    }
                    
                    setTimeout(callback, 0)
                })
            )
            
            // 创建词条文件
            .pipe(
                through2.obj(
                    /** i18n-scanner 会把扫描结果以每个语言一个文件的形式提供，这里解析扫描结果
                    * file: 翻译 resource 文件，其中 file.contents 包含翻译的扫描结果
                    */
                    function write (this: Transform, file: Vinyl, encoding: string, cb: Function) { cb() },
                    
                    /** 生成 stats.json, unmarkeds.md； 打印 untranslated / unmarkeds */
                    function flush (this: Transform, cb: Function) {
                        // ------------ stats.json
                        this.push(new_vinyl_file('stats.json', 
                            Object.fromEntries(
                                Object.entries(stats).map( ([l, { translateds, untranslateds }]) => 
                                    [l, { translateds: Array.from(translateds), untranslateds: Array.from(untranslateds) }])
                            )
                        ))
                        
                        
                        // ------------ 打印 cli 统计表
                        const table = new CliTable({
                            head: [
                                '语言',
                                '未翻译'.red,
                                '已翻译'.green,
                            ],
                            colAligns: ['right', 'right', 'right', 'right'],
                            style: { head: [] },
                            chars: {
                                top: '',
                                'top-mid': '',
                                'top-left': '',
                                'top-right': '',
                                bottom: '',
                                'bottom-mid': '',
                                'bottom-left': '',
                                'bottom-right': '',
                                left: '',
                                'left-mid': '',
                                mid: '',
                                'mid-mid': '',
                                right: '',
                                'right-mid': '',
                                middle: ' ',
                            },
                        })
                        
                        Object.entries(stats).forEach( ([lang, stat]) => {
                            table.push([
                                lang, 
                                String(stat.untranslateds.size).red, 
                                String(stat.translateds.size).green
                            ] as any)
                        })
                        
                        
                        
                        spinner.stop()
                        console.log(`Scanned ${c_files} files. Occured ${error_handlers.length} errors.`)
                        console.log(table.toString())
                        
                        
                        // ------------ 生成 unmarkeds.md 统计
                        /*
                        const fp_unmarked = path.resolve(config.output, 'unmarkeds.md')
                        
                        if (fs.existsSync(fp_unmarked))
                            rimraf.sync(fp_unmarked)
                        
                        if (unmarkeds.length) {
                            console.log(colors.yellow(`\n⚠️  发现未标记的中文字符 ${unmarkeds.length} 处：\n`))
                            unmarkeds.forEach(({ value, filepath, loc: { start } }, index) => {
                                if (index >= 5) return
                                console.log( `  ${colors.white(`'${value}'`)}\t${colors.blue.underline(`${path.relative(rootdir, filepath)}:${start.line}:${start.column + 1}`)}` )
                            })
                        }
                        
                        this.push( new_vinyl_file( fp_unmarked, 
                            unmarkeds.map( ({ value, filepath, loc }) =>
                                '- [' + value.trim() + '](' + path.relative( config.output, path.resolve(rootdir, filepath || '') ) + '#L' + loc.start.line + ')'
                            ).join('\n') + '\n'
                        ))
                        
                        
                        if (unmarkeds.length > 5) {
                            console.log('  ...')
                            console.log(colors.yellow(`\n  完整未标记词条请查看 ${colors.blue.underline(path.relative(rootdir, fp_unmarked))}`))
                        }
                        */
                        
                        const en_untranslateds = stats.en.untranslateds
                        if (en_untranslateds.size) {
                            console.log('\n缺少英文翻译的词条:'.yellow)
                            let i = 0
                            for (const untranslated of en_untranslateds) {
                                if (i >= 10)
                                    break
                                console.log(untranslated)
                                i++
                            }
                            if (en_untranslateds.size > 10) {
                                console.log('...')
                                console.log(`--- 共 ${en_untranslateds.size} 个未翻译的英文词条 ---`)
                            }
                        } else
                            console.log('\n所有词条都至少含有英文翻译'.green)
                        
                        
                        // ------------ 生成 untranslateds.json (扫描到词条还没有英文翻译)
                        const fp_untranslateds = path.resolve(config.output, 'untranslateds.json')
                        
                        let untranslateds: _Dict = { }
                        
                        for (const key of stats.en.untranslateds) {
                            let item = { ...dict.get(key) }
                            item.en ||= ''
                            item.ja ||= ''
                            item.ko ||= ''
                            untranslateds[key] = item
                        }
                        
                        this.push(
                            new_vinyl_file(fp_untranslateds, untranslateds)
                        )
                        
                        
                        // ------------ 写入 dict.json
                        const fp_dict_new = path.resolve(output, 'dict.json')
                        this.push(
                            new_vinyl_file(
                                fp_dict_new,
                                dict.to_json(true) + '\n'
                            )
                        )
                        
                        console.log(
                            `\n\n${'请手动补全未翻译的词条: '.yellow}${fp_untranslateds.underline.blue}\n` +
                            `${'请检查新生成的词典文件: '.yellow}${fp_dict_new.underline.blue}\n` +
                            '\n' +
                            '补全 untranslateds.json 后需要重新运行扫描，会根据 untranslateds.json 更新 dict.json\n'.yellow +
                            '最后 dict.json 所包含的词条会被打包进 js, 通过 new I18N(<dict.json>) 或 i18n.init(<dict.json>) 加载\n\n'.yellow +
                            `${'详细文档请查看: '.yellow}${'https://github.com/ShenHongFei/xshell/tree/master/i18n'.blue.underline}`
                        )
                        
                        cb()
                    }
                )
            )
            
            // 写入词条文件
            .pipe(
                vfs.dest(rootdir)
            )
            
            .on('end', () => {
                if (error_handlers.length) {
                    for (const error_handler of error_handlers)
                        error_handler()
                    
                    console.log(`以上错误可能是由不规范的词条标记导致，标记规范可见：\n${'https://www.i18next.com/translation-function/essentials'.blue.underline}`)
                }
                
                resolve(stats.en.untranslateds.size)
            })
    })
}
