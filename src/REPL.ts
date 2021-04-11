import util from 'util'
import nvm from 'vm'
import repl from 'repl'
import process from 'process'


import ts from 'typescript'
import type {
    SourceFile,
    Node,
    Statement, 
    Modifier,
    SyntaxKind as TSyntaxKind,
    Identifier,
    StringLiteral,
    ExpressionStatement,
    ObjectBindingPattern,
    BindingElement,
} from 'typescript'

import type { Context } from 'koa'


import { log_section, log_module_loaded, log_line, delay, inspect } from './Utils'
import { fread, fwrite, fwatchers } from './File'


declare global {
    let __: any
    
    let server: NodeJS.Global['server']
    
    namespace NodeJS {
        interface Global {
            ROOT: 'D:/0/'
            GLOBAL_NODE_MODULES: string
            LOCAL_NODE_MODULES : string
            
            /** `240` ConEmu 字符宽度 */
            WIDTH: number
            
            /** REPL 启动时间 */
            started_at: Date
            
            __: any
            
            server:   import('./Server').Server
            
            repl_router (ctx: Context): Promise<boolean>
        }
    }
}

global.ROOT = 'D:/0/'
global.GLOBAL_NODE_MODULES = 'C:/Users/shf/AppData/Roaming/npm/node_modules/'
global.LOCAL_NODE_MODULES  = `${global.ROOT}node_modules/`
global.WIDTH = 240


// ------------ inspect options

util.inspect.defaultOptions.maxArrayLength  = 40
util.inspect.defaultOptions.maxStringLength = 10000
util.inspect.defaultOptions.breakLength     = 240
util.inspect.defaultOptions.colors          = true
util.inspect.defaultOptions.compact         = false
util.inspect.defaultOptions.getters         = true
util.inspect.defaultOptions.depth           = 2
util.inspect.defaultOptions.sorted          = false
util.inspect.defaultOptions.showProxy       = true

util.inspect.styles.number  = 'green'
util.inspect.styles.string  = 'cyan'
util.inspect.styles.boolean = 'blue'
util.inspect.styles.date    = 'magenta'
util.inspect.styles.special = 'white'




const {
    factory,
    
    SyntaxKind, 
    NodeFlags,
    ModifierFlags,
    
    isIdentifier: is_identifier, 
    isNamedImports: is_named_imports,
    isImportDeclaration: is_import_decl,
    isAwaitExpression: is_await_expr,
    isExpressionStatement: is_expr_stmt,
    isExportAssignment: is_export_assignment,
    isVariableStatement: is_var_stmt,
    isNamespaceImport: is_namespace_import,
    isClassDeclaration: is_class_decl,
    isCallExpression: is_call_expr,
    isReturnStatement: is_return_stmt,
    isBinaryExpression: is_binary_expr,
    isFunctionDeclaration: is_func_decl,
    
    createPrinter: create_printer,
} = ts


export let INSPECTION_LIMIT    = 10000
export let PRINTING_COMPILED_JS = false



export function set_inspection_limit (limit: number = 10000) {
    if (limit === -1)
        limit = 50 * 10**4
    INSPECTION_LIMIT = limit
}


export function set_printing_compiled_js (enabled: boolean) {
    PRINTING_COMPILED_JS = enabled
}


// ------------------------------------ Code Compilers, Transformers
function resolve_kind (kind: TSyntaxKind) {
    if (kind === SyntaxKind.VariableStatement) return 'VariableStatement'
    return SyntaxKind[kind]
}


function print_ast (nodes: Node[] | Node, sourceFile: SourceFile) {
    function print_node (node: Node) {
        console.log(`${ resolve_kind(node.kind) }: ${ node.getText(sourceFile) }`)
    }
    if (Array.isArray(nodes))
        nodes.forEach( node => { print_node(node) })
    else
        print_node(nodes)
}


export function parse_code (code: string) {
    return ts.createSourceFile('REPL.ts', code, ts.ScriptTarget.ESNext)
}


