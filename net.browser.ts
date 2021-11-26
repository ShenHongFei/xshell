export interface RequestOptions {
    method?: 'get' | 'post' | 'put' | 'head' | 'delete' | 'patch'
    
    queries?: Record<string, any>
    
    headers?: Record<string, string>
    
    body?: string | object | HTMLFormElement
    
    type?: 'application/json' | 'application/x-www-form-urlencoded' | 'multipart/form-data'
    
    cors?: boolean
    
    by?: 'fetch' | 'GM_xmlhttpRequest'
}

export interface RequestRawOptions extends RequestOptions {
    raw: true
}

/**
    - url: 可以只有 pathname 部分
    - options:
        - type: `'application/json'` 请求的 content-type 头 (如果有 body)
        - by: `window.GM_xmlhttpRequest ? 'GM_xmlhttpRequest' : 'fetch'` 发起请求所使用的底层方法
*/
export async function request (url: string | URL): Promise<string>
export async function request (url: string | URL, options: RequestRawOptions): Promise<Response>
export async function request (url: string | URL, options: RequestOptions): Promise<string>
export async function request (url: string | URL, {
    method,
    
    queries,
    
    headers,
    
    body,
    
    type = 'application/json',
    
    cors,
    
    by = window.GM_xmlhttpRequest ? 'GM_xmlhttpRequest' : 'fetch',
    
    raw,
}: RequestOptions & { raw?: boolean } = { }) {
    url = new URL(url, location.href)
    
    if (queries)
        for (const key in queries) {
            let value = queries[key]
            if (typeof value === 'boolean')
                value = value ? '1' : '0'
            url.searchParams.append(key, value)
        }
    
    if (body && !method)
        method = 'post'
    
    if (type === 'application/json' && typeof body !== 'undefined' && typeof body !== 'string')
        body = JSON.stringify(body)
    
    url = url.toString()
    
    if (by === 'fetch') {
        const options: RequestInit = {
            ... method ? { method: method.toUpperCase() } : { },
            
            ... cors ? { mode: 'cors' } : { },
            
            credentials: 'include',
            
            headers: {
                ... body ? { 'content-type': type } : { },
                ... headers,
            },
            
            ... body   ? { body: body as string } : { },
        }
        
        const response = await fetch(
            url,
            options
        )
        
        if (!response.ok)
            throw Object.assign(
                new Error(`StatusCodeError: ${response.status}`),
                { url, response, ...options }
            )
        
        if (raw)
            return response
        
        return response.text()
    }
    
    
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            ... method ? { method: (method as any).toUpperCase() } : { },
            
            url: url as string,
            
            headers: {
                ... body ? { 'content-type': type } : { },
                ... headers,
            },
            
            ... body ? { data: body as string, } : { },
            
            onload (response) {
                if (!(200 <= response.status && response.status <= 299)) {
                    reject(
                        Object.assign(
                            new Error(`StatusCodeError: ${response.status}`), 
                            { url, queries, method, headers, body, response }
                        )
                    )
                    return
                }
                
                resolve(response.responseText)
            }
        })
    })
}


/** 发起 http 请求并将响应体作为 json 解析 */
export async function request_json <T = any> (url: string, options?: RequestOptions): Promise<T> {
    const resp = await request(url, options)
    if (!resp) return
    try {
        return JSON.parse(resp)
    } catch (error) {
        console.error(resp)
        throw error
    }
}

