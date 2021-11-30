export function try_require (modpath: string) {
    try {
        return require(modpath)
    } catch {
        // console.error('未找到或解析错误，跳过加载：' + modpath)
        return { }
    }
}