export function generate_code (stmts: Statement[]) {
    return create_printer({ omitTrailingSemicolon: true, removeComments: false, newLine: ts.NewLineKind.LineFeed })
        .printFile(
            ts.updateSourceFileNode(
                ts.createSourceFile('output.ts', '', ts.ScriptTarget.ESNext),
                stmts
            )
    )
}



function trans_import_2_require (import_decl: Statement) {
    if (!is_import_decl(import_decl)) return import_decl
    
    const { importClause: import_clause, moduleSpecifier: module_specifier } = import_decl
    
    // require('module_specifier')
    const require_module_stmt = factory.createCallExpression( factory.createIdentifier('require'), [ ], [ module_specifier ])
    
    // aaa, bbb as ccc, default as ddd, ...
    // (import_clause.namedBindings as NamedImports).elements
    
    return [
        // import mod from 'mod'
        // global.mod = __importDefault(require("mod")).default
        ... import_clause.name ? [
                factory.createExpressionStatement( factory.createAssignment(
                    factory.createPropertyAccessExpression( factory.createIdentifier('global'), import_clause.name),
                    factory.createPropertyAccessExpression( factory.createCallExpression( factory.createIdentifier('__importDefault'), [ ], [ require_module_stmt ]), 'default'),
                )
            ) ] : [ ],
        
        // import * as mod from 'mod'
        // global.mod = __importStar(require("mod"))
        ... import_clause.namedBindings && is_namespace_import(import_clause.namedBindings) ? [
                factory.createExpressionStatement( factory.createAssignment(
                    factory.createPropertyAccessExpression( factory.createIdentifier('global'), import_clause.namedBindings.name),
                    factory.createCallExpression( factory.createIdentifier('__importStar'), [ ], [ require_module_stmt ])
                ))
            ] : [ ],
        
        
        // import { element2 as element2_, element3 as element3_, other, default as mod2 } from 'mod2'
        ... import_clause.namedBindings && is_named_imports(import_clause.namedBindings) ? [
                // var { element2: element2_, element3 } = __importDefault(require("mod"))
                factory.createVariableStatement([ ], [ factory.createVariableDeclaration(
                    factory.createObjectBindingPattern(
                        // ImportSpecifier[] -> ObjectBindingPattern.BindingElement[]
                        import_clause.namedBindings.elements.map( import_specifier => 
                            factory.createBindingElement(
                                undefined, 
                                import_specifier.propertyName, 
                                import_specifier.name, 
                                import_specifier.propertyName?.text === 'default'  ?  require_module_stmt  :  undefined
                            ))),
                    undefined,
                    undefined,
                    require_module_stmt
                ) ]),
                
                // Object.assign(global, { element2_, element3 })
                factory.createExpressionStatement( factory.createCallExpression(
                    factory.createPropertyAccessExpression( factory.createIdentifier('Object'), 'assign'),
                    [ ],
                    // ImportSpecifier[] -> ObjectBindingPattern.BindingElement[]
                    [ factory.createIdentifier('global'), factory.createObjectLiteralExpression( import_clause.namedBindings.elements.map( import_specifier => factory.createShorthandPropertyAssignment(import_specifier.name) ), false) ]
                )),
                
                factory.createExpressionStatement(
                    import_clause.namedBindings.elements.length === 1 ? 
                        // (a)
                        factory.createParenthesizedExpression(import_clause.namedBindings.elements[0].name)
                    :   // ({ a: xxx, b: xxx })
                        factory.createObjectLiteralExpression( import_clause.namedBindings.elements.map( import_specifier => factory.createShorthandPropertyAssignment(import_specifier.name) ), false)
                )
            ] : [ ],
    ]
}


