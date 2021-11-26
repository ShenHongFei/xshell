import './toaster.sass'

import { delay } from './utils.browser'

export let toaster = {
    messages: [ ] as string[],
    
    state: 'IDLE' as 'IDLE' | 'SHOW',
    
    async toast (message: string) {
        this.messages.push(message)
        this.show()
    },
    
    async show () {
        if (this.state === 'SHOW') return
        this.state = 'SHOW'
        
        let div = document.createElement('div')
        div.className = 'toast'
        document.body.appendChild(div)
        
        for (let i = 0;  i < this.messages.length;  i++) {
            const message = this.messages[i]
            let span: HTMLSpanElement
            if (i === 0) {
                span = document.createElement('span')
                span.className = 'text'
                span.textContent = message
                div.appendChild(span)
            } else {
                span = div.children[0] as HTMLSpanElement
                span.textContent = message
            }
            
            div.classList.add('active')
            await delay(2 * 1000)
            div.classList.remove('active')
            await delay(500)
        }
        
        document.body.removeChild(div)
        this.messages = [ ]
        this.state = 'IDLE'
    },
}

export const toast = toaster.toast.bind(toaster) as (typeof toaster)['toast']

export default toast
