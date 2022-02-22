import * as types from '@babel/types'
import { PluginItem } from '@babel/core'

export let unmarkeds = []

let t = 0
let Trans = 0

function is_t (node: types.Node) {
    if (types.isCallExpression(node)) {
        // t('chtext')
        if (types.isIdentifier(node.callee) && node.callee.name === "t")
            return true
        
        // i18n.t('chtext') | i18n.__('chtext')
        if (
            types.isMemberExpression(node.callee) &&
            types.isIdentifier(node.callee.object) &&
            types.isIdentifier(node.callee.property) &&
            node.callee.object.name === "i18n" &&
            (node.callee.property.name === "t" || node.callee.property.name === '__')
        )
            return true
    }
    return false
}

function is_trans (node: types.Node) {
    // <Trans>
    return (
        types.isJSXElement(node) &&
        types.isJSXOpeningElement(node.openingElement) &&
        types.isJSXIdentifier(node.openingElement.name) &&
        node.openingElement.name.name === "Trans"
    )
}

const has_unmarked_chinese_characters = (str: string) => 
    !t && !Trans && /[\u4e00-\u9fa5]/.test(str)


export function Checker ({ filepath }) {
    return {
        CallExpression: {
            enter({ node }) {
                if (is_t(node))
                    t++
            },
            exit({ node }) {
                if (is_t(node))
                    t--
            },
        },
        JSXElement: {
            enter({ node }) {
                if (is_trans(node))
                    Trans++
            },
            exit({ node }) {
                if (is_trans(node))
                    Trans--
            },
        },
        JSXText: ({ node }) => {
            if (has_unmarked_chinese_characters(node.value))
                unmarkeds.push({ filepath, loc: node.loc, value: node.value })
        },
        StringLiteral: ({ node }) => {
            if (has_unmarked_chinese_characters(node.value))
                unmarkeds.push({ filepath, loc: node.loc, value: node.value })
        },
        TemplateElement: ({ node }) => {
            if (has_unmarked_chinese_characters(node.value.raw))
                unmarkeds.push({ filepath, loc: node.loc, value: node.value.cooked })
        },
    } as PluginItem
}