/** export function foo () { } */
function trans_export_stmt (stmt: Statement) {
    if (is_export_assignment(stmt))
        return factory.createExpressionStatement( stmt.expression)
    
    function isExportModifier (modifier: Modifier) {
        return modifier.flags & ModifierFlags.Export || modifier.flags & ModifierFlags.ExportDefault || modifier.kind === SyntaxKind.ExportKeyword
    }
    
    if (stmt.modifiers?.some( modifier => isExportModifier(modifier) )) {
        // @ts-ignore
        stmt.modifiers = factory.createNodeArray<Modifier>(stmt.modifiers.filter( modifier => !isExportModifier(modifier) ))
        return stmt
    }
    
    return stmt
}


function trans_require_2_import (stmt: Statement, source_file: SourceFile) {
    if (!is_var_stmt(stmt)) return stmt
    const { name, initializer: require_call } = stmt.declarationList.declarations[0]
    
    if (!is_call_expr(require_call) || require_call.expression.getText(source_file) !== 'require') return stmt
    
    const modpath = require_call.arguments[0] as StringLiteral
    
    // createNamedImports(createImportSpecifier())
    
    return factory.createImportDeclaration(
        undefined, 
        undefined,
        factory.createImportClause(false, name as Identifier, undefined),
        modpath
    )
}


/** const a = 123, b = 234, { c, d: e } = obj */
function trans_variable_decl_2_var (var_decl: Statement) {
    if (!is_var_stmt(var_decl)) return var_decl
    // @ts-ignore
    var_decl.declarationList.flags = NodeFlags.None
    return var_decl
}


function trans_class_decl_2_expr (class_decl: Statement) {
    if (!is_class_decl(class_decl)) return class_decl
    if (class_decl.modifiers)
        // @ts-ignore
        class_decl.modifiers = factory.createNodeArray<Modifier>( class_decl.modifiers.filter( modifier => !(modifier.kind === SyntaxKind.ExportKeyword)))
    return factory.createVariableStatement([ ], factory.createVariableDeclarationList( [
        factory.createVariableDeclaration(class_decl.name, undefined, undefined, factory.createClassExpression(undefined, undefined, class_decl.name, undefined, undefined, class_decl.members))
    ]))
}


function get_expr_of_stmt (statement: Statement): ExpressionStatement | Statement {
    if (is_expr_stmt(statement))
        return statement
    
    if (is_var_stmt(statement)) {
        const declarations = statement.declarationList.declarations
        return factory.createExpressionStatement(
            declarations.length === 1 ?
                declarations[0].name as Identifier
            :
                factory.createObjectLiteralExpression( declarations.map( variableDeclaration => factory.createShorthandPropertyAssignment(variableDeclaration.name as Identifier) ), true)
        )
    }
    
    if (is_func_decl(statement))
        return factory.createExpressionStatement(statement.name)
    
    return statement
}

function trans_return_2_expr (stmt: Statement): Statement {
    if (!is_return_stmt(stmt)) return stmt
    return factory.createExpressionStatement(stmt.expression)
}


function assign_var_decl (variableDeclaraion: Statement, destination: string = 'global') {
    if (!is_var_stmt(variableDeclaraion)) return [ variableDeclaraion ]
    
    // VariableDeclaration[] -> ObjectLiteral[]
    // const a = 123, b = 234, { c, d: e } = obj
    const obj_literal =
        factory.createObjectLiteralExpression(
            variableDeclaraion.declarationList.declarations.map( declaration => 
                is_identifier(declaration.name) ?
                    [ factory.createShorthandPropertyAssignment(declaration.name) ]
                :  // ObjectBindingPattern
                    (declaration.name as ObjectBindingPattern).elements.map( (element: BindingElement) => factory.createShorthandPropertyAssignment(element.name as Identifier))
            ).flat()
            , true
        )
    
    
    return [
        variableDeclaraion,
        factory.createExpressionStatement( factory.createCallExpression(
            factory.createPropertyAccessExpression( factory.createIdentifier('Object'), 'assign'),
            [ ],
            [ factory.createIdentifier(destination), obj_literal ]
        )),
        factory.createExpressionStatement(obj_literal)
    ]
}


