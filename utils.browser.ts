export async function delay (milliseconds: number) {
    return new Promise<void>( resolve => {
        setTimeout(() => {
            resolve()
        }, milliseconds)
    })
}


/** 拼接 TypedArrays 生成一个完整的 Uint8Array */
export function concat (arrays: ArrayBufferView[]) {
    let length = 0
    for (const a of arrays)
        length += a.byteLength
        
    let buf = new Uint8Array(length)
    let offset = 0
    for (const a of arrays) {
        const uint8view = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
        buf.set(uint8view, offset)
        offset += uint8view.byteLength
    }
    
    return buf
}
