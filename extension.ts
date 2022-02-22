import { window, commands, Range, Position } from 'vscode'
import type { ExtensionContext } from 'vscode'

import './prototype'
import { rpc } from './net'


const my_commands = [
    {
        func: async function xshell_repl () {
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
                throw new Error(`${language_id} does not support repl`)
            
            const code = get_text('selection or line')
            
            await rpc('repl_code', [...languages_map[language_id], code], { async: true })
        },
        key: 'ctrl+enter',
        when: 'editorTextFocus'
    },
]


/** get text by selector */
function get_text (selector: 
    'all' | 
    'line' | 
    'word' |
    'selection' | 
    'selection or line' |
    'selection or all'  |
    'selection before' | 
    'selection to text start' | 
    'selection after'
) {
    const editor    = window.activeTextEditor
    const document  = editor.document
    const selection = editor.selection
    
    const text_selection = document.getText(selection)
    
    if (selector === 'selection')
        return text_selection
        
    const text_all = document.getText()
    
    if (selector === 'all')
        return text_all
        
    const text_line = document.lineAt(selection.active.line).text
        
    if (selector === 'line')
        return text_line
    
    if (selector === 'word')
        return document.getText(document.getWordRangeAtPosition(selection.active))
    
    if (selector === 'selection or all')
        return text_selection || text_all
    
    if (selector === 'selection or line')
        return text_selection || text_line
        
    
    
    const start = selection.start
    const end   = selection.end
    
    const line = document.lineAt(start.line)
    
    const line_start = new Position(start.line, 0)
    
    if (selector === 'selection before')
        return document.getText( new Range(line_start, start) )
    
    
    const line_end   = new Position(start.line, line.text.length)
    
    if (selector === 'selection after')
        return document.getText( new Range(end, line_end) )
    
    
    const line_text_start = new Position(start.line, line.firstNonWhitespaceCharacterIndex)
    if (selector === 'selection to text start')
        return document.getText(new Range(line_text_start, start)  )
}


export function activate (ctx: ExtensionContext) {
    for (const { func } of my_commands)
        ctx.subscriptions.push(
            commands.registerCommand(func.name, func)
        )
    
    console.log('xshell loaded')
}