function return_last_expr (statements: Statement[]) {
    if (!statements.length) return statements
    
    const lastExpression = get_expr_of_stmt(statements.last)
    if (is_expr_stmt(lastExpression))
        return [ ...statements.slice(0, -1), factory.createReturnStatement(lastExpression.expression) ]
    else
        return statements
}


function wrap_await_stmt (statements: Statement[], code: string) {
    function wrap (stmts: Statement[]) {
        return [
            factory.createExpressionStatement(
                factory.createCallExpression(
                    factory.createFunctionExpression(
                        [ factory.createModifier(SyntaxKind.AsyncKeyword) ],
                        undefined,
                        'async_wrapper',
                        [ ],
                        [ ],
                        undefined,
                        factory.createBlock(
                            return_last_expr(
                                stmts.map( statement => assign_var_decl(statement)).flat()
                            )
                        , true )
                    ),
                    [ ],
                    [ ]
                )
            ),
        ]
    }
    
    if (!code.includes('await')) return statements
    
    if (code.includes('await') && !code.includes('async ')) return wrap(statements)
    
    if (statements.some( stmt => (
        is_expr_stmt(stmt) && is_await_expr(stmt.expression) ||
        is_var_stmt(stmt)   && stmt.declarationList.declarations.some( var_decl => 
            var_decl.initializer && is_await_expr(var_decl.initializer)
        ) ||
        is_expr_stmt(stmt) && is_call_expr(stmt.expression) && stmt.expression.arguments.some( expr => is_await_expr(expr)) ||
        is_expr_stmt(stmt) && is_binary_expr(stmt.expression) && is_await_expr(stmt.expression.right)
    )))
        return wrap(statements)
    
    return statements
}


export async function compile_ts ({
    fp, 
    code, 
    print = PRINTING_COMPILED_JS, 
    save = false,
}: {
    fp?: string
    code?: string
    print?: boolean
    save?: boolean
} = { } ): Promise<string> {
    if (!code && fp)
        code = await fread(fp)
    
    const source_file = parse_code(code)
    
    let statements: Statement[] = [...source_file.statements]
    statements = statements.map(trans_import_2_require).flat()
    statements = statements.map(trans_export_stmt)
    statements = statements.map(trans_class_decl_2_expr)
    statements = wrap_await_stmt(statements, code)
    statements = statements.map(trans_variable_decl_2_var)
    statements = statements.map(trans_return_2_expr)
    
    if (statements.length) {
        const last_stmt  = statements[ statements.length - 1 ]
        const last_expr = get_expr_of_stmt(last_stmt)
        if (last_expr !== last_stmt)
            statements = [ ...statements, last_expr]
    }
    
    
    code = generate_code(statements)
    
    let { diagnostics, outputText } = ts.transpileModule(code, tsconfig_commonjs)
    
    if (diagnostics.length) {
        console.log(diagnostics.join('\n\n\n'))
        log_line()
    }
    
    if (print) {
        console.log(outputText)
        log_line()
    }
    
    if (fp && save)
        await fwrite(fp.replace(/\.ts(x?)$/, '.js$1'), outputText)
    
    return outputText
}


export let tsconfig: any
export let tsconfig_commonjs: any

export async function load_tsconfig () {
    const fp = `${global.ROOT}tsconfig.json`
    tsconfig = ts.parseConfigFileTextToJson(fp, await fread(fp, { print: false })).config
    tsconfig_commonjs = {
        ...tsconfig,
        compilerOptions: {
            ...tsconfig.compilerOptions,
            module: 'CommonJS',
            esModuleInterop: true,
        }
    }
}


export async function eval_ts (code: string) {
    try {
        const js = await compile_ts({ code })
        global.__ = await nvm.runInThisContext(js, 'REPL.ts')
        
        return global.__
    } catch (error) {
        console.error(error)
        return error
    }
}


