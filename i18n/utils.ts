import { fread_json } from '../file.js'

export async function try_load_dict (fp_dict: string) {
    try {
        return await fread_json(fp_dict, { print: false })
    } catch {
        // console.error('未找到或解析错误，跳过加载：' + modpath)
        return { }
    }
}
