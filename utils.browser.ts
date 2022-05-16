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


/** 时间间隔 (milliseconds) 格式化 */
export function delta2str (delta: number) {
    // [0, 1000) ms
    if (delta < 1000)
        return `${delta} ms`
    
    // 1.123 s
    if (1000 <= delta && delta < 1000 * 60)
        return `${(delta / 1000).toFixed(1)} s`
    
    // 1 min 12 s [1 min 0s, 60 min)
    const seconds = Math.trunc(delta / 1000)
    
    if (seconds < 60 * 60)
        return `${Math.trunc(seconds / 60)} min ${seconds % 60} s`
    
    const hour = Math.trunc(seconds / 3600)
    
    return `${hour} h ${Math.trunc((seconds - 3600 * hour) / 60)} min ${seconds % 60} s`
}


/** 字符串字典序比较 */
export function strcmp (l: string, r: string) {
    if (l === r) return 0
    if (l < r)   return -1
    return 1
}

