import { Instance as Chalk } from 'chalk'

const chalk = new Chalk({ level: 2 })

const {
    red, 
    green, 
    yellow, 
    blue, 
    magenta, 
    cyan, 
    grey,
    
    redBright: red_, 
    greenBright: green_, 
    yellowBright: yellow_, 
    blueBright: blue_, 
    magentaBright: magenta_,
    cyanBright: cyan_,
    
    underline,
} = chalk

export {
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    grey,
    
    red_,
    green_,
    yellow_,
    blue_,
    magenta_,
    cyan_,
    
    underline
}