// ------------------------------------ REPL
export async function repl_code (type: string, ...args: any[]) {
    console.log('-'.repeat(global.WIDTH))
    
    // --- 运行代码
    global.__ = await exports['eval_' + type](...args)
    
    log_line(global.WIDTH)
    
    if (type !== 'shell')
        console.log(inspect(global.__, { limit: INSPECTION_LIMIT }))
    
    
    console.log('\n'.repeat(4))
}


export async function start_repl () {
    // ------------ 加载库
    log_section('Shell is staring ...', { timestamp: true })
    
    // process.env.TS_NODE_FILES = true
    // require('ts-node/register/transpile-only')
    // require('ts-node/register')
    
    
    log_module_loaded('Prototype')
    
    log_module_loaded('Utils')
    
    log_module_loaded('File')
    
    log_module_loaded('Process')
    
    log_module_loaded('Net')
    
    log_section('REPL is starting', { color: 'yellow', timestamp: true })
    
    // --- prevent from exiting
    process.on('uncaughtException', error => { console.error(error) })
    
    // --- Start NodeJS REPL
    repl.start({
        prompt: '',
        replMode: repl.REPL_MODE_SLOPPY,
        useGlobal: true,
        useColors: true,
        terminal: true,
    })
    
    console.log(`${'NodeJS REPL'.pad(20)}loaded`)
    
    process.title = 'REPL'
    
    await Promise.all([
        // --- DB, Server, Webpack
        (async () => {
            // --- HTTP Server
            log_section('HTTP Server is starting', { color: 'green', timestamp: true })
            global.server = (await import('./Server')).default
            await global.server.start()
            log_section('HTTP Server started', { color: 'green', timestamp: true })
        })(),
        
        pollute_global(),
        
        load_tsconfig(),
    ])
    
    log_section('Shell started successfully', { color: 'red', timestamp: true })
}


export async function stop () {
    log_section('Shell is exiting', { color: 'red' })
    
    Object.values(fwatchers).forEach( watcher => { watcher.close() })
    
    global.server?.stop()
}

export async function exit () {
    await stop()
    await delay(1000)
    process.exit()
}


export async function pollute_global () {
    Object.assign(global, {
        __importDefault: (mod: any) => ((mod?.__esModule) ? mod : { default: mod }),
        __importStar: (mod: any) => {
            if (mod?.__esModule) return mod
            let result: { default?: any } = { }
            // eslint-disable-next-line eqeqeq, no-eq-null
            if (mod != null)
                for (let k in mod)
                    if (Object.hasOwnProperty.call(mod, k))
                        result[k] = mod[k]
            result.default = mod
            return result
        },
        exports: global
    })
    
    await Promise.all([
        import('upath'              ).then( ({ default: _default }) => { global['path'] = _default } ),
        import('cheerio'            ).then( ({ default: _default }) => { global['cheerio'] = _default } ),
        import('lodash/omit'        ).then( ({ default: _default }) => { global['omit'] = _default } ),
        import('lodash/sortBy'      ).then( ({ default: _default }) => { global['sort_by'] = _default } ),
        import('lodash/groupBy'     ).then( ({ default: _default }) => { global['group_by'] = _default } ),
        import('lodash/isRegExp'    ).then( ({ default: _default }) => { global['is_regx'] = _default } ),
        import('lodash/isString'    ).then( ({ default: _default }) => { global['is_str'] = _default } ),
        
        import('qs').then( ({ default: _default }) => { global['qs'] = _default } ),
        
        import('./Prototype'           ).then( _exports => { Object.assign(global, _exports) }),
        import('./Utils'               ).then( _exports => { Object.assign(global, _exports) }),
        import('./Process'             ).then( _exports => { Object.assign(global, _exports) }),
        import('./File'                ).then( _exports => { Object.assign(global, _exports) }),
        import('./Net'                 ).then( _exports => { Object.assign(global, _exports) }),
        import('./REPL'                ).then( _exports => { Object.assign(global, _exports) }),
    ])
    
    log_section('all modules were loaded', { color: 'green', timestamp: true })
}

