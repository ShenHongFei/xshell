import castArray from 'lodash/castArray.js'
import trim from 'lodash/trim.js'
import _get from 'lodash/get.js'

import babel_traverse from '@babel/traverse'
const { default: traverse } = babel_traverse
import { parse } from '@babel/parser'
import * as t from '@babel/types'

import '../../prototype.js'


// import { Checker } from './checker'

/** file:///D:/0/i18next-scanner/src/parser.js */
export function mix_parse_trans_from_string_by_babel (parser) {
    parser.parseTransFromStringByBabel = function parse_trans_from_string_by_babel (
        code: string, 
        options = { }, 
        custom_handler = null,
        on_error: (callback: Function) => void 
            = () => { }
    ) {
        if (typeof options === 'function') {
            custom_handler = options
            options = { }
        }
        
        const {
            transformOptions = { }, // object
            component = this.options.trans.component, // string
            i18nKey = this.options.trans.i18nKey, // string
            defaultsKey = this.options.trans.defaultsKey, // string
            fallbackKey = this.options.trans.fallbackKey, // boolean|function
            babylon: babylon_options = this.options.trans.babylon, // object
            filepath,
        } = options as any
        
        const parseJSXElement = ({ node }) => {
            if (!node) return
            
            if (node.openingElement.name.name !== component) return
            
            
            const getLiteralValue = literal => {
                if (t.isTemplateLiteral(literal))
                    return literal.quasis.map(element => element.value.cooked).join("")
                
                return literal.value
            }
            
            const attr = castArray(node.openingElement.attributes).reduce(
                (acc, attribute) => {
                    if (
                        !t.isJSXAttribute(attribute) ||
                        !t.isJSXIdentifier(attribute.name)
                    ) return acc
                    
                    const { name } = attribute.name
                    const value = attribute.value
                    if (t.isLiteral(value))
                        acc[name] = getLiteralValue(value)
                    else if (t.isJSXExpressionContainer(value)) {
                        const expression = value.expression
                        if (t.isIdentifier(expression))
                            acc[name] = expression.name
                        else if (t.isLiteral(expression))
                            acc[name] = getLiteralValue(expression)
                        else if (t.isObjectExpression(expression)) {
                            const properties = castArray(expression.properties)
                            acc[name] = properties.reduce((obj, property) => {
                                if (!t.isObjectProperty(property)) return obj
                                if (t.isLiteral(property.value))
                                    obj[(property.key as any).name] = getLiteralValue(property.value)
                                else // Unable to get value of the property
                                    obj[(property.key as any).name] = ""
                                return obj
                            }, { })
                            /**
                            * 防止 count 被忽略，如
                            * ```jsx
                            * <Trans count={arr.length}>
                            *  一二三{{ count: arr.length }}
                            * </Trans>
                            * ```
                            */
                        } else if (name === "count")
                            acc[name] = 0
                    }
                    return acc
                },
                { }
            )
            const transKey = trim(attr[i18nKey])
            
            const defaultsString = attr[defaultsKey] || ""
            if (typeof defaultsString !== "string")
                this.log(`defaults value must be a static string, saw ${defaultsString.yellow}`)
            
            
            // https://www.i18next.com/translation-function/essentials#overview-options
            const tOptions = attr.tOptions
            const options = {
                ...tOptions,
                defaultValue: defaultsString || nodes_to_string(node.children, filepath, on_error),
                fallbackKey,
            }
            
            if (Object.prototype.hasOwnProperty.call(attr, "count"))
                options.count = Number(attr.count) || 0
            
            
            if (Object.prototype.hasOwnProperty.call(attr, "ns")) {
                if (typeof options.ns !== "string")
                    this.log(`The ns attribute must be a string, saw ${attr.ns?.yellow}`)
                    
                options.ns = attr.ns
            }
            
            if (custom_handler) {
                custom_handler(transKey, options)
                return
            }
            
            this.set(transKey, options)
        }
        
        try {
            const ast = parse(code, { ...babylon_options })
            traverse(ast, { JSXElement: parseJSXElement, })
            // traverse(ast, Checker({ filepath }))
        } catch (err) {
            on_error(() => {
                console.error('')
                const { line, column } = (err && err.loc) || { line: 1, column: 1 }
                console.error([filepath, line, column].join(":").yellow)
                console.error(`Unable to parse ${component?.blue} component.\n`.red)
                if (!filepath)
                    console.error(String(code).red)
                console.error(("    " + err.message).red)
            })
        }
        
        return this
    }
}


function nodes_to_string (nodes, filepath, onError) {
    let memo = ''
    let node_index = 0
    nodes.forEach((node, i) => {
        if (t.isJSXText(node) || t.isStringLiteral(node)) {
            const value = node.value
                .replace(/^[\r\n]+\s*/g, "") // remove leading spaces containing a leading newline character
                .replace(/[\r\n]+\s*$/g, "") // remove trailing spaces containing a leading newline character
                .replace(/[\r\n]+\s*/g, " ") // replace spaces containing a leading newline character with a single space character
                
            if (!value) return
            
            memo += value
        } else if (t.isJSXExpressionContainer(node)) {
            const { expression = { } } = node
            
            if (t.isNumericLiteral(expression))  // Numeric literal is ignored in react-i18next
                memo += ''
            if (t.isStringLiteral(expression))
                memo += expression.value
            else if (
                t.isObjectExpression(expression) &&
                t.isObjectProperty(_get(expression, 'properties[0]'))
            )
                memo += '{{' + (expression.properties[0] as any).key.name + '}}'
            else
                onError(() => {
                    const { line, column } = (node.expression && node.expression.loc.start) || { line: 1, column: 1 }
                    console.error('')
                    console.error([filepath, line, column].join(":").yellow)
                    console.error('Unsupported JSX expression. Only static values or {{interpolation}} blocks are supported.'.red)
                })
            
        } else if (node.children)
            memo += `<${node_index}>${nodes_to_string(node.children, filepath, onError)}</${node_index}>`
        
        
        node_index++
    })
    
    return memo
}

