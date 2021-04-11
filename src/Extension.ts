import { window, commands, Range, Position } from 'vscode'
import type { ExtensionContext } from 'vscode'

import './Prototype'
import { rpc } from './Net'


const my_commands = [
    {
        func: async function nodesh_repl () {
            const editor = window.activeTextEditor
            const doc = editor.document
            
            const languages_map = {
                javascript: ['ts'],
                javascriptreact: ['ts'],
                typescript: ['ts'],
                typescriptreact: ['ts'],
            }
            
            const language_id = doc.languageId
            
            if (!(language_id in languages_map))
                throw new Error(`${language_id} does not support REPL`)
            
            const code = get_text('SELECTION_OR_LINE')
            
            await rpc('repl_code', [...languages_map[language_id], code], { async: true })
        },
        key: 'ctrl+enter',
        when: 'editorTextFocus'
    },
]


/** 获取选择区域的文本，若选择为空，则根据 selector 确定 (当前 | 全部文本 | 空) */
function get_text (selector: 
    'ALL' | 
    'LINE' | 
    'WORD' |
    'SELECTION' | 
    'SELECTION_OR_LINE' |
    'SELECTION_OR_ALL'  |
    'SELECTION_BEFORE' | 
    'SELECTION_TO_TEXT_START' | 
    'SELECTION_AFTER'
) {
    const editor    = window.activeTextEditor
    const document  = editor.document
    const selection = editor.selection
    
    const text_selection = document.getText(selection)
    
    if (selector === 'SELECTION')
        return text_selection
        
    const text_all = document.getText()
    
    if (selector === 'ALL')
        return text_all
        
    const text_line = document.lineAt(selection.active.line).text
        
    if (selector === 'LINE')
        return text_line
    
    if (selector === 'WORD')
        return document.getText(document.getWordRangeAtPosition(selection.active))
    
    if (selector === 'SELECTION_OR_ALL')
        return text_selection || text_all
    
    if (selector === 'SELECTION_OR_LINE')
        return text_selection || text_line
        
    
    
    const start = selection.start
    const end   = selection.end
    
    const line = document.lineAt(start.line)
    
    const line_start = new Position(start.line, 0)
    
    if (selector === 'SELECTION_BEFORE')
        return document.getText( new Range(line_start, start) )
    
    
    const line_end   = new Position(start.line, line.text.length)
    
    if (selector === 'SELECTION_AFTER')
        return document.getText( new Range(end, line_end) )
    
    
    const line_text_start = new Position(start.line, line.firstNonWhitespaceCharacterIndex)
    if (selector === 'SELECTION_TO_TEXT_START')
        return document.getText(new Range(line_text_start, start)  )
}


export function activate (ctx: ExtensionContext) {
    my_commands.forEach( ({ func }) => {
        ctx.subscriptions.push(commands.registerCommand(func.name, func))
    })
    console.log('nodesh loaded')
}
